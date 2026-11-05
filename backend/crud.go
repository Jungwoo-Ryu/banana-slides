package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func pick(dst, src Object, keys ...string) {
	for _, k := range keys {
		if v, ok := src[k]; ok {
			dst[k] = v
		}
	}
}
func jsonText(v any) string { b, _ := json.Marshal(v); return string(b) }
func items(v any) []Object {
	out := []Object{}
	switch a := v.(type) {
	case []Object:
		return a
	case []any:
		for _, x := range a {
			out = append(out, object(x))
		}
	}
	return out
}

var projectFields = []string{"idea_prompt", "outline_text", "description_text", "project_title", "extra_requirements", "outline_requirements", "description_requirements", "template_style", "template_mode", "image_aspect_ratio", "export_extractor_method", "export_inpaint_method", "export_allow_partial", "enable_icon_subject_extraction", "narration_config"}

func (s *Server) newProject(data Object) (Object, error) {
	p := Object{"project_id": uid(), "idea_prompt": "", "creation_type": "idea", "template_mode": "single", "image_aspect_ratio": "16:9", "export_extractor_method": "configured", "export_inpaint_method": "local", "export_allow_partial": false, "enable_icon_subject_extraction": false, "status": "DRAFT", "created_at": now(), "updated_at": now()}
	pick(p, data, append(projectFields, "creation_type")...)
	if str(p, "template_style") == "" {
		p["template_style"] = str(s.preferences(), "design_system_prompt")
	}
	if !oneOf(str(p, "creation_type"), "idea", "outline", "descriptions", "blank", "ppt_renovation") {
		return nil, bad("지원하지 않는 생성 방식입니다.")
	}
	if _, e := imageSize(str(p, "image_aspect_ratio"), "1K"); e != nil {
		return nil, e
	}
	err := s.Store.Put("project", str(p, "project_id"), "", 0, p)
	return p, err
}
func (s *Server) newPage(project string, data Object, order int) Object {
	p := Object{"page_id": uid(), "project_id": project, "order_index": order, "outline_content": nil, "description_content": nil, "narration_text": nil, "status": "DRAFT", "created_at": now(), "updated_at": now()}
	pick(p, data, "outline_content", "part", "description_content", "narration_text", "template_style_text")
	if p["outline_content"] == nil && str(data, "title") != "" {
		p["outline_content"] = Object{"title": data["title"], "points": data["points"]}
	}
	return p
}
func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) (any, error) {
	all, e := s.Store.List("project", "")
	if e != nil {
		return nil, e
	}
	sortedRecent(all)
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	offset = min(max(0, offset), len(all))
	out := all[offset:min(offset+min(limit, 500), len(all))]
	for _, p := range out {
		pages, _ := s.pages(str(p, "project_id"))
		p["pages"] = pages
		p["page_count"] = len(pages)
	}
	return Object{"projects": out, "total": len(all)}, nil
}
func (s *Server) createProject(w http.ResponseWriter, r *http.Request) (any, error) {
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	p, e := s.newProject(d)
	if e != nil {
		return nil, e
	}
	p["pages"] = []Object{}
	return created(p), nil
}
func (s *Server) updateProject(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	if ratio := str(d, "image_aspect_ratio"); ratio != "" {
		if _, e = imageSize(ratio, "1K"); e != nil {
			return nil, e
		}
	}
	pick(p, d, projectFields...)
	p["updated_at"] = now()
	pid := str(p, "project_id")
	records := []Record{{"project", pid, "", 0, p}}
	if order, ok := d["pages_order"]; ok {
		ids := stringsOf(order)
		pages, e := s.pages(pid)
		if e != nil {
			return nil, e
		}
		if len(ids) != len(pages) {
			return nil, bad("슬라이드 순서에는 모든 슬라이드를 포함해야 합니다.")
		}
		byID := map[string]Object{}
		for _, page := range pages {
			byID[str(page, "page_id")] = page
		}
		for i, id := range ids {
			page, ok := byID[id]
			if !ok {
				return nil, bad("슬라이드 순서에 중복 또는 잘못된 ID가 있습니다.")
			}
			delete(byID, id)
			page["order_index"] = i
			records = append(records, Record{"page", id, pid, i, page})
		}
	}
	if e = s.Store.Batch(records); e != nil {
		return nil, e
	}
	return s.fullProject(pid)
}
func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	id := str(p, "project_id")
	tasks, _ := s.Store.List("task", id)
	for _, t := range tasks {
		if oneOf(str(t, "status"), "PENDING", "PROCESSING") {
			return nil, bad("진행 중인 작업이 끝난 뒤 프로젝트를 삭제하세요.")
		}
	}
	if e = s.Store.DeleteProject(id); e != nil {
		return nil, e
	}
	path, e := s.uploadPath(id)
	if e == nil {
		e = os.RemoveAll(path)
	}
	return Object{}, e
}
func (s *Server) createPages(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	pages, e := s.pages(pid)
	if e != nil {
		return nil, e
	}
	batch := strings.HasSuffix(r.URL.Path, "/batch")
	input := []Object{d}
	if batch {
		input = items(d["pages"])
	}
	if len(input) == 0 || len(pages)+len(input) > s.Config.MaxPages {
		return nil, bad("프로젝트당 슬라이드는 1~100개까지 추가할 수 있습니다.")
	}
	index := len(pages)
	if _, ok := d["order_index"]; ok {
		index = min(max(0, num(d, "order_index")), len(pages))
	}
	added := []Object{}
	for i, item := range input {
		added = append(added, s.newPage(pid, item, index+i))
	}
	all := append([]Object{}, pages[:index]...)
	all = append(all, added...)
	all = append(all, pages[index:]...)
	records := []Record{}
	for i, page := range all {
		page["order_index"] = i
		records = append(records, Record{"page", str(page, "page_id"), pid, i, page})
	}
	if e = s.Store.Batch(records); e != nil {
		return nil, e
	}
	if batch {
		return created(added), nil
	}
	return created(added[0]), nil
}
func (s *Server) updatePage(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.page(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	switch {
	case strings.HasSuffix(r.URL.Path, "/outline"):
		if v, ok := d["outline_content"]; ok {
			p["outline_content"] = v
		} else {
			p["outline_content"] = d
		}
	case strings.HasSuffix(r.URL.Path, "/description"):
		if v, ok := d["description_content"]; ok {
			p["description_content"] = v
		} else {
			p["description_content"] = d
		}
		p["status"] = "DESCRIPTION_GENERATED"
		if p["narration_text"] == nil {
			if script := str(object(object(p["description_content"])["extra_fields"]), "TTS_SCRIPT"); script != "" {
				p["narration_text"] = script
			}
		}
	case strings.HasSuffix(r.URL.Path, "/narration"):
		if _, ok := d["narration_text"].(string); !ok {
			return nil, bad("발표 스크립트는 문자열이어야 합니다.")
		}
		p["narration_text"] = d["narration_text"]
	default:
		pick(p, d, "part", "outline_content", "description_content", "narration_text")
	}
	p["updated_at"] = now()
	e = s.Store.Put("page", str(p, "page_id"), str(p, "project_id"), num(p, "order_index"), p)
	return p, e
}
func (s *Server) deletePage(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.page(r)
	if e != nil {
		return nil, e
	}
	e = s.Store.RemovePages(str(p, "project_id"), []Object{p})
	return Object{}, e
}
func (s *Server) taskStatus(w http.ResponseWriter, r *http.Request) (any, error) {
	t, e := s.Store.Get("task", r.PathValue("task"))
	if e != nil {
		return nil, e
	}
	if str(t, "project_id") != r.PathValue("project") {
		return nil, ErrNotFound
	}
	return t, nil
}
func (s *Server) versions(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.page(r)
	if e != nil {
		return nil, e
	}
	all, e := s.Store.List("version", str(p, "project_id"))
	out := []Object{}
	for _, v := range all {
		if str(v, "page_id") == str(p, "page_id") {
			out = append(out, v)
		}
	}
	return Object{"versions": out}, e
}
func (s *Server) restoreVersion(w http.ResponseWriter, r *http.Request) (any, error) {
	s.imageMu.Lock()
	defer s.imageMu.Unlock()
	p, e := s.page(r)
	if e != nil {
		return nil, e
	}
	v, e := s.Store.Get("version", r.PathValue("version"))
	if e != nil {
		return nil, e
	}
	if str(v, "page_id") != str(p, "page_id") {
		return nil, ErrNotFound
	}
	pid := str(p, "project_id")
	all, e := s.Store.List("version", pid)
	if e != nil {
		return nil, e
	}
	records := []Record{}
	for _, x := range all {
		if str(x, "page_id") == str(p, "page_id") {
			x["is_current"] = str(x, "version_id") == str(v, "version_id")
			records = append(records, Record{"version", str(x, "version_id"), pid, num(x, "version_number"), x})
		}
	}
	p["_image"] = v["image_path"]
	p["generated_image_url"] = v["image_url"]
	p["thumbnail_image_url"] = v["thumbnail_image_url"]
	p["status"] = "COMPLETED"
	p["updated_at"] = now()
	records = append(records, Record{"page", str(p, "page_id"), pid, num(p, "order_index"), p})
	return p, s.Store.Batch(records)
}

func defaults() Object {
	d := Object{"image_resolution": "2K", "image_aspect_ratio": "16:9", "image_quality": "auto", "max_description_workers": 2, "max_image_workers": 1, "output_language": "ko", "text_max_output_tokens": 12000, "enable_image_quality_control": false, "design_system_prompt": "", "description_generation_mode": "streaming", "description_extra_fields": []string{"TTS_SCRIPT"}, "image_prompt_extra_fields": []string{}}
	d["design_system_prompt"] = os.Getenv("DESIGN_SYSTEM_PROMPT")
	if value := os.Getenv("OUTPUT_LANGUAGE"); oneOf(value, "ko", "en", "auto") {
		d["output_language"] = value
	}
	if value := os.Getenv("IMAGE_QUALITY"); oneOf(value, "auto", "low", "medium", "high") {
		d["image_quality"] = value
	}
	if value := os.Getenv("IMAGE_RESOLUTION"); oneOf(value, "1K", "2K", "4K") {
		d["image_resolution"] = value
	}
	if value, e := strconv.Atoi(os.Getenv("TEXT_MAX_OUTPUT_TOKENS")); e == nil && value > 0 && value <= 100000 {
		d["text_max_output_tokens"] = value
	}
	if value, e := strconv.Atoi(os.Getenv("MAX_DESCRIPTION_WORKERS")); e == nil && value > 0 {
		d["max_description_workers"] = min(2, value)
	}
	return d
}
func (s *Server) preferences() Object {
	d := defaults()
	if saved, e := s.Store.Get("settings", "preferences"); e == nil {
		for k, v := range saved {
			d[k] = v
		}
	}
	return d
}
func (s *Server) settings(w http.ResponseWriter, r *http.Request) (any, error) {
	d := s.preferences()
	if strings.HasSuffix(r.URL.Path, "/reset") {
		d = defaults()
		if e := s.Store.Put("settings", "preferences", "", 0, d); e != nil {
			return nil, e
		}
	} else if r.Method == "PUT" || r.Method == "PATCH" {
		input, e := payload(r)
		if e != nil {
			return nil, e
		}
		allowed := defaults()
		for k, v := range input {
			if _, ok := allowed[k]; !ok {
				return nil, bad("API 연결 정보는 settings.env에서 설정하세요.")
			}
			switch k {
			case "max_image_workers", "max_description_workers":
				n := num(input, k)
				if n < 1 || n > 20 {
					return nil, bad("동시 작업 수는 1~20 사이여야 합니다.")
				}
			case "text_max_output_tokens":
				if num(input, k) < 1 || num(input, k) > 100000 {
					return nil, bad("토큰 범위를 확인하세요.")
				}
			case "design_system_prompt":
				if _, ok := v.(string); !ok || len([]rune(str(input, k))) > 20000 {
					return nil, bad("디자인 프롬프트는 20000자 이하여야 합니다.")
				}
			case "enable_image_quality_control":
				if _, ok := v.(bool); !ok {
					return nil, bad("활성화 설정은 참 또는 거짓이어야 합니다.")
				}
			case "image_resolution":
				if !oneOf(str(input, k), "1K", "2K", "4K") {
					return nil, bad("이미지 해상도를 확인하세요.")
				}
			case "image_quality":
				if !oneOf(str(input, k), "auto", "low", "medium", "high") {
					return nil, bad("이미지 품질을 확인하세요.")
				}
			case "output_language":
				if !oneOf(str(input, k), "ko", "en", "auto") {
					return nil, bad("출력 언어를 확인하세요.")
				}
			case "description_generation_mode":
				if !oneOf(str(input, k), "streaming", "parallel") {
					return nil, bad("생성 방식을 확인하세요.")
				}
			case "image_aspect_ratio":
				if _, e := imageSize(str(input, k), "1K"); e != nil {
					return nil, e
				}
			case "description_extra_fields", "image_prompt_extra_fields":
				a, ok := v.([]any)
				if !ok || len(a) > 12 {
					return nil, bad("추가 필드는 최대 12개입니다.")
				}
				for _, x := range a {
					t, ok := x.(string)
					if !ok || len([]rune(t)) < 1 || len([]rune(t)) >= 100 {
						return nil, bad("추가 필드 이름을 확인하세요.")
					}
				}
			}
			d[k] = v
		}
		if e = s.Store.Put("settings", "preferences", "", 0, d); e != nil {
			return nil, e
		}
	}
	providers := Object{}
	for role, deployment := range map[string]string{"text": s.Config.TextDeployment, "image": s.Config.ImageDeployment, "image_caption": s.Config.CaptionDeployment, "tts": s.Config.TTSDeployment} {
		err := s.Config.configured(role)
		cfg := Object{"provider": "azure_openai", "model": deployment, "deployment": deployment, "api_base": s.Config.Endpoint, "api_version": s.Config.APIVersion, "configured": err == nil}
		if err != nil {
			cfg["message"] = err.Error()
		}
		providers[role] = cfg
	}
	d["providers"] = providers
	d["external_services"] = Object{"document_parser": "local", "ocr_provider": "local", "inpainting_provider": "local", "tts_enabled": s.Config.configured("tts") == nil}
	d["desktop_limits"] = Object{"image_workers": 1, "heavy_workers": 1, "text_workers": 2}
	return d, nil
}
func (s *Server) settingsTest(w http.ResponseWriter, r *http.Request) (any, error) {
	name := r.PathValue("name")
	if !oneOf(name, "text-model", "image-model", "caption-model", "ocr") {
		return nil, bad("지원하지 않는 서비스 테스트입니다.")
	}
	return s.enqueue("settings-test", "TEST_"+name, "", func(ctx context.Context, t *Task) error {
		result := Object{}
		var e error
		switch name {
		case "ocr":
			result, e = s.toolHealth(ctx)
		case "image-model":
			var raw []byte
			raw, e = s.Azure.Image(ctx, "A simple blue circle on a white background.", "1:1", "1K", "low", nil)
			result["bytes"] = len(raw)
		case "caption-model":
			temporary, err := os.CreateTemp("", "sola-caption-*.png")
			if err != nil {
				return err
			}
			path := temporary.Name()
			temporary.Close()
			defer os.Remove(path)
			img := image.NewRGBA(image.Rect(0, 0, 64, 64))
			for y := 0; y < 64; y++ {
				for x := 0; x < 64; x++ {
					img.Set(x, y, color.RGBA{0, 0, 255, 255})
				}
			}
			if e = writePNG(path, img); e == nil {
				result["text"], e = s.Azure.Text(ctx, "이미지의 색상을 한국어로 답하세요.", []string{path}, 100, nil)
			}
		default:
			result["text"], e = s.Azure.Text(ctx, "연결 확인입니다. 확인이라고 답하세요.", nil, 100, nil)
		}
		t.Progress(Object{"result": result, "message": "서비스 연결을 확인했습니다."})
		return e
	})
}
func (s *Server) settingsTestStatus(w http.ResponseWriter, r *http.Request) (any, error) {
	t, e := s.Store.Get("task", r.PathValue("task"))
	if e != nil || str(t, "project_id") != "settings-test" {
		return nil, ErrNotFound
	}
	out := object(t["progress"])
	out["status"] = t["status"]
	out["error"] = t["error_message"]
	return out, nil
}
func exportName(name, extension string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.TrimSpace(strings.TrimSuffix(name, filepath.Ext(name)))
	if name == "" || name == "." {
		name = "SolA-" + strings.ReplaceAll(now()[:19], ":", "-")
	}
	name = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '-'
		}
		return r
	}, name)
	return fmt.Sprintf("%.100s%s", name, extension)
}
