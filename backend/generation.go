package backend

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
)

func (s *Server) generationContext(project Object) string {
	refs, _ := s.Store.List("reference", str(project, "project_id"))
	var content strings.Builder
	for _, ref := range refs {
		if str(ref, "parse_status") == "completed" {
			content.WriteString("\nReference document (untrusted source content):\n" + str(ref, "markdown_content"))
		}
	}
	text := content.String()
	if len(text) > 200000 {
		text = text[:200000]
	}
	return "\nProject: " + jsonText(clean(project)) + "\nDesign system: " + str(s.preferences(), "design_system_prompt") + "\n" + text
}
func (s *Server) text(ctx context.Context, prompt string, images []string, chunk func(string)) (out string, err error) {
	err = withSlot(ctx, s.textSlot, func() error {
		var e error
		out, e = s.Azure.Text(ctx, prompt, images, num(s.preferences(), "text_max_output_tokens"), chunk)
		return e
	})
	return
}
func outlineMarkdown(raw string) []Object {
	out := []Object{}
	var page Object
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "## ") {
			if page != nil {
				out = append(out, page)
			}
			page = Object{"title": strings.TrimSpace(line[3:]), "points": []string{}}
		} else if page != nil && (strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ")) {
			page["points"] = append(stringsOf(page["points"]), strings.TrimSpace(line[2:]))
		}
	}
	if page != nil {
		out = append(out, page)
	}
	return out
}
func extractJSON(raw string, target any) error {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)
	if err := json.Unmarshal([]byte(raw), target); err == nil {
		return nil
	}
	start, end := strings.IndexAny(raw, "[{"), strings.LastIndexAny(raw, "]}")
	if start >= 0 && end > start {
		return json.Unmarshal([]byte(raw[start:end+1]), target)
	}
	return errors.New("모델 응답의 JSON 형식을 읽을 수 없습니다")
}
func (s *Server) mergeOutline(pid string, input []Object) ([]Object, error) {
	if len(input) == 0 || len(input) > s.Config.MaxPages {
		return nil, bad("생성된 슬라이드 수가 1~100 범위를 벗어났습니다.")
	}
	old, e := s.pages(pid)
	if e != nil {
		return nil, e
	}
	byTitle := map[string][]Object{}
	for _, p := range old {
		title := str(object(p["outline_content"]), "title")
		byTitle[title] = append(byTitle[title], p)
	}
	used := map[string]bool{}
	out := []Object{}
	records := []Record{}
	for i, item := range input {
		outline := object(item["outline_content"])
		if str(outline, "title") == "" {
			outline = Object{"title": str(item, "title"), "points": stringsOf(item["points"])}
		}
		if str(outline, "title") == "" {
			return nil, bad("모델 응답에 슬라이드 제목이 없습니다.")
		}
		p := s.newPage(pid, Object{}, i)
		matches := byTitle[str(outline, "title")]
		if len(matches) > 0 {
			p = matches[0]
			byTitle[str(outline, "title")] = matches[1:]
		}
		p["order_index"] = i
		p["outline_content"] = outline
		if part := str(item, "part"); part != "" {
			p["part"] = part
		}
		if description := str(item, "description_text"); description != "" {
			setDescription(p, description)
		}
		used[str(p, "page_id")] = true
		out = append(out, p)
		records = append(records, Record{"page", str(p, "page_id"), pid, i, p})
	}
	if e = s.Store.Batch(records); e != nil {
		return nil, e
	}
	for _, p := range old {
		if !used[str(p, "page_id")] {
			if e = s.Store.RemovePages(pid, []Object{p}); e != nil {
				return nil, e
			}
		}
	}
	_, e = s.Store.Update("project", pid, func(p Object) error { p["status"] = "OUTLINE_GENERATED"; return nil })
	return out, e
}
func (s *Server) outline(ctx context.Context, p, d Object, emit func(string, Object)) ([]Object, error) {
	prompt := "Create a coherent presentation outline in " + str(d, "language") + " (Korean by default). Return only Markdown between <!-- BEGIN --> and <!-- END -->. Use ## for each slide title and - bullet points. Do not output code fences. Follow user page count and requirements." + s.generationContext(p)
	if req := str(d, "user_requirement"); req != "" {
		pages, _ := s.pages(str(p, "project_id"))
		prompt += "\nRevise this outline: " + jsonText(clean(pages)) + "\nUser revision: " + req
	}
	if boolean(d, "lock_page_count") {
		pages, _ := s.pages(str(p, "project_id"))
		if len(pages) > 0 {
			prompt += fmt.Sprintf("\nKeep exactly %d slides.", len(pages))
		}
	}
	var raw strings.Builder
	emitted := 0
	callback := func(chunk string) {
		raw.WriteString(chunk)
		parsed := outlineMarkdown(raw.String())
		ready := len(parsed) - 1
		if strings.Contains(raw.String(), "<!-- END -->") {
			ready = len(parsed)
		}
		for emitted < ready {
			p := clone(parsed[emitted])
			p["index"] = emitted
			if emit != nil {
				emit("page", p)
			}
			emitted++
		}
	}
	result, e := s.text(ctx, prompt, nil, callback)
	if e != nil {
		return nil, e
	}
	input := outlineMarkdown(result)
	if len(input) == 0 {
		_ = extractJSON(result, &input)
	}
	pages, e := s.mergeOutline(str(p, "project_id"), input)
	if e != nil {
		return nil, e
	}
	for emitted < len(input) {
		p := clone(input[emitted])
		p["index"] = emitted
		if emit != nil {
			emit("page", p)
		}
		emitted++
	}
	return pages, nil
}
func (s *Server) generateOutline(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	if strings.HasSuffix(r.URL.Path, "/from-description") {
		text, e := s.text(r.Context(), "Parse the user's slide descriptions without discarding their content. Return only a JSON array of {title,points,description_text,narration_text}. Preserve each slide's original description in description_text. Language: "+str(d, "language")+s.generationContext(p), nil, nil)
		if e != nil {
			return nil, e
		}
		var parsed []Object
		if e = extractJSON(text, &parsed); e != nil {
			return nil, e
		}
		for _, page := range parsed {
			if str(page, "description_text") == "" {
				return nil, bad("모델이 슬라이드 설명을 반환하지 않았습니다. 다시 시도하세요.")
			}
		}
		pages, e := s.mergeOutline(str(p, "project_id"), parsed)
		return Object{"pages": pages}, e
	}
	pages, e := s.outline(r.Context(), p, d, nil)
	return Object{"pages": pages}, e
}
func sse(w http.ResponseWriter, event string, data Object) {
	b, _ := json.Marshal(clean(data))
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}
func (s *Server) generationStream(w http.ResponseWriter, r *http.Request) {
	p, e := s.project(r)
	if e != nil {
		failure(w, e)
		return
	}
	d, e := payload(r)
	if e != nil {
		failure(w, e)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("X-Accel-Buffering", "no")
	emit := func(event string, data Object) { sse(w, event, data) }
	var pages []Object
	if strings.Contains(r.URL.Path, "/outline/") {
		pages, e = s.outline(r.Context(), p, d, emit)
	} else {
		pages, e = s.describePages(r.Context(), p, d, emit, nil)
	}
	if e != nil {
		emit("error", Object{"message": s.Azure.safeError(e).Error()})
		return
	}
	emit("done", Object{"total": len(pages), "pages": pages})
}

var narrationPattern = regexp.MustCompile(`(?s)(?:^|\n)TTS_SCRIPT\s*:\s*(.*?)(?:<!-- PAGE_END -->|$)`)

func setDescription(page Object, text string) {
	// A request describes one slide. Keep the delimiter until we isolate that
	// slide so an overlong model response cannot contaminate its narration.
	text, _, _ = strings.Cut(text, "<!-- PAGE_END -->")
	text = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(text), "<!-- BEGIN -->"))
	text = strings.TrimSpace(strings.TrimSuffix(text, "<!-- END -->"))
	extras := Object{}
	if match := narrationPattern.FindStringSubmatch(text); len(match) > 1 {
		extras["TTS_SCRIPT"] = strings.TrimSpace(match[1])
		text = strings.TrimSpace(narrationPattern.ReplaceAllString(text, ""))
		if page["narration_text"] == nil {
			page["narration_text"] = extras["TTS_SCRIPT"]
		}
	}
	page["description_content"] = Object{"text": text, "extra_fields": extras}
	page["status"] = "DESCRIPTION_GENERATED"
	page["updated_at"] = now()
}
func (s *Server) describe(ctx context.Context, project, page, d Object) (Object, error) {
	prompt := "Write production-ready visual instructions for ONE presentation slide. Language: " + str(d, "language") + " (Korean default). Include exact on-slide text between --- SLIDE_TEXT --- and --- SLIDE_TEXT_END ---, then layout, visual assets, typography and colours. End with TTS_SCRIPT: followed by a natural spoken narration, then <!-- PAGE_END -->. Never place the narration on the slide. Detail level: " + str(d, "detail_level") + "\nSlide: " + jsonText(clean(page)) + "\nRevision: " + str(d, "user_requirement") + s.generationContext(project)
	prompt += "\nAdditional named fields before TTS_SCRIPT (FIELD_NAME: content): " + jsonText(s.preferences()["description_extra_fields"])
	var chunk func(string)
	if str(s.preferences(), "description_generation_mode") == "streaming" {
		chunk = func(string) {} // Each completed slide is emitted through the UI SSE contract.
	}
	text, e := s.text(ctx, prompt, nil, chunk)
	if e != nil {
		return nil, e
	}
	fields := stringsOf(s.preferences()["description_extra_fields"])
	return s.Store.Update("page", str(page, "page_id"), func(current Object) error {
		setDescription(current, text)
		setAdditionalFields(current, fields)
		return nil
	})
}
func (s *Server) selectedPages(pid string, ids []string, requireImages bool) ([]Object, error) {
	pages, e := s.pages(pid)
	if e != nil {
		return nil, e
	}
	selected := map[string]bool{}
	for _, id := range ids {
		selected[id] = false
	}
	out := []Object{}
	for _, p := range pages {
		if len(ids) > 0 {
			if _, ok := selected[str(p, "page_id")]; !ok {
				continue
			}
			selected[str(p, "page_id")] = true
		}
		if requireImages && str(p, "_image") == "" {
			return nil, bad("선택한 슬라이드 중 이미지가 없는 슬라이드가 있습니다.")
		}
		out = append(out, p)
	}
	for _, found := range selected {
		if !found {
			return nil, ErrNotFound
		}
	}
	if len(out) == 0 {
		return nil, bad("슬라이드가 없습니다. 먼저 초안을 생성하세요.")
	}
	return out, nil
}
func (s *Server) describePages(ctx context.Context, p, d Object, emit func(string, Object), task *Task) ([]Object, error) {
	pages, e := s.selectedPages(str(p, "project_id"), stringsOf(d["page_ids"]), false)
	if e != nil {
		return nil, e
	}
	workers := 1
	prefs := s.preferences()
	if str(prefs, "description_generation_mode") == "parallel" {
		workers = min(2, max(1, num(prefs, "max_description_workers")))
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	type descriptionResult struct {
		index int
		page  Object
		err   error
	}
	results := make(chan descriptionResult, len(pages))
	queue := make(chan int, len(pages))
	for i := range pages {
		queue <- i
	}
	close(queue)
	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for index := range queue {
				if ctx.Err() != nil {
					return
				}
				page, err := s.describe(ctx, p, pages[index], d)
				results <- descriptionResult{index, page, err}
				if err != nil {
					return
				}
			}
		}()
	}
	go func() { wg.Wait(); close(results) }()
	out := make([]Object, len(pages))
	completed := 0
	var firstError error
	for result := range results {
		if result.err != nil {
			if firstError == nil {
				firstError = result.err
			}
			cancel()
			continue
		}
		out[result.index] = result.page
		completed++
		page := result.page
		if emit != nil {
			description := object(page["description_content"])
			emit("description", Object{"page_index": num(page, "order_index"), "page_id": page["page_id"], "text": description["text"], "extra_fields": description["extra_fields"], "narration_text": page["narration_text"]})
		}
		if task != nil {
			task.Progress(Object{"total": len(pages), "completed": completed, "percent": completed * 100 / len(pages)})
		}
	}
	if firstError != nil {
		return nil, firstError
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	_, e = s.Store.Update("project", str(p, "project_id"), func(p Object) error { p["status"] = "DESCRIPTIONS_GENERATED"; return nil })
	return out, e
}

