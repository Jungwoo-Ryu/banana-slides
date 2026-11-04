package backend

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

func testImage() []byte {
	img := image.NewRGBA(image.Rect(0, 0, 640, 360))
	for y := 0; y < 360; y++ {
		for x := 0; x < 640; x++ {
			img.Set(x, y, color.White)
		}
	}
	d := font.Drawer{Dst: img, Src: image.NewUniform(color.Black), Face: basicfont.Face7x13, Dot: fixed.P(30, 80)}
	d.DrawString("SOL A SLIDE TEST 2026")
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}

type fixture struct {
	server    *httptest.Server
	images    atomic.Int32
	failImage atomic.Bool
	editRefs  atomic.Int32
}

func newFixture(t *testing.T) *fixture {
	f := &fixture{}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("api-key") != "test-secret" {
			t.Errorf("missing API key")
			w.WriteHeader(401)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "chat/completions"):
			var d Object
			if e := json.NewDecoder(r.Body).Decode(&d); e != nil {
				t.Error(e)
				return
			}
			raw := fmt.Sprint(d["messages"])
			text := "확인"
			switch {
			case strings.Contains(raw, "Review this rendered slide"):
				text = `{"passed":false,"feedback":"Unreadable slide text"}`
			case strings.Contains(raw, "slide-template visual analyst"):
				text = `{"template_role":"title","layout_structure":"centered","content_capacity":"low","text_regions":[],"image_regions":[],"visual_density":"low","style_keywords":["minimal"],"color_palette":["#FFFFFF"],"notes":"검증용"}`
			case strings.Contains(raw, "<!-- BEGIN -->"):
				text = "<!-- BEGIN -->\n## 시작\n- 첫 번째 핵심\n## 다음 단계\n- 실행 계획\n<!-- END -->"
			case strings.Contains(raw, "TTS_SCRIPT:"):
				text = "--- SLIDE_TEXT ---\n슬라이드 내용\n--- SLIDE_TEXT_END ---\nLayout: centered\nTTS_SCRIPT: 안녕하세요. 발표를 시작하겠습니다.\n<!-- PAGE_END -->"
			case strings.Contains(raw, "narration"):
				text = "안녕하세요. 발표를 시작하겠습니다."
			}
			if boolean(d, "stream") {
				w.Header().Set("Content-Type", "text/event-stream")
				for _, part := range []string{text[:len(text)/2], text[len(text)/2:]} {
					fmt.Fprintf(w, "data: %s\n\n", jsonText(Object{"choices": []Object{{"delta": Object{"content": part}}}}))
					w.(http.Flusher).Flush()
				}
				fmt.Fprint(w, "data: [DONE]\n\n")
			} else {
				_ = json.NewEncoder(w).Encode(Object{"choices": []Object{{"message": Object{"content": text}, "finish_reason": "stop"}}})
			}
		case strings.Contains(r.URL.Path, "images/"):
			f.images.Add(1)
			if f.failImage.Load() {
				w.WriteHeader(400)
				fmt.Fprint(w, `{"error":{"code":"BadImage","message":"image failed test-secret"}}`)
				return
			}
			if strings.HasSuffix(r.URL.Path, "/edits") {
				if e := r.ParseMultipartForm(8 << 20); e != nil {
					t.Error(e)
					return
				}
				defer r.MultipartForm.RemoveAll()
				f.editRefs.Store(int32(len(r.MultipartForm.File["image[]"])))
			}
			_ = json.NewEncoder(w).Encode(Object{"data": []Object{{"b64_json": base64.StdEncoding.EncodeToString(testImage())}}})
		default:
			t.Errorf("unexpected Azure route %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}
func newTestServer(t *testing.T, f *fixture) *Server {
	cfg := Config{DataDir: t.TempDir(), Endpoint: f.server.URL, APIKey: "test-secret", APIVersion: "v1", TextDeployment: "gpt-5.5", CaptionDeployment: "gpt-5.5", ImageDeployment: "gpt-image-2", TTSDeployment: "tts", AllowTestHTTP: true, Timeout: time.Minute, MaxUpload: 64 << 20, MaxPages: 100, Tesseract: "tesseract", OCRLanguages: "eng", PDFText: "pdftotext", PDFRender: "pdftoppm", FFmpeg: "ffmpeg", FFprobe: "ffprobe", Office: "soffice"}
	s, e := NewServer(cfg)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(s.Close)
	return s
}
func call(t *testing.T, s *Server, method, path string, data any, want int) Object {
	t.Helper()
	var body io.Reader
	if data != nil {
		raw, _ := json.Marshal(data)
		body = bytes.NewReader(raw)
	}
	r := httptest.NewRequest(method, path, body)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-SolA-Session", s.Token)
	w := httptest.NewRecorder()
	s.Handler(true).ServeHTTP(w, r)
	if w.Code != want {
		t.Fatalf("%s %s: expected %d, got %d: %s", method, path, want, w.Code, w.Body.String())
	}
	var response Object
	if e := json.Unmarshal(w.Body.Bytes(), &response); e != nil {
		t.Fatalf("invalid JSON: %s", w.Body.String())
	}
	return response
}
func dataOf(o Object) Object { return object(o["data"]) }
func uploadTest(t *testing.T, s *Server, path, field, name string, raw []byte, want int) Object {
	t.Helper()
	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile(field, name)
	_, _ = part.Write(raw)
	writer.Close()
	r := httptest.NewRequest("POST", path, &b)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("X-SolA-Session", s.Token)
	w := httptest.NewRecorder()
	s.Handler(true).ServeHTTP(w, r)
	if w.Code != want {
		t.Fatalf("upload %s: %d %s", path, w.Code, w.Body.String())
	}
	var result Object
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	return dataOf(result)
}
func waitTask(t *testing.T, s *Server, id, status string) Object {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		task, e := s.Store.Get("task", id)
		if e != nil {
			t.Fatal(e)
		}
		if oneOf(str(task, "status"), "COMPLETED", "FAILED") {
			if str(task, "status") != status {
				t.Fatalf("task %s: %s", id, jsonText(task))
			}
			return task
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("task timed out")
	return nil
}
func TestEndToEndGoWorkflow(t *testing.T) {
	f := newFixture(t)
	s := newTestServer(t, f)
	project := dataOf(call(t, s, "POST", "/api/projects", Object{"idea_prompt": "두 장의 발표자료"}, 201))
	pid := str(project, "project_id")
	base := "/api/projects/" + pid
	// The existing UI consumes page and done events from this exact endpoint.
	r := httptest.NewRequest("POST", base+"/generate/outline/stream", strings.NewReader(`{"language":"ko"}`))
	r.Header.Set("X-SolA-Session", s.Token)
	w := httptest.NewRecorder()
	s.Handler(true).ServeHTTP(w, r)
	if !strings.Contains(w.Body.String(), "event: done") || strings.Count(w.Body.String(), "event: page") != 2 {
		t.Fatal(w.Body.String())
	}
	pages, e := s.pages(pid)
	if e != nil || len(pages) != 2 {
		t.Fatal(pages, e)
	}
	first := str(pages[0], "page_id")
	r = httptest.NewRequest("POST", base+"/generate/descriptions/stream", strings.NewReader(`{}`))
	r.Header.Set("X-SolA-Session", s.Token)
	w = httptest.NewRecorder()
	s.Handler(true).ServeHTTP(w, r)
	if strings.Count(w.Body.String(), "event: description") != 2 || !strings.Contains(w.Body.String(), "event: done") {
		t.Fatal(w.Body.String())
	}
	page, _ := s.Store.Get("page", first)
	if str(page, "narration_text") == "" {
		t.Fatal("missing generated narration")
	}
	call(t, s, "PUT", base+"/pages/"+first+"/narration", Object{"narration_text": ""}, 200)
	call(t, s, "POST", base+"/pages/"+first+"/generate/description", Object{}, 200)
	page, _ = s.Store.Get("page", first)
	if page["narration_text"] != "" {
		t.Fatal("explicit blank narration overwritten")
	}
	job := dataOf(call(t, s, "POST", base+"/generate/images", Object{}, 202))
	waitTask(t, s, str(job, "task_id"), "COMPLETED")
	if f.images.Load() != 2 {
		t.Fatal("wrong image count")
	}
	edit := dataOf(call(t, s, "POST", base+"/pages/"+first+"/edit/image", Object{"edit_instruction": "Region in original image pixels: x=10,y=10,width=30,height=30. Change the colour."}, 202))
	waitTask(t, s, str(edit, "task_id"), "COMPLETED")
	if f.editRefs.Load() < 1 {
		t.Fatal("edit omitted original image")
	}
	versions := items(dataOf(call(t, s, "GET", base+"/pages/"+first+"/image-versions", nil, 200))["versions"])
	if len(versions) != 2 {
		t.Fatal(versions)
	}
	call(t, s, "POST", base+"/pages/"+first+"/image-versions/"+str(versions[0], "version_id")+"/set-current", nil, 200)
	for _, format := range []string{"pptx", "pdf", "images"} {
		result := dataOf(call(t, s, "GET", base+"/export/"+format, nil, 200))
		path, e := s.ExportPath(str(result, "download_url"))
		if e != nil {
			t.Fatal(e)
		}
		if format == "pdf" {
			raw, _ := os.ReadFile(path)
			if !bytes.HasPrefix(raw, []byte("%PDF-1.4")) {
				t.Fatal("invalid PDF")
			}
			if command, _ := exec.LookPath("pdfinfo"); command != "" {
				out, e := exec.Command(command, path).CombinedOutput()
				if e != nil {
					t.Fatalf("pdfinfo: %s %v", out, e)
				}
			}
		} else {
			archive, e := zip.OpenReader(path)
			if e != nil {
				t.Fatal(e)
			}
			if format == "pptx" {
				slideCount := 0
				for _, file := range archive.File {
					if strings.HasPrefix(file.Name, "ppt/slides/slide") && strings.HasSuffix(file.Name, ".xml") {
						slideCount++
					}
					if strings.HasSuffix(file.Name, ".xml") || strings.HasSuffix(file.Name, ".rels") {
						reader, _ := file.Open()
						decoder := xml.NewDecoder(reader)
						for {
							_, e = decoder.Token()
							if e == io.EOF {
								break
							}
							if e != nil {
								t.Fatalf("%s: %v", file.Name, e)
							}
						}
						reader.Close()
					}
				}
				if slideCount != 2 {
					t.Fatal(slideCount)
				}
			}
			archive.Close()
		}
	}
	f.failImage.Store(true)
	job = dataOf(call(t, s, "POST", base+"/generate/images", Object{}, 202))
	failed := waitTask(t, s, str(job, "task_id"), "FAILED")
	if strings.Contains(jsonText(failed), "test-secret") {
		t.Fatal("credential leaked")
	}
	if num(object(failed["progress"]), "failed") != 2 {
		t.Fatal("missing failure diagnostics")
	}
}
func TestUploadsAndTemplateAnalysis(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	pid := str(dataOf(call(t, s, "POST", "/api/projects", Object{"creation_type": "blank"}, 201)), "project_id")
	base := "/api/projects/" + pid
	page := dataOf(call(t, s, "POST", base+"/pages", Object{"outline_content": Object{"title": "검증", "points": []string{}}}, 201))
	asset := uploadTest(t, s, base+"/template-assets?bind_to_page="+str(page, "page_id"), "image", "sample.png", testImage(), 201)
	waitTask(t, s, str(asset, "analyze_task_id"), "COMPLETED")
	listed := items(dataOf(call(t, s, "GET", base+"/template-assets", nil, 200))["assets"])
	if len(listed) != 1 || str(listed[0], "analysis_status") != "completed" {
		t.Fatal(listed)
	}
	call(t, s, "PATCH", base+"/template-assets/"+str(listed[0], "id"), Object{"sort_order": 5, "user_label": "표지"}, 200)
	call(t, s, "PATCH", base+"/template-mode", Object{"mode": "single", "unified_asset_id": str(listed[0], "id")}, 200)
	ref := uploadTest(t, s, "/api/reference-files/upload", "file", "brief.md", []byte("# 발표 자료\n검증용 문서"), 201)
	id := str(object(ref["file"]), "id")
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		ref, _ := s.Store.Get("reference", id)
		if str(ref, "parse_status") == "completed" {
			if !strings.Contains(str(ref, "markdown_content"), "검증용") {
				t.Fatal(ref)
			}
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	call(t, s, "POST", "/api/reference-files/"+id+"/associate", Object{"project_id": pid}, 200)
	all := items(dataOf(call(t, s, "GET", "/api/reference-files/project/"+pid, nil, 200))["files"])
	if len(all) != 1 {
		t.Fatal(all)
	}
	material := uploadTest(t, s, base+"/materials/upload", "file", "image.png", testImage(), 201)
	call(t, s, "GET", "/api/materials/"+str(material, "id")+"/caption", nil, 200)
	call(t, s, "DELETE", "/api/materials/"+str(material, "id"), nil, 200)
}
func TestAuthPathsAndSettings(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	for _, origin := range []string{"https://evil.example", "null"} {
		r := httptest.NewRequest("GET", "/api/settings", nil)
		r.Header.Set("Origin", origin)
		r.Header.Set("X-SolA-Session", s.Token)
		w := httptest.NewRecorder()
		s.Handler(true).ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
	r := httptest.NewRequest("GET", "/api/settings", nil)
	w := httptest.NewRecorder()
	s.Handler(true).ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
	for _, path := range []string{"../settings.env", "/etc/passwd", "a/../../settings.env", "a\\file"} {
		if _, e := s.uploadPath(path); e == nil {
			t.Fatalf("path allowed: %s", path)
		}
	}
	if e := os.Symlink(t.TempDir(), filepath.Join(s.Config.DataDir, "uploads", "outside")); e == nil {
		if _, e = s.uploadPath("outside/new.png"); e == nil {
			t.Fatal("symlink parent escape")
		}
	}
	settings := dataOf(call(t, s, "PUT", "/api/settings", Object{"design_system_prompt": "태양을 모티브로 사용", "image_resolution": "1K"}, 200))
	if str(settings, "design_system_prompt") == "" {
		t.Fatal(settings)
	}
	call(t, s, "PUT", "/api/settings", Object{"api_key": "secret"}, 400)
	call(t, s, "PUT", "/api/settings", Object{"max_image_workers": 0}, 400)
	if strings.Contains(jsonText(settings), "test-secret") {
		t.Fatal("settings leaked secret")
	}
}
func TestImageVersionsConcurrent(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	p, e := s.newProject(Object{})
	if e != nil {
		t.Fatal(e)
	}
	pid := str(p, "project_id")
	page := s.newPage(pid, Object{}, 0)
	id := str(page, "page_id")
	if e = s.Store.Put("page", id, pid, 0, page); e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := s.saveImage(pid, id, testImage()); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	versions, e := s.Store.List("version", pid)
	if e != nil {
		t.Fatal(e)
	}
	numbers := map[int]bool{}
	current := 0
	for _, v := range versions {
		numbers[num(v, "version_number")] = true
		if boolean(v, "is_current") {
			current++
		}
	}
	if len(numbers) != 8 || current != 1 {
		t.Fatal(numbers, current)
	}
}
func TestCancellationAndRecovery(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	started := make(chan struct{})
	job, e := s.enqueue("p", "TEST", "idempotent", func(ctx context.Context, t *Task) error { close(started); <-ctx.Done(); return ctx.Err() })
	if e != nil {
		t.Fatal(e)
	}
	<-started
	duplicate, e := s.enqueue("p", "TEST", "idempotent", func(context.Context, *Task) error { panic("duplicate job ran") })
	if e != nil || str(duplicate, "task_id") != str(job, "task_id") {
		t.Fatal(duplicate, e)
	}
	s.Close()
	store, e := OpenStore(s.Config.DataDir)
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	task, e := store.Get("task", "idempotent")
	if e != nil || str(task, "status") != "FAILED" {
		t.Fatal(task, e)
	}
}

func TestQualityReviewFailureDoesNotSaveUnverifiedImage(t *testing.T) {
	f := newFixture(t)
	s := newTestServer(t, f)
	prefs := defaults()
	prefs["enable_image_quality_control"] = true
	if e := s.Store.Put("settings", "preferences", "", 0, prefs); e != nil {
		t.Fatal(e)
	}
	project, _ := s.newProject(Object{})
	pid := str(project, "project_id")
	page := s.newPage(pid, Object{}, 0)
	id := str(page, "page_id")
	s.Store.Put("page", id, pid, 0, page)
	if _, e := s.imageForPage(context.Background(), project, page, Object{}, false, nil); e == nil {
		t.Fatal("quality failure was ignored")
	}
	if f.images.Load() != 2 {
		t.Fatal("quality retries were not bounded", f.images.Load())
	}
	saved, _ := s.Store.Get("page", id)
	if str(saved, "status") != "FAILED" || str(saved, "_image") != "" {
		t.Fatal(saved)
	}
	versions, _ := s.Store.List("version", pid)
	if len(versions) != 0 {
		t.Fatal("unverified image version persisted")
	}
}
