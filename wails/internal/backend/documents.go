package backend

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type limitedOutput struct {
	bytes.Buffer
	limit int
}

func (b *limitedOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.limit - b.Len()
	if remaining > 0 {
		_, _ = b.Buffer.Write(p[:min(remaining, n)])
	}
	return n, nil
}
func runTool(ctx context.Context, executable string, args ...string) (string, error) {
	path, e := exec.LookPath(executable)
	if e != nil {
		return "", fmt.Errorf("로컬 도구 %s을(를) 찾을 수 없습니다. 데스크톱 설치 안내에서 필요한 도구를 설치하세요.", filepath.Base(executable))
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = append(os.Environ(), "OMP_THREAD_LIMIT=1", "OPENBLAS_NUM_THREADS=1")
	out := &limitedOutput{limit: 8 << 20}
	stderr := &limitedOutput{limit: 8192}
	cmd.Stdout = out
	cmd.Stderr = stderr
	cmd.WaitDelay = 2 * time.Second
	if e = cmd.Run(); e != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("%s 작업 시간이 초과되었거나 취소되었습니다: %w", filepath.Base(path), ctx.Err())
		}
		return "", fmt.Errorf("%s 실행 실패: %s", filepath.Base(path), strings.TrimSpace(stderr.String()))
	}
	return out.String(), nil
}
func (s *Server) toolHealth(ctx context.Context) (Object, error) {
	out := Object{}
	for name, path := range map[string]string{"tesseract": s.Config.Tesseract, "ffmpeg": s.Config.FFmpeg, "ffprobe": s.Config.FFprobe, "pdftotext": s.Config.PDFText, "pdftoppm": s.Config.PDFRender, "libreoffice": s.Config.Office} {
		resolved, e := exec.LookPath(path)
		out[name] = Object{"available": e == nil, "path": resolved}
	}
	languages, e := runTool(ctx, s.Config.Tesseract, "--list-langs")
	if e != nil {
		return out, e
	}
	languages = strings.ReplaceAll(languages, "\r\n", "\n")
	out["languages"] = strings.Fields(languages)
	for _, lang := range strings.Split(s.Config.OCRLanguages, "+") {
		if !strings.Contains("\n"+languages+"\n", "\n"+lang+"\n") {
			return out, fmt.Errorf("Tesseract %s 언어 데이터가 없습니다.", lang)
		}
	}
	return out, nil
}
func (s *Server) ocr(ctx context.Context, path string) ([]OCRLine, error) {
	tsv, e := runTool(ctx, s.Config.Tesseract, path, "stdout", "-l", s.Config.OCRLanguages, "--psm", "3", "tsv")
	if e != nil {
		return nil, e
	}
	reader := csv.NewReader(strings.NewReader(tsv))
	reader.Comma = '\t'
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	_, _ = reader.Read()
	lines := []OCRLine{}
	indices := map[string]int{}
	for {
		row, e := reader.Read()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, e
		}
		if len(row) < 12 || row[0] != "5" || strings.TrimSpace(row[11]) == "" {
			continue
		}
		value := func(index int) int { n, _ := strconv.Atoi(row[index]); return n }
		confidence, _ := strconv.ParseFloat(row[10], 64)
		if confidence < 20 {
			continue
		}
		word := OCRLine{strings.TrimSpace(row[11]), value(6), value(7), value(8), value(9), confidence}
		key := strings.Join(row[1:5], "/")
		if idx, ok := indices[key]; ok {
			line := &lines[idx]
			right, bottom := max(line.X+line.W, word.X+word.W), max(line.Y+line.H, word.Y+word.H)
			line.X = min(line.X, word.X)
			line.Y = min(line.Y, word.Y)
			line.W = right - line.X
			line.H = bottom - line.Y
			line.Text += " " + word.Text
		} else {
			indices[key] = len(lines)
			lines = append(lines, word)
		}
	}
	return lines, nil
}
func (s *Server) officeConvert(ctx context.Context, path, format, folder string) (string, error) {
	profile, e := os.MkdirTemp("", "sola-office-*")
	if e != nil {
		return "", e
	}
	defer os.RemoveAll(profile)
	profileURL := fileURI(profile, "")
	if _, e = runTool(ctx, s.Config.Office, "-env:UserInstallation="+profileURL, "--headless", "--convert-to", format, "--outdir", folder, path); e != nil {
		return "", e
	}
	target := filepath.Join(folder, strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))+"."+format)
	if _, e = os.Stat(target); e != nil {
		return "", errors.New("LibreOffice 변환 결과를 찾을 수 없습니다")
	}
	return target, nil
}
func (s *Server) withPDF(ctx context.Context, path string, fn func(string) error) error {
	if strings.EqualFold(filepath.Ext(path), ".pdf") {
		return fn(path)
	}
	folder, e := os.MkdirTemp("", "sola-convert-*")
	if e != nil {
		return e
	}
	defer os.RemoveAll(folder)
	pdf, e := s.officeConvert(ctx, path, "pdf", folder)
	if e != nil {
		return e
	}
	return fn(pdf)
}
func (s *Server) renderPDF(ctx context.Context, path string, fn func(int, string) error) error {
	return s.withPDF(ctx, path, func(pdf string) error {
		folder, e := os.MkdirTemp("", "sola-pages-*")
		if e != nil {
			return e
		}
		defer os.RemoveAll(folder)
		// Render one page at a time to bound raster memory and disk usage.
		for page := 1; page <= s.Config.MaxPages+1; page++ {
			prefix := filepath.Join(folder, "page")
			_, e = runTool(ctx, s.Config.PDFRender, "-f", strconv.Itoa(page), "-l", strconv.Itoa(page), "-singlefile", "-scale-to", "2048", "-png", pdf, prefix)
			if e != nil {
				if page > 1 && (strings.Contains(e.Error(), "Wrong page range") || strings.Contains(e.Error(), "first page") || strings.Contains(e.Error(), "Invalid page count")) {
					return nil
				}
				return e
			}
			if page > s.Config.MaxPages {
				return bad("문서는 최대 100페이지까지 지원합니다.")
			}
			if e = fn(page, prefix+".png"); e != nil {
				return e
			}
			os.Remove(prefix + ".png")
		}
		return nil
	})
}
func zipText(path string) (string, error) {
	archive, e := zip.OpenReader(path)
	if e != nil {
		return "", e
	}
	defer archive.Close()
	if len(archive.File) > 10000 {
		return "", bad("문서의 내부 파일 수가 너무 많습니다.")
	}
	if strings.EqualFold(filepath.Ext(path), ".xlsx") {
		return spreadsheetText(archive)
	}
	files := append([]*zip.File{}, archive.File...)
	sort.Slice(files, func(i, j int) bool { return naturalName(files[i].Name) < naturalName(files[j].Name) })
	var result strings.Builder
	var total uint64
	for _, file := range files {
		wanted := file.Name == "word/document.xml" || strings.HasPrefix(file.Name, "ppt/slides/slide") && strings.HasSuffix(file.Name, ".xml") || file.Name == "xl/sharedStrings.xml" || strings.HasPrefix(file.Name, "xl/worksheets/sheet") && strings.HasSuffix(file.Name, ".xml")
		if !wanted {
			continue
		}
		total += file.UncompressedSize64
		if total > 32<<20 {
			return "", bad("압축을 해제한 문서가 너무 큽니다.")
		}
		reader, e := file.Open()
		if e != nil {
			return "", e
		}
		decoder := xml.NewDecoder(io.LimitReader(reader, 16<<20))
		result.WriteString("\n\n")
		for {
			token, e := decoder.Token()
			if e == io.EOF {
				break
			}
			if e != nil {
				reader.Close()
				return "", e
			}
			switch t := token.(type) {
			case xml.StartElement:
				if t.Name.Local == "t" || t.Name.Local == "v" {
					var text string
					if e = decoder.DecodeElement(&text, &t); e != nil {
						reader.Close()
						return "", e
					}
					result.WriteString(text)
					result.WriteByte(' ')
				}
			case xml.EndElement:
				if oneOf(t.Name.Local, "p", "row", "si") {
					result.WriteByte('\n')
				}
			}
		}
		reader.Close()
	}
	return result.String(), nil
}
func naturalName(name string) string {
	var out strings.Builder
	for i := 0; i < len(name); {
		if name[i] >= '0' && name[i] <= '9' {
			j := i
			for j < len(name) && name[j] >= '0' && name[j] <= '9' {
				j++
			}
			n, _ := strconv.Atoi(name[i:j])
			fmt.Fprintf(&out, "%09d", n)
			i = j
		} else {
			out.WriteByte(name[i])
			i++
		}
	}
	return out.String()
}
func (s *Server) parseDocument(ctx context.Context, path string) (string, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".txt", ".md", ".csv":
		raw, e := os.ReadFile(path)
		if len(raw) > 8<<20 {
			return "", bad("텍스트 문서는 최대 8MB입니다.")
		}
		return string(raw), e
	case ".pptx", ".docx", ".xlsx":
		return zipText(path)
	case ".ppt", ".xls":
		folder, e := os.MkdirTemp("", "sola-office-*")
		if e != nil {
			return "", e
		}
		defer os.RemoveAll(folder)
		format := "pptx"
		if ext == ".xls" {
			format = "xlsx"
		}
		converted, e := s.officeConvert(ctx, path, format, folder)
		if e != nil {
			return "", e
		}
		return zipText(converted)
	case ".pdf":
		text, e := runTool(ctx, s.Config.PDFText, "-layout", path, "-")
		if e != nil {
			return "", e
		}
		pages := strings.Split(text, "\f")
		needsOCR := strings.TrimSpace(text) == ""
		for _, p := range pages[:max(0, len(pages)-1)] {
			if len(strings.TrimSpace(p)) < 10 {
				needsOCR = true
			}
		}
		if !needsOCR {
			return text, nil
		}
		var result strings.Builder
		e = s.renderPDF(ctx, path, func(index int, image string) error {
			if index <= len(pages) && len(strings.TrimSpace(pages[index-1])) >= 10 {
				result.WriteString(pages[index-1])
			} else {
				lines, e := s.ocr(ctx, image)
				if e != nil {
					return e
				}
				for _, line := range lines {
					result.WriteString(line.Text + "\n")
				}
			}
			result.WriteString("\n\n")
			return nil
		})
		return result.String(), e
	}
	return "", bad("지원하지 않는 문서 형식입니다.")
}
func (s *Server) parseReference(ref Object) (Object, error) {
	id := str(ref, "id")
	return s.enqueue(str(ref, "project_id"), "PARSE_REFERENCE", "", func(ctx context.Context, t *Task) error {
		_, _ = s.Store.Update("reference", id, func(o Object) error { o["parse_status"] = "parsing"; return nil })
		path, e := s.uploadPath(str(ref, "_file"))
		var text string
		if e == nil {
			e = withSlot(ctx, s.heavySlot, func() error { var err error; text, err = s.parseDocument(ctx, path); return err })
		}
		_, saveErr := s.Store.Update("reference", id, func(o Object) error {
			if e != nil {
				o["parse_status"] = "failed"
				o["error_message"] = s.Azure.safeError(e).Error()
			} else {
				o["parse_status"] = "completed"
				o["markdown_content"] = text
				o["error_message"] = nil
			}
			return nil
		})
		if e != nil {
			return e
		}
		return saveErr
	})
}
func (s *Server) referenceUpload(w http.ResponseWriter, r *http.Request) (any, error) {
	relative, name, e := s.upload(r, "file", "reference-files", false)
	if e != nil {
		return nil, e
	}
	pid := r.FormValue("project_id")
	if pid == "none" {
		pid = ""
	}
	if pid != "" {
		if _, e = s.Store.Get("project", pid); e != nil {
			return nil, e
		}
	}
	path, _ := s.uploadPath(relative)
	info, e := os.Stat(path)
	if e != nil {
		return nil, e
	}
	ref := Object{"id": uid(), "project_id": pid, "filename": name, "file_size": info.Size(), "file_type": strings.TrimPrefix(filepath.Ext(relative), "."), "_file": relative, "parse_status": "pending", "markdown_content": nil, "error_message": nil, "created_at": now(), "updated_at": now()}
	if e = s.Store.Put("reference", str(ref, "id"), pid, 0, ref); e != nil {
		return nil, e
	}
	_, e = s.parseReference(ref)
	return created(Object{"file": ref}), e
}
func (s *Server) referenceAction(w http.ResponseWriter, r *http.Request) (any, error) {
	ref, e := s.Store.Get("reference", r.PathValue("id"))
	if e != nil {
		return nil, e
	}
	if r.Method == "DELETE" {
		path, _ := s.uploadPath(str(ref, "_file"))
		if e = s.Store.Delete("reference", str(ref, "id")); e != nil {
			return nil, e
		}
		os.Remove(path)
		return Object{}, nil
	}
	switch {
	case strings.HasSuffix(r.URL.Path, "/parse"):
		_, e = s.parseReference(ref)
	case strings.HasSuffix(r.URL.Path, "/associate"):
		d, err := payload(r)
		if err != nil {
			return nil, err
		}
		pid := str(d, "project_id")
		if _, err = s.Store.Get("project", pid); err != nil {
			return nil, err
		}
		ref["project_id"] = pid
		e = s.Store.Put("reference", str(ref, "id"), pid, 0, ref)
	case strings.HasSuffix(r.URL.Path, "/dissociate"):
		ref["project_id"] = ""
		e = s.Store.Put("reference", str(ref, "id"), "", 0, ref)
	}
	return Object{"file": ref}, e
}
func (s *Server) renovation(w http.ResponseWriter, r *http.Request) (any, error) {
	relative, name, e := s.upload(r, "file", "renovation-inputs", false)
	if e != nil {
		return nil, e
	}
	if !oneOf(filepath.Ext(relative), ".pdf", ".pptx", ".ppt") {
		return nil, bad("PDF 또는 PowerPoint 파일을 업로드하세요.")
	}
	p, e := s.newProject(Object{"creation_type": "ppt_renovation", "idea_prompt": name, "template_style": r.FormValue("template_style")})
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	keep := r.FormValue("keep_layout") == "true"
	path, _ := s.uploadPath(relative)
	task, e := s.enqueue(pid, "PPT_RENOVATION", "", func(ctx context.Context, t *Task) error {
		return withSlot(ctx, s.heavySlot, func() error {
			return s.renderPDF(ctx, path, func(index int, imagePath string) error {
				raw, e := os.ReadFile(imagePath)
				if e != nil {
					return e
				}
				text, e := s.text(ctx, "Describe this slide for faithful reconstruction. Return JSON with title, points (array), description_text (exact visible content and layout), narration_text (Korean speaker script).", []string{imagePath}, nil)
				if e != nil {
					return e
				}
				var data Object
				if e = extractJSON(text, &data); e != nil {
					return e
				}
				page := s.newPage(pid, data, index-1)
				setDescription(page, str(data, "description_text"))
				if e = s.Store.Put("page", str(page, "page_id"), pid, index-1, page); e != nil {
					return e
				}
				if _, e = s.saveImage(pid, str(page, "page_id"), raw); e != nil {
					return e
				}
				if keep {
					asset, e := s.newAsset(pid, raw, "pdf_split", fmt.Sprintf("원본 %d", index))
					if e != nil {
						return e
					}
					_, e = s.Store.Update("page", str(page, "page_id"), func(o Object) error {
						o["template_asset_id"] = asset["id"]
						o["template_selection_source"] = "manual"
						return nil
					})
					if e != nil {
						return e
					}
				}
				t.Progress(Object{"completed": index, "page_count": index})
				return nil
			})
		})
	})
	if e != nil {
		return nil, e
	}
	task["project_id"] = pid
	task["page_count"] = 0
	return accepted(task), nil
}