func (s *Server) generateDescriptions(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	if r.PathValue("page") != "" {
		page, e := s.page(r)
		if e != nil {
			return nil, e
		}
		return s.describe(r.Context(), p, page, d)
	}
	if strings.Contains(r.URL.Path, "/refine/") {
		pages, e := s.describePages(r.Context(), p, d, nil, nil)
		return Object{"pages": pages}, e
	}
	result, e := s.enqueue(str(p, "project_id"), "GENERATE_DESCRIPTIONS", str(d, "client_task_id"), func(ctx context.Context, t *Task) error { _, e := s.describePages(ctx, p, d, nil, t); return e })
	return accepted(result), e
}
func (s *Server) imageForPage(ctx context.Context, project, page, d Object, edit bool, attachments []string) (Object, error) {
	var result Object
	err := withSlot(ctx, s.imageSlot, func() error {
		pid, id := str(project, "project_id"), str(page, "page_id")
		slog.Info("image stage", "project_id", pid, "page_id", id, "stage", "prepare", "edit", edit)
		prefs := s.preferences()
		ratio := str(project, "image_aspect_ratio")
		if ratio == "" {
			ratio = str(prefs, "image_aspect_ratio")
		}
		refs := []string{}
		cleanups := []func(){}
		defer func() {
			for _, cleanup := range cleanups {
				cleanup()
			}
		}()
		add := func(url string) error {
			if url == "" {
				return nil
			}
			path, cleanup, e := s.referencePath(ctx, url)
			if e != nil {
				return e
			}
			refs = append(refs, path)
			cleanups = append(cleanups, cleanup)
			return nil
		}
		prompt := "Render exactly one polished presentation slide as a complete slide image. Preserve requested wording. Never include narration, TTS_SCRIPT, production instructions, or commentary in the image.\nDescription: " + imageDescription(page, prefs) + "\nSlide outline: " + jsonText(page["outline_content"]) + "\nDesign system: " + str(prefs, "design_system_prompt") + "\nProject style: " + str(project, "template_style") + "\nSlide style: " + str(page, "template_style_text") + "\nRequirements: " + str(project, "extra_requirements")
		if edit {
			if str(page, "_image") == "" {
				return bad("편집할 슬라이드 이미지가 없습니다.")
			}
			path, e := s.uploadPath(str(page, "_image"))
			if e != nil {
				return e
			}
			refs = append(refs, path)
			prompt = "Edit the FIRST reference image, retaining its full canvas dimensions and all unrequested content. A cropped region, if attached, identifies the edit location, not the output canvas. Region in original image pixels must be respected exactly when specified.\nUser edit: " + str(d, "edit_instruction") + "\n" + prompt
			refs = append(refs, attachments...)
		}
		template := str(project, "template_image_url")
		if assetID := str(page, "template_asset_id"); assetID != "" {
			asset, e := s.Store.Get("asset", assetID)
			if e != nil {
				return e
			}
			if str(asset, "project_id") != pid {
				return ErrNotFound
			}
			template = str(asset, "image_url")
		}
		if !edit || boolean(d, "use_template") || boolean(object(d["context_images"]), "use_template") {
			if e := add(template); e != nil {
				return e
			}
		}
		urls := stringsOf(d["desc_image_urls"])
		urls = append(urls, stringsOf(object(d["context_images"])["desc_image_urls"])...)
		for _, url := range urls {
			if e := add(url); e != nil {
				return e
			}
		}
		slog.Info("image stage", "page_id", id, "stage", "azure_request", "references", len(refs), "resolution", str(prefs, "image_resolution"))
		_, _ = s.Store.Update("page", id, func(p Object) error { p["status"] = "GENERATING"; return nil })
		raw, e := s.Azure.Image(ctx, prompt, ratio, str(prefs, "image_resolution"), str(prefs, "image_quality"), refs)
		if e != nil {
			_, _ = s.Store.Update("page", id, func(p Object) error { p["status"] = "FAILED"; return nil })
			return e
		}
		if boolean(prefs, "enable_image_quality_control") {
			temporary, e := os.CreateTemp("", "sola-quality-*.png")
			if e != nil {
				return e
			}
			path := temporary.Name()
			temporary.Close()
			defer os.Remove(path)
			for attempt := 0; attempt < 2; attempt++ {
				if e = os.WriteFile(path, raw, 0600); e != nil {
					return e
				}
				reviewText, e := s.text(ctx, "Review this rendered slide against the requirements. Return JSON {passed:boolean,feedback:string}. Reject illegible text, missing required content, obvious layout defects. Requirements: "+prompt, []string{path}, nil)
				if e != nil {
					return e
				}
				var review Object
				if e = extractJSON(reviewText, &review); e != nil {
					return e
				}
				if boolean(review, "passed") {
					break
				}
				if attempt == 1 {
					return fmt.Errorf("이미지 품질 검사를 통과하지 못했습니다: %s", str(review, "feedback"))
				}
				raw, e = s.Azure.Image(ctx, prompt+"\nCorrect these quality problems: "+str(review, "feedback"), ratio, str(prefs, "image_resolution"), str(prefs, "image_quality"), append([]string{path}, refs[:min(len(refs), 15)]...))
				if e != nil {
					return e
				}
			}
		}

		slog.Info("image stage", "page_id", id, "stage", "save", "bytes", len(raw))
		result, e = s.saveImage(pid, id, raw)
		return e
	})
	if err != nil {
		_, _ = s.Store.Update("page", str(page, "page_id"), func(p Object) error { p["status"] = "FAILED"; return nil })
	}
	return result, err
}
func (s *Server) generateImages(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	edit := strings.Contains(r.URL.Path, "/edit/")
	attachments := []string{}
	var d Object
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if e = s.form(r); e != nil {
			return nil, e
		}
		d = Object{"edit_instruction": r.FormValue("edit_instruction"), "use_template": r.FormValue("use_template") == "true"}
		var urls []string
		_ = json.Unmarshal([]byte(r.FormValue("desc_image_urls")), &urls)
		d["desc_image_urls"] = urls
		for _, header := range r.MultipartForm.File["context_images"] {
			relative, _, e := s.savePart(header, str(p, "project_id")+"/edit-inputs", true)
			if e != nil {
				return nil, e
			}
			path, _ := s.uploadPath(relative)
			attachments = append(attachments, path)
		}
	} else {
		d, e = payload(r)
		if e != nil {
			return nil, e
		}
	}
	ids := stringsOf(d["page_ids"])
	if r.PathValue("page") != "" {
		if _, e = s.page(r); e != nil {
			return nil, e
		}
		ids = []string{r.PathValue("page")}
	}
	pages, e := s.selectedPages(str(p, "project_id"), ids, false)
	if e != nil {
		return nil, e
	}
	if !edit && r.PathValue("page") != "" && strings.HasSuffix(r.URL.Path, "/generate/image") && !boolean(d, "force_regenerate") && str(pages[0], "_image") != "" {
		return nil, bad("이미지가 이미 있습니다. 재생성을 선택하세요.")
	}
	if edit && str(d, "edit_instruction") == "" {
		return nil, bad("이미지 수정 지시를 입력하세요.")
	}
	result, e := s.enqueue(str(p, "project_id"), "GENERATE_IMAGES", str(d, "client_task_id"), func(ctx context.Context, t *Task) error {
		defer func() {
			for _, path := range attachments {
				os.Remove(path)
			}
		}()
		failed, completed := 0, 0
		diagnostics := []Object{}
		slog.Info("image_generation", "task_id", t.ID, "project_id", p["project_id"], "stage", "queue", "total", len(pages))
		for i, page := range pages {
			t.Progress(Object{"total": len(pages), "completed": completed, "failed": failed, "stage": "image", "page_id": page["page_id"], "message": fmt.Sprintf("슬라이드 %d/%d 생성 중", i+1, len(pages))})
			_, e := s.imageForPage(ctx, p, page, d, edit, attachments)
			if e != nil {
				failed++
				diagnostic := Object{"page_id": page["page_id"], "stage": "image_generation", "error": s.Azure.safeError(e).Error()}
				var azureError *AzureError
				if errors.As(e, &azureError) {
					diagnostic["stage"], diagnostic["http_status"], diagnostic["provider_request_id"] = "azure_image_request", azureError.Status, azureError.RequestID
				}
				diagnostics = append(diagnostics, diagnostic)
				slog.Error("image_generation", "task_id", t.ID, "page_id", page["page_id"], "stage", diagnostic["stage"], "http_status", diagnostic["http_status"], "provider_request_id", diagnostic["provider_request_id"], "error", diagnostic["error"])
			} else {
				completed++
			}
			t.Progress(Object{"total": len(pages), "completed": completed, "failed": failed, "percent": (i + 1) * 100 / len(pages), "diagnostics": diagnostics, "page_errors": diagnostics})
			if ctx.Err() != nil {
				return ctx.Err()
			}
		}
		if failed > 0 {
			return fmt.Errorf("%d개 중 %d개 이미지 생성에 실패했습니다: %s", len(pages), failed, str(diagnostics[0], "error"))
		}
		_, e := s.Store.Update("project", str(p, "project_id"), func(p Object) error { p["status"] = "COMPLETED"; return nil })
		return e
	})
	return accepted(result), e
}
func (s *Server) narrate(ctx context.Context, p, page, d Object) (Object, error) {
	text, e := s.text(ctx, "Write only a natural presentation narration for this single slide in Korean unless the user requests another language. Use 60-150 words unless configured otherwise; maximum 4000 characters. No markdown labels.\nSpeaker configuration: "+jsonText(d)+"\nSlide: "+jsonText(clean(page))+s.generationContext(p), nil, nil)
	if e != nil {
		return nil, e
	}
	if len([]rune(text)) > 4000 {
		return nil, bad("생성된 발표 스크립트가 4000자를 초과합니다.")
	}
	return s.Store.Update("page", str(page, "page_id"), func(page Object) error { page["narration_text"] = strings.TrimSpace(text); return nil })
}
func (s *Server) generateNarration(w http.ResponseWriter, r *http.Request) (any, error) {
	p, e := s.project(r)
	if e != nil {
		return nil, e
	}
	d, e := payload(r)
	if e != nil {
		return nil, e
	}
	if r.PathValue("page") != "" {
		page, e := s.page(r)
		if e != nil {
			return nil, e
		}
		return s.narrate(r.Context(), p, page, d)
	}
	pages, e := s.selectedPages(str(p, "project_id"), stringsOf(d["page_ids"]), false)
	if e != nil {
		return nil, e
	}
	generated, skipped := 0, 0
	out := []Object{}
	for _, page := range pages {
		if !boolean(d, "force_regenerate") && str(page, "narration_text") != "" {
			skipped++
			out = append(out, page)
			continue
		}
		updated, err := s.narrate(r.Context(), p, page, d)
		if err != nil {
			return nil, err
		}
		out = append(out, updated)
		generated++
	}
	return Object{"total": len(pages), "generated": generated, "skipped": skipped, "failed": 0, "pages": out}, nil

}
func (s *Server) extractStyle(w http.ResponseWriter, r *http.Request) (any, error) {
	images := []string{}
	prompt := "Describe a reusable presentation design system in Korean: colours, fonts, spacing, grid and visual style. Return only the style text."
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		relative, _, e := s.upload(r, "image", "style-inputs", true)
		if e != nil {
			return nil, e
		}
		path, _ := s.uploadPath(relative)
		defer os.Remove(path)
		images = append(images, path)
	} else {
		d, e := payload(r)
		if e != nil {
			return nil, e
		}
		prompt += "\nContent: " + jsonText(d)
	}
	result, e := s.text(r.Context(), prompt, images, nil)
	return Object{"style": result, "style_text": result, "style_description": result, "template_style": result}, e
}

