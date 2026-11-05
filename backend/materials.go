package backend

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	xdraw "golang.org/x/image/draw"
)

func (s *Server) materialProject(raw string) (string, error) {
	if oneOf(raw, "", "none", "global") {
		return "", nil
	}
	_, e := s.Store.Get("project", raw)
	return raw, e
}
func (s *Server) newMaterial(pid, relative, name, prompt string) (Object, error) {
	id := uid()
	m := Object{"id": id, "project_id": pid, "filename": filepath.Base(relative), "original_filename": name, "relative_path": relative, "url": "/files/" + relative, "caption": nil, "prompt": prompt, "created_at": now(), "updated_at": now()}
	return m, s.Store.Put("material", id, pid, 0, m)
}
func (s *Server) materialList(w http.ResponseWriter, r *http.Request) (any, error) {
	pid := r.PathValue("project")
	if pid == "" {
		pid = r.URL.Query().Get("project_id")
	}
	if pid == "all" || pid == "" {
		pid = "*"
	} else {
		var e error
		pid, e = s.materialProject(pid)
		if e != nil {
			return nil, e
		}
	}
	all, e := s.Store.List("material", pid)
	sortedRecent(all)
	return Object{"materials": all, "total": len(all)}, e
}
func (s *Server) materialUpload(w http.ResponseWriter, r *http.Request) (any, error) {
	if e := s.form(r); e != nil {
		return nil, e
	}
	pid := r.PathValue("project")
	if pid == "" {
		pid = r.FormValue("project_id")
	}
	pid, e := s.materialProject(pid)
	if e != nil {
		return nil, e
	}
	field := "file"
	if len(r.MultipartForm.File[field]) == 0 {
		field = "image"
	}
	relative, name, e := s.upload(r, field, "materials", true)
	if e != nil {
		return nil, e
	}
	m, e := s.newMaterial(pid, relative, name, "")
	return created(m), e
}
func (s *Server) materialAction(w http.ResponseWriter, r *http.Request) (any, error) {
	var m Object
	var e error
	if strings.HasSuffix(r.URL.Path, "/by-url") {
		all, err := s.Store.List("material", "*")
		if err != nil {
			return nil, err
		}
		target := strings.Split(r.URL.Query().Get("url"), "?")[0]
		for _, item := range all {
			if str(item, "url") == target {
				m = item
				break
			}
		}
		if m == nil {
			return nil, ErrNotFound
		}
	} else {
		m, e = s.Store.Get("material", r.PathValue("id"))
		if e != nil {
			return nil, e
		}
	}
	id := str(m, "id")
	if r.Method == "DELETE" {
		path, e := s.uploadPath(str(m, "relative_path"))
		if e != nil {
			return nil, e
		}
		if e = s.Store.Delete("material", id); e != nil {
			return nil, e
		}
		os.Remove(path)
		return Object{}, nil
	}
	if str(m, "caption") == "" {
		path, e := s.uploadPath(str(m, "relative_path"))
		if e != nil {
			return nil, e
		}
		caption, e := s.text(r.Context(), "Describe this image accurately in concise Korean. Return only the description.", []string{path}, nil)
		if e != nil {
			return nil, e
		}
		m, e = s.Store.Update("material", id, func(o Object) error { o["caption"] = caption; return nil })
		if e != nil {
			return nil, e
		}
	}
	if strings.HasSuffix(r.URL.Path, "/caption") {
		return Object{"caption": m["caption"]}, nil
	}
	return m, nil
}
func (s *Server) materialAssociate(w http.ResponseWriter, r *http.Request) (any, error) {
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	pid, e := s.materialProject(str(d, "project_id"))
	if e != nil {
		return nil, e
	}
	urls := stringsOf(d["material_urls"])
	all, e := s.Store.List("material", "*")
	if e != nil {
		return nil, e
	}
	ids := []string{}
	for _, m := range all {
		if oneOf(str(m, "url"), urls...) {
			m["project_id"] = pid
			if e = s.Store.Put("material", str(m, "id"), pid, 0, m); e != nil {
				return nil, e
			}
			ids = append(ids, str(m, "id"))
		}
	}
	return Object{"updated_ids": ids, "count": len(ids)}, nil
}
func (s *Server) materialsZip(w http.ResponseWriter, r *http.Request) {
	d, e := payload(r)
	if e != nil {
		failure(w, e)
		return
	}
	ids := stringsOf(d["material_ids"])
	if len(ids) == 0 || len(ids) > 100 {
		failure(w, bad("소재는 1~100개까지 선택하세요."))
		return
	}
	paths := []string{}
	for _, id := range ids {
		m, e := s.Store.Get("material", id)
		if e != nil {
			failure(w, e)
			return
		}
		path, e := s.uploadPath(str(m, "relative_path"))
		if e != nil {
			failure(w, e)
			return
		}
		paths = append(paths, path)
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="materials.zip"`)
	archive := zip.NewWriter(w)
	defer archive.Close()
	for i, path := range paths {
		file, e := os.Open(path)
		if e != nil {
			return
		}
		entry, e := archive.Create(fmt.Sprintf("material-%03d%s", i+1, filepath.Ext(path)))
		if e == nil {
			_, e = io.Copy(entry, file)
		}
		file.Close()
		if e != nil {
			return
		}
	}
}
func (s *Server) materialProcess(w http.ResponseWriter, r *http.Request) (any, error) {
	pid, e := s.materialProject(r.PathValue("project"))
	if e != nil {
		return nil, e
	}
	taskProject := pid
	if taskProject == "" {
		taskProject = "global"
	}
	d := Object{}
	refs := []string{}
	source := ""
	cleanup := []string{}
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if e = s.form(r); e != nil {
			return nil, e
		}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				d[key] = values[0]
			}
		}
		if raw := str(d, "selection"); raw != "" {
			var selection Object
			if json.Unmarshal([]byte(raw), &selection) != nil {
				return nil, bad("선택 영역 형식이 올바르지 않습니다.")
			}
			d["selection"] = selection
		}
		for _, field := range []string{"source_image", "ref_image", "extra_images"} {
			for _, header := range r.MultipartForm.File[field] {
				relative, _, e := s.savePart(header, "material-inputs", true)
				if e != nil {
					return nil, e
				}
				path, _ := s.uploadPath(relative)
				cleanup = append(cleanup, path)
				refs = append(refs, path)
				if field == "source_image" {
					source = path
				}
			}
		}
	} else {
		d, e = payload(r)
		if e != nil {
			return nil, e
		}
	}
	op := str(d, "operation")
	if op == "" {
		op = "generate"
	}
	if !oneOf(op, "generate", "edit_full", "region_edit", "erase_region") {
		return nil, bad("지원하지 않는 소재 편집 방식입니다.")
	}
	if op != "erase_region" && strings.TrimSpace(str(d, "prompt")) == "" {
		return nil, bad("생성 또는 편집 지시를 입력하세요.")
	}
	if op != "generate" && source == "" {
		return nil, bad("편집할 원본 이미지를 선택하세요.")
	}
	ratio := str(d, "aspect_ratio")
	if ratio == "" {
		ratio = "1:1"
	}
	task, e := s.enqueue(taskProject, "PROCESS_MATERIAL", str(d, "client_task_id"), func(ctx context.Context, t *Task) error {
		defer func() {
			for _, path := range cleanup {
				os.Remove(path)
			}
		}()
		return withSlot(ctx, s.imageSlot, func() error {
			var original image.Image
			var box image.Rectangle
			var e error
			prompt := str(d, "prompt")
			if source != "" {
				raw, e := os.ReadFile(source)
				if e != nil {
					return e
				}
				original, e = decodeImage(raw)
				if e != nil {
					return e
				}
				b := original.Bounds()
				ratio = fmt.Sprintf("%d:%d", b.Dx(), b.Dy())
				if oneOf(op, "region_edit", "erase_region") {
					selection := object(d["selection"])
					x, y, width, height := num(selection, "x"), num(selection, "y"), num(selection, "width"), num(selection, "height")
					box = image.Rect(x, y, x+width, y+height)
					if width <= 0 || height <= 0 || !box.In(b) {
						return bad("선택 영역이 원본 이미지 범위를 벗어났습니다.")
					}
					if iw := num(selection, "image_width"); iw > 0 && iw != b.Dx() {
						return bad("원본 이미지와 선택 영역의 좌표 기준이 다릅니다.")
					}
					prompt += fmt.Sprintf("\nEdit ONLY this region in original image pixels: x=%d, y=%d, width=%d, height=%d. Preserve the complete original canvas and all pixels outside the region.", x, y, width, height)
				}
			}
			var raw []byte
			if op == "erase_region" {
				var buffer bytes.Buffer
				e = png.Encode(&buffer, RestoreRegions(original, []image.Rectangle{box}))
				raw = buffer.Bytes()
			} else {
				prefs := s.preferences()
				raw, e = s.Azure.Image(ctx, prompt, ratio, str(prefs, "image_resolution"), str(prefs, "image_quality"), refs)
				if e == nil && op == "region_edit" && str(d, "apply_mode") != "replace_full" {
					generated, e := decodeImage(raw)
					if e != nil {
						return e
					}
					canvas := image.NewNRGBA(original.Bounds())
					draw.Draw(canvas, canvas.Bounds(), original, original.Bounds().Min, draw.Src)
					scaled := image.NewNRGBA(original.Bounds())
					xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), generated, generated.Bounds(), draw.Src, nil)
					draw.Draw(canvas, box, scaled, box.Min, draw.Src)
					var buffer bytes.Buffer
					e = png.Encode(&buffer, canvas)
					raw = buffer.Bytes()
				}
			}
			if e != nil {
				return e
			}
			relative := "materials/" + uid() + ".png"
			path, _ := s.uploadPath(relative)
			if e = atomicFile(path, raw); e != nil {
				return e
			}
			m, e := s.newMaterial(pid, relative, "", str(d, "prompt"))
			if e != nil {
				return e
			}
			t.Progress(Object{"total": 1, "completed": 1, "material": m, "material_id": m["id"], "material_url": m["url"], "result": m})
			return nil
		})
	})
	return accepted(task), e
}
