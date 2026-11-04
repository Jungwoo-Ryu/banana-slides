package backend

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
)

func (s *Server) newAsset(pid string, raw []byte, source, label string) (Object, error) {
	id := uid()
	relative := pid + "/template-assets/" + id + "/template.png"
	path, e := s.uploadPath(relative)
	if e != nil {
		return nil, e
	}
	if e = atomicFile(path, raw); e != nil {
		return nil, e
	}
	thumb, e := s.makeThumbnail(relative)
	if e != nil {
		return nil, e
	}
	all, e := s.Store.List("asset", pid)
	if e != nil {
		return nil, e
	}
	a := Object{"id": id, "project_id": pid, "image_url": "/files/" + relative, "thumb_url": thumb, "_file": relative, "source": source, "sort_order": len(all), "user_label": label, "analysis_status": "pending", "analysis_json": nil, "analysis_notes": nil, "analysis_error": nil, "user_edited_analysis": false, "created_at": now(), "updated_at": now()}
	return a, s.Store.Put("asset", id, pid, len(all), a)
}
func (s *Server) analyzeAsset(ctx context.Context, asset Object) error {
	id := str(asset, "id")
	_, _ = s.Store.Update("asset", id, func(o Object) error { o["analysis_status"] = "processing"; return nil })
	path, e := s.uploadPath(str(asset, "_file"))
	var text string
	if e == nil {
		text, e = s.text(ctx, "You are a slide-template visual analyst. Return only JSON with template_role, layout_structure, content_capacity (low/medium/high), text_regions and image_regions (arrays of {name, position, size}), visual_density (low/medium/high), style_keywords (array), color_palette (array), notes. Describe in Korean.", []string{path}, nil)
	}
	var analysis Object
	if e == nil {
		e = extractJSON(text, &analysis)
	}
	_, saveErr := s.Store.Update("asset", id, func(o Object) error {
		if e != nil {
			o["analysis_status"] = "failed"
			o["analysis_error"] = s.Azure.safeError(e).Error()
		} else {
			o["analysis_status"] = "completed"
			o["analysis_json"] = analysis
			o["analysis_error"] = nil
		}
		return nil
	})
	if e != nil {
		return e
	}
	return saveErr
}
func (s *Server) enqueueAnalysis(asset Object) (Object, error) {
	return s.enqueue(str(asset, "project_id"), "ANALYZE_TEMPLATE", "", func(ctx context.Context, t *Task) error { return s.analyzeAsset(ctx, asset) })
}
func (s *Server) assetList(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	assets, e := s.Store.List("asset", str(p, "project_id"))
	if e != nil {
		return nil, e
	}
	pages, _ := s.pages(str(p, "project_id"))
	for _, a := range assets {
		ids := []string{}
		for _, p := range pages {
			if str(p, "template_asset_id") == str(a, "id") {
				ids = append(ids, str(p, "page_id"))
			}
		}
		a["referenced_page_ids"] = ids
	}
	return Object{"assets": assets}, nil
}
func (s *Server) assetUpload(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	pdf := strings.HasSuffix(r.URL.Path, "/upload-pdf")
	field := "image"
	if pdf {
		field = "pdf"
	}
	relative, _, e := s.upload(r, field, pid+"/template-inputs", !pdf)
	if e != nil {
		return nil, e
	}
	path, _ := s.uploadPath(relative)
	if pdf {
		result, e := s.enqueue(pid, "SPLIT_TEMPLATE_PDF", "", func(ctx context.Context, t *Task) error {
			return withSlot(ctx, s.heavySlot, func() error {
				ids := []string{}
				return s.renderPDF(ctx, path, func(i int, path string) error {
					raw, e := os.ReadFile(path)
					if e != nil {
						return e
					}
					asset, e := s.newAsset(pid, raw, "pdf_split", fmt.Sprintf("템플릿 %d", i))
					if e != nil {
						return e
					}
					ids = append(ids, str(asset, "id"))
					if e = s.analyzeAsset(ctx, asset); e != nil {
						return e
					}
					t.Progress(Object{"completed": i, "created_asset_ids": ids})
					return nil
				})
			})
		})
		return accepted(result), e
	}
	raw, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	asset, e := s.newAsset(pid, raw, "upload", r.FormValue("user_label"))
	if e != nil {
		return nil, e
	}
	os.Remove(path)
	if pageID := r.URL.Query().Get("bind_to_page"); pageID != "" {
		page, e := s.Store.Get("page", pageID)
		if e != nil || str(page, "project_id") != pid {
			return nil, ErrNotFound
		}
		_, e = s.Store.Update("page", pageID, func(o Object) error {
			o["template_asset_id"] = asset["id"]
			o["template_selection_source"] = "manual"
			return nil
		})
		if e != nil {
			return nil, e
		}
	}
	if strings.HasSuffix(r.URL.Path, "/single-with-upload") {
		if e = s.applyTemplateMode(pid, Object{"mode": "single", "unified_asset_id": asset["id"], "unified_style_text": r.FormValue("unified_style_text")}); e != nil {
			return nil, e
		}
	}
	task, e := s.enqueueAnalysis(asset)
	if e != nil {
		return nil, e
	}
	project, _ := s.fullProject(pid)
	return created(Object{"asset": asset, "analyze_task_id": task["task_id"], "project": project}), nil
}
func (s *Server) assetAction(w http.ResponseWriter, r *http.Request) (any, error) {
	a, e := s.Store.Get("asset", r.PathValue("id"))
	if e != nil || str(a, "project_id") != r.PathValue("project") {
		return nil, ErrNotFound
	}
	id, pid := str(a, "id"), str(a, "project_id")
	if r.Method == "DELETE" {
		pages, e := s.pages(pid)
		if e != nil {
			return nil, e
		}
		cleared := []string{}
		for _, page := range pages {
			if str(page, "template_asset_id") == id {
				_, e = s.Store.Update("page", str(page, "page_id"), func(o Object) error { o["template_asset_id"] = nil; o["template_selection_source"] = nil; return nil })
				if e != nil {
					return nil, e
				}
				cleared = append(cleared, str(page, "page_id"))
			}
		}
		e = s.Store.Delete("asset", id)
		return Object{"deleted": e == nil, "cleared_page_ids": cleared}, e
	}
	if strings.HasSuffix(r.URL.Path, "/reanalyze") {
		t, e := s.enqueueAnalysis(a)
		return Object{"analyze_task_id": t["task_id"]}, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	a, e = s.Store.Update("asset", id, func(o Object) error {
		pick(o, d, "user_label", "analysis_json", "analysis_notes", "sort_order")
		if _, ok := d["analysis_json"]; ok {
			o["user_edited_analysis"] = true
			o["analysis_status"] = "completed"
		}
		return nil
	})
	return Object{"asset": a}, e
}
func (s *Server) pageTemplate(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.page(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	if id := str(d, "template_asset_id"); id != "" {
		a, e := s.Store.Get("asset", id)
		if e != nil || str(a, "project_id") != str(p, "project_id") {
			return nil, ErrNotFound
		}
	}
	p, e = s.Store.Update("page", str(p, "page_id"), func(o Object) error {
		pick(o, d, "template_asset_id", "template_style_text")
		o["template_selection_source"] = "manual"
		if v := str(d, "selection_source"); v != "" {
			o["template_selection_source"] = v
		}
		return nil
	})
	return Object{"page": p}, e
}
func (s *Server) applyTemplateMode(pid string, d Object) error {
	mode := str(d, "mode")
	if !oneOf(mode, "single", "multi") {
		return bad("템플릿 모드를 확인하세요.")
	}
	if id := str(d, "unified_asset_id"); id != "" {
		a, e := s.Store.Get("asset", id)
		if e != nil || str(a, "project_id") != pid {
			return ErrNotFound
		}
	}
	_, e := s.Store.Update("project", pid, func(o Object) error { o["template_mode"] = mode; return nil })
	if e != nil {
		return e
	}
	if mode == "single" {
		pages, e := s.pages(pid)
		if e != nil {
			return e
		}
		for _, p := range pages {
			_, e = s.Store.Update("page", str(p, "page_id"), func(o Object) error {
				o["template_asset_id"] = d["unified_asset_id"]
				o["template_style_text"] = d["unified_style_text"]
				o["template_selection_source"] = "batch_apply"
				return nil
			})
			if e != nil {
				return e
			}
		}
	}
	return nil
}
func (s *Server) templateMode(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	if e = s.applyTemplateMode(pid, d); e != nil {
		return nil, e
	}
	p, e = s.fullProject(pid)
	return Object{"project": p}, e
}
func (s *Server) autoMatch(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	assets, e := s.Store.List("asset", pid)
	if e != nil {
		return nil, e
	}
	ready := []Object{}
	for _, a := range assets {
		if str(a, "analysis_status") == "completed" {
			ready = append(ready, a)
		}
	}
	if len(ready) == 0 {
		return nil, bad("먼저 템플릿 분석을 완료하세요.")
	}
	ids := []string{}
	if id := r.PathValue("page"); id != "" {
		ids = append(ids, id)
	}
	pages, e := s.selectedPages(pid, ids, false)
	if e != nil {
		return nil, e
	}
	task, e := s.enqueue(pid, "AUTO_MATCH_TEMPLATE", "", func(ctx context.Context, t *Task) error {
		for i, page := range pages {
			if boolean(d, "preserve_non_empty") && str(page, "template_asset_id") != "" {
				continue
			}
			text, e := s.text(ctx, "Choose the best template for this slide. Return JSON {asset_id,reason,confidence}. Use only an id from the given template library.\nSlide: "+jsonText(page["outline_content"])+"\nTemplates: "+jsonText(clean(ready)), nil, nil)
			if e != nil {
				return e
			}
			var match Object
			if e = extractJSON(text, &match); e != nil {
				return e
			}
			valid := false
			for _, a := range ready {
				if str(a, "id") == str(match, "asset_id") {
					valid = true
				}
			}
			if !valid {
				return bad("모델이 존재하지 않는 템플릿을 선택했습니다.")
			}
			_, e = s.Store.Update("page", str(page, "page_id"), func(o Object) error {
				o["template_asset_id"] = match["asset_id"]
				o["template_match_reason"] = match["reason"]
				o["template_match_confidence"] = match["confidence"]
				o["template_selection_source"] = "auto"
				return nil
			})
			if e != nil {
				return e
			}
			t.Progress(Object{"total": len(pages), "completed": i + 1})
		}
		return nil
	})
	return accepted(task), e
}
func (s *Server) legacyTemplate(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	pid := str(p, "project_id")
	url := any(nil)
	if r.Method != "DELETE" {
		relative, _, e := s.upload(r, "template_image", pid+"/template", true)
		if e != nil {
			return nil, e
		}
		url = "/files/" + relative
	}
	p, e = s.Store.Update("project", pid, func(o Object) error { o["template_image_url"] = url; return nil })
	return p, e
}
func (s *Server) userTemplate(w http.ResponseWriter, r *http.Request) (any, error) {
	style := strings.HasPrefix(r.URL.Path, "/api/user-style-templates")
	kind := "user-template"
	if style {
		kind = "user-style"
	}
	if r.Method == "DELETE" {
		return Object{}, s.Store.Delete(kind, r.PathValue("id"))
	}
	if r.Method == "GET" {
		all, e := s.Store.List(kind, "")
		sortedRecent(all)
		return Object{"templates": all}, e
	}
	id := uid()
	d := Object{"id": id, "template_id": id, "created_at": now(), "updated_at": now()}
	if style {
		input, e := payload(r)
		if e != nil {
			return nil, e
		}
		if str(input, "name") == "" || str(input, "description") == "" {
			return nil, bad("스타일 이름과 설명을 입력하세요.")
		}
		pick(d, input, "name", "description", "color")
	} else {
		relative, name, e := s.upload(r, "template_image", "user-templates/"+id, true)
		if e != nil {
			return nil, e
		}
		d["name"] = name
		if name = r.FormValue("name"); name != "" {
			d["name"] = name
		}
		d["template_image_url"] = "/files/" + relative
		thumb, e := s.makeThumbnail(relative)
		if e != nil {
			return nil, e
		}
		d["thumb_url"] = thumb
		d["_file"] = relative
	}
	return created(d), s.Store.Put(kind, id, "", 0, d)
}