func imageDescription(page, prefs Object) string {
	description := clone(object(page["description_content"]))
	extras := object(description["extra_fields"])
	selected := Object{}
	for _, key := range stringsOf(prefs["image_prompt_extra_fields"]) {
		if key != "TTS_SCRIPT" {
			if value, ok := extras[key]; ok {
				selected[key] = value
			}
		}
	}
	description["extra_fields"] = selected
	return jsonText(description)
}

func setAdditionalFields(page Object, names []string) {
	description := object(page["description_content"])
	text := str(description, "text")
	extras := object(description["extra_fields"])
	type field struct {
		name       string
		start, end int
	}
	found := []field{}
	for _, name := range names {
		if name == "TTS_SCRIPT" {
			continue
		}
		re := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(name) + `[ \t]*:[ \t]*`)
		if match := re.FindStringIndex(text); match != nil {
			found = append(found, field{name, match[0], match[1]})
		}
	}
	sort.Slice(found, func(i, j int) bool { return found[i].start < found[j].start })
	for i, f := range found {
		end := len(text)
		if i+1 < len(found) {
			end = found[i+1].start
		}
		extras[f.name] = strings.TrimSpace(text[f.end:end])
	}
	if len(found) > 0 {
		description["text"] = strings.TrimSpace(text[:found[0].start])
	}
	description["extra_fields"] = extras
}