// Spreadsheet cell references and shared-string indices are resolved locally.
func spreadsheetText(archive *zip.ReadCloser) (string, error) {
	read := func(name string, target any) error {
		for _, file := range archive.File {
			if file.Name != name {
				continue
			}
			if file.UncompressedSize64 > 16<<20 {
				return bad("스프레드시트 XML이 너무 큽니다.")
			}
			reader, e := file.Open()
			if e != nil {
				return e
			}
			defer reader.Close()
			return xml.NewDecoder(io.LimitReader(reader, 16<<20)).Decode(target)
		}
		return os.ErrNotExist
	}
	type run struct {
		Text string `xml:"t"`
	}
	type richText struct {
		Text string `xml:"t"`
		Runs []run  `xml:"r"`
	}
	plain := func(t richText) string {
		out := t.Text
		for _, r := range t.Runs {
			out += r.Text
		}
		return out
	}
	var shared struct {
		Items []richText `xml:"si"`
	}
	e := read("xl/sharedStrings.xml", &shared)
	if e != nil && !os.IsNotExist(e) {
		return "", e
	}
	files := []string{}
	for _, file := range archive.File {
		if strings.HasPrefix(file.Name, "xl/worksheets/sheet") && strings.HasSuffix(file.Name, ".xml") {
			files = append(files, file.Name)
		}
	}
	sort.Slice(files, func(i, j int) bool { return naturalName(files[i]) < naturalName(files[j]) })
	var out strings.Builder
	for _, name := range files {
		var sheet struct {
			Rows []struct {
				Cells []struct {
					Ref    string   `xml:"r,attr"`
					Type   string   `xml:"t,attr"`
					Value  string   `xml:"v"`
					Inline richText `xml:"is"`
				} `xml:"c"`
			} `xml:"sheetData>row"`
		}
		if e = read(name, &sheet); e != nil {
			return "", e
		}
		out.WriteString("\n## " + filepath.Base(name) + "\n")
		for _, row := range sheet.Rows {
			for _, cell := range row.Cells {
				value := cell.Value
				if cell.Type == "s" {
					index, e := strconv.Atoi(value)
					if e != nil || index < 0 || index >= len(shared.Items) {
						return "", bad("스프레드시트 문자열 참조가 올바르지 않습니다.")
					}
					value = plain(shared.Items[index])
				} else if cell.Type == "inlineStr" {
					value = plain(cell.Inline)
				}
				out.WriteString(cell.Ref + ": " + value + "\t")
			}
			out.WriteByte('\n')
		}
		if out.Len() > 8<<20 {
			return "", bad("스프레드시트 내용이 8MB를 초과합니다.")
		}
	}
	return out.String(), nil
}
