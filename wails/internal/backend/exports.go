package backend

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

func writePDF(path string, slides []exportSlide) error {
	file, e := os.Create(path)
	if e != nil {
		return e
	}
	defer file.Close()
	offsets := []int64{0}
	var writeErr error
	write := func(text string) {
		if writeErr == nil {
			_, writeErr = io.WriteString(file, text)
		}
	}
	object := func(id int, body string) {
		offset, _ := file.Seek(0, io.SeekCurrent)
		for len(offsets) <= id {
			offsets = append(offsets, 0)
		}
		offsets[id] = offset
		write(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", id, body))
	}
	write("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
	object(1, "<< /Type /Catalog /Pages 2 0 R >>")
	kids := ""
	for i := range slides {
		kids += fmt.Sprintf("%d 0 R ", 3+i*3)
	}
	object(2, fmt.Sprintf("<< /Type /Pages /Count %d /Kids [%s] >>", len(slides), kids))
	for i, slide := range slides {
		raw, e := os.ReadFile(slide.ImagePath)
		if e != nil {
			return e
		}
		img, e := decodeImage(raw)
		if e != nil {
			return e
		}
		b := img.Bounds()
		opaque := image.NewRGBA(b)
		draw.Draw(opaque, b, &image.Uniform{color.White}, image.Point{}, draw.Src)
		draw.Draw(opaque, b, img, b.Min, draw.Over)
		var compressed bytes.Buffer
		if e = jpeg.Encode(&compressed, opaque, &jpeg.Options{Quality: 95}); e != nil {
			return e
		}
		pageID, imageID, contentID := 3+i*3, 4+i*3, 5+i*3
		width, height := 960., 960.*float64(b.Dy())/float64(b.Dx())
		object(pageID, fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.3f %.3f] /Resources << /XObject << /Im1 %d 0 R >> >> /Contents %d 0 R >>", width, height, imageID, contentID))
		body := fmt.Sprintf("<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n", b.Dx(), b.Dy(), compressed.Len()) + compressed.String() + "\nendstream"
		object(imageID, body)
		commands := fmt.Sprintf("q %.3f 0 0 %.3f 0 0 cm /Im1 Do Q\n", width, height)
		object(contentID, fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(commands), commands))
	}
	xref, _ := file.Seek(0, io.SeekCurrent)
	write(fmt.Sprintf("xref\n0 %d\n0000000000 65535 f \n", len(offsets)))
	for _, offset := range offsets[1:] {
		write(fmt.Sprintf("%010d 00000 n \n", offset))
	}
	write(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xref))
	if writeErr != nil {
		return writeErr
	}
	return file.Sync()
}
func (s *Server) exportSlides(pages []Object) ([]exportSlide, error) {
	slides := []exportSlide{}
	for _, p := range pages {
		path, e := s.uploadPath(str(p, "_image"))
		if e != nil {
			return nil, e
		}
		slides = append(slides, exportSlide{ImagePath: path, Narration: str(p, "narration_text")})
	}
	return slides, nil
}
func (s *Server) exportResult(pid, name string) Object {
	relative := pid + "/exports/" + name
	return Object{"download_url": "/files/" + relative, "filename": name}
}
func (s *Server) exportFile(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	ids := []string{}
	if q := r.URL.Query().Get("page_ids"); q != "" {
		ids = strings.Split(q, ",")
	}
	pages, e := s.selectedPages(str(p, "project_id"), ids, true)
	if e != nil {
		return nil, e
	}
	slides, e := s.exportSlides(pages)
	if e != nil {
		return nil, e
	}
	kind := r.PathValue("format")
	if !oneOf(kind, "pptx", "pdf", "images") {
		return nil, ErrNotFound
	}
	ext := "." + kind
	if kind == "images" {
		ext = ".zip"
	}
	name := exportName(r.URL.Query().Get("filename"), ext)
	pid := str(p, "project_id")
	path, e := s.uploadPath(pid + "/exports/" + name)
	if e != nil {
		return nil, e
	}
	if e = os.MkdirAll(filepath.Dir(path), 0700); e != nil {
		return nil, e
	}
	e = withSlot(r.Context(), s.heavySlot, func() error {
		tmp, e := os.CreateTemp(filepath.Dir(path), ".export-*")
		if e != nil {
			return e
		}
		temporary := tmp.Name()
		tmp.Close()
		defer os.Remove(temporary)
		switch kind {
		case "pptx":
			transitions := []string{}
			if q := r.URL.Query().Get("transition_effects"); q != "" {
				transitions = strings.Split(q, ",")
			}
			e = writePPTX(temporary, slides, str(p, "image_aspect_ratio"), transitions)
		case "pdf":
			e = writePDF(temporary, slides)
		case "images":
			var f *os.File
			f, e = os.Create(temporary)
			if e != nil {
				return e
			}
			archive := zip.NewWriter(f)
			for i, slide := range slides {
				var input *os.File
				input, e = os.Open(slide.ImagePath)
				if e != nil {
					break
				}
				var entry io.Writer
				entry, e = archive.Create(fmt.Sprintf("slide-%03d.png", i+1))
				if e == nil {
					_, e = io.Copy(entry, input)
				}
				input.Close()
				if e != nil {
					break
				}
			}
			closeErr := archive.Close()
			f.Close()
			if e == nil {
				e = closeErr
			}
		}
		if e != nil {
			return e
		}
		return os.Rename(temporary, path)
	})
	return s.exportResult(pid, name), e
}
func (s *Server) exportList(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	root, e := s.uploadPath(pid + "/exports")
	if e != nil {
		return nil, e
	}
	entries, e := os.ReadDir(root)
	if os.IsNotExist(e) {
		return Object{"files": []Object{}}, nil
	}
	if e != nil {
		return nil, e
	}
	out := []Object{}
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		info, e := entry.Info()
		if e != nil {
			return nil, e
		}
		item := s.exportResult(pid, entry.Name())
		item["type"] = strings.TrimPrefix(filepath.Ext(entry.Name()), ".")
		if filepath.Ext(entry.Name()) == ".mp4" {
			item["type"] = "video"
		}
		if filepath.Ext(entry.Name()) == ".zip" {
			item["type"] = "images"
		}
		item["size"] = info.Size()
		item["modified_at"] = info.ModTime().UTC().Format("2006-01-02T15:04:05Z")
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return str(out[i], "modified_at") > str(out[j], "modified_at") })
	return Object{"files": out}, nil
}
func (s *Server) deleteExport(w http.ResponseWriter, r *http.Request) (any, error) {
	if _, e := s.project(r); e != nil {
		return nil, e
	}
	name := r.PathValue("filename")
	if filepath.Base(name) != name || strings.Contains(name, "\\") {
		return nil, bad("잘못된 파일 이름입니다.")
	}
	path, e := s.uploadPath(r.PathValue("project") + "/exports/" + name)
	if e != nil {
		return nil, e
	}
	e = os.Remove(path)
	if os.IsNotExist(e) {
		return nil, ErrNotFound
	}
	return Object{"deleted": e == nil, "filename": name}, e
}
func (s *Server) exportEditable(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	pages, e := s.selectedPages(str(p, "project_id"), stringsOf(d["page_ids"]), true)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	task, e := s.enqueue(pid, "EXPORT_EDITABLE_PPTX", str(d, "client_task_id"), func(ctx context.Context, t *Task) error {
		return withSlot(ctx, s.heavySlot, func() error {
			folder, e := os.MkdirTemp("", "sola-editable-*")
			if e != nil {
				return e
			}
			defer os.RemoveAll(folder)
			slides, e := s.exportSlides(pages)
			if e != nil {
				return e
			}
			warnings := []Object{}
			for i := range slides {
				t.Progress(Object{"total": len(slides), "completed": i, "stage": "ocr", "message": fmt.Sprintf("슬라이드 %d 텍스트 추출", i+1)})
				lines, e := s.ocr(ctx, slides[i].ImagePath)
				if e != nil {
					if boolean(p, "export_allow_partial") {
						warnings = append(warnings, Object{"page_id": pages[i]["page_id"], "message": e.Error()})
						continue
					}
					return e
				}
				raw, e := os.ReadFile(slides[i].ImagePath)
				if e != nil {
					return e
				}
				img, e := decodeImage(raw)
				if e != nil {
					return e
				}
				boxes := []image.Rectangle{}
				colours := []string{}
				for _, line := range lines {
					boxes = append(boxes, image.Rect(line.X-2, line.Y-2, line.X+line.W+2, line.Y+line.H+2))
					colours = append(colours, textColour(img, line))
				}
				slides[i].Width, slides[i].Height = img.Bounds().Dx(), img.Bounds().Dy()
				if boolean(p, "enable_icon_subject_extraction") {
					graphics, regions, err := s.extractGraphics(ctx, slides[i].ImagePath, folder, i, RestoreRegions(img, boxes))
					if err != nil {
						if !boolean(p, "export_allow_partial") {
							return err
						}
						warnings = append(warnings, Object{"page_id": pages[i]["page_id"], "message": err.Error()})
					} else {
						slides[i].Graphics = graphics
						boxes = append(boxes, regions...)
					}
				}
				if len(boxes) > 0 {
					background := filepath.Join(folder, fmt.Sprintf("background-%d.png", i))
					if str(p, "export_inpaint_method") == "generative" {
						var cleaned []byte
						e = withSlot(ctx, s.imageSlot, func() error {
							var err error
							cleaned, err = s.Azure.Image(ctx, "Remove only the visible text in these rectangles, reconstructing the background naturally. Preserve every non-text element and canvas dimensions. Rectangles in original pixels: "+jsonText(boxes), str(p, "image_aspect_ratio"), str(s.preferences(), "image_resolution"), str(s.preferences(), "image_quality"), []string{slides[i].ImagePath})
							return err
						})
						if e == nil {
							e = atomicFile(background, cleaned)
						}
					} else {
						e = writePNG(background, RestoreRegions(img, boxes))
					}
					if e != nil {
						return e
					}
					slides[i].ImagePath = background
				}
				slides[i].Lines = lines
				slides[i].TextColours = colours
				t.Progress(Object{"completed": i + 1, "total": len(slides), "warnings": warnings})
			}
			name := exportName(str(d, "filename"), ".pptx")
			target, _ := s.uploadPath(pid + "/exports/" + name)
			if e = os.MkdirAll(filepath.Dir(target), 0700); e != nil {
				return e
			}
			temporary := filepath.Join(folder, "output.pptx")
			if e = writePPTX(temporary, slides, str(p, "image_aspect_ratio"), stringsOf(d["transition_effects"])); e != nil {
				return e
			}
			if e = copyFile(temporary, target); e != nil {
				return e
			}
			result := s.exportResult(pid, name)
			result["warnings"] = warnings
			result["method"] = "local_ocr"
			t.Progress(result)
			return nil
		})
	})
	return accepted(task), e
}
func copyFile(from, to string) error {
	input, e := os.Open(from)
	if e != nil {
		return e
	}
	defer input.Close()
	if e = os.MkdirAll(filepath.Dir(to), 0700); e != nil {
		return e
	}
	output, e := os.CreateTemp(filepath.Dir(to), ".save-*")
	if e != nil {
		return e
	}
	name := output.Name()
	defer os.Remove(name)
	_, e = io.Copy(output, input)
	if e == nil {
		e = output.Sync()
	}
	closeErr := output.Close()
	if e != nil {
		return e
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, to)
}
func (s *Server) exportVideo(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	if e = s.Config.configured("tts"); e != nil {
		return nil, e
	}
	pages, e := s.selectedPages(str(p, "project_id"), stringsOf(d["page_ids"]), true)
	if e != nil {
		return nil, e
	}
	if len(pages) > 50 {
		return nil, bad("발표 영상은 최대 50슬라이드입니다.")
	}
	voice := str(d, "voice")
	if voice == "" {
		voice = "alloy"
	}
	speed := 1.
	if value, ok := d["speed"].(float64); ok {
		speed = value
	}
	pid := str(p, "project_id")
	task, e := s.enqueue(pid, "EXPORT_VIDEO", str(d, "client_task_id"), func(ctx context.Context, t *Task) error {
		return withSlot(ctx, s.heavySlot, func() error {
			folder, e := os.MkdirTemp("", "sola-video-*")
			if e != nil {
				return e
			}
			defer os.RemoveAll(folder)
			var list strings.Builder
			for i, page := range pages {
				if strings.TrimSpace(str(page, "narration_text")) == "" {
					if value, ok := d["generate_narration"]; ok && value == false {
						return bad("발표 스크립트를 입력하세요.")
					}
					page, e = s.narrate(ctx, p, page, Object{})
					if e != nil {
						return e
					}
				}
				audio := filepath.Join(folder, fmt.Sprintf("audio-%03d.mp3", i))
				t.Progress(Object{"total": len(pages), "completed": i, "stage": "tts", "message": fmt.Sprintf("슬라이드 %d 음성 생성", i+1)})
				if e = s.Azure.Speech(ctx, str(page, "narration_text"), voice, speed, audio); e != nil {
					return e
				}
				durationText, e := runTool(ctx, s.Config.FFprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio)
				if e != nil {
					return e
				}
				duration, e := strconv.ParseFloat(strings.TrimSpace(durationText), 64)
				if e != nil || duration <= 0 || duration > 900 {
					return bad("생성된 음성 길이를 확인할 수 없거나 15분을 초과합니다.")
				}
				imagePath, _ := s.uploadPath(str(page, "_image"))
				clipName := fmt.Sprintf("clip-%03d.mp4", i)
				clip := filepath.Join(folder, clipName)
				t.Progress(Object{"stage": "video", "message": fmt.Sprintf("슬라이드 %d 영상 인코딩", i+1)})
				_, e = runTool(ctx, s.Config.FFmpeg, "-hide_banner", "-loglevel", "error", "-y", "-threads", "1", "-filter_threads", "1", "-loop", "1", "-framerate", "24", "-i", imagePath, "-i", audio, "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1", "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k", "-t", fmt.Sprintf("%.3f", duration+.25), "-shortest", clip)
				if e != nil {
					return e
				}
				fmt.Fprintf(&list, "file '%s'\n", clipName)
				os.Remove(audio)
				t.Progress(Object{"completed": i + 1, "total": len(pages)})
			}
			manifest := filepath.Join(folder, "clips.txt")
			if e = os.WriteFile(manifest, []byte(list.String()), 0600); e != nil {
				return e
			}
			name := exportName(str(d, "filename"), ".mp4")
			target, _ := s.uploadPath(pid + "/exports/" + name)
			if e = os.MkdirAll(filepath.Dir(target), 0700); e != nil {
				return e
			}
			temporary := filepath.Join(folder, "presentation.mp4")
			_, e = runTool(ctx, s.Config.FFmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "1", "-i", manifest, "-c", "copy", "-movflags", "+faststart", temporary)
			if e != nil {
				return e
			}
			if e = copyFile(temporary, target); e != nil {
				return e
			}
			t.Progress(s.exportResult(pid, name))
			return nil
		})
	})
	return accepted(task), e
}
