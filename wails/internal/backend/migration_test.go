package backend

import (
	"archive/zip"
	"context"
	"database/sql"
	"image"
	"image/color"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestLegacyImportPreservesOriginalAndVersions(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	root := t.TempDir()
	instance := filepath.Join(root, "backend", "instance")
	if e := os.MkdirAll(instance, 0700); e != nil {
		t.Fatal(e)
	}
	uploads := filepath.Join(root, "uploads", "project-one", "pages")
	if e := os.MkdirAll(uploads, 0700); e != nil {
		t.Fatal(e)
	}
	source := filepath.Join(uploads, "slide.png")
	if e := os.WriteFile(source, testImage(), 0600); e != nil {
		t.Fatal(e)
	}
	db, e := sql.Open("sqlite", filepath.Join(instance, "banana_slides.db"))
	if e != nil {
		t.Fatal(e)
	}
	for _, query := range []string{`CREATE TABLE projects(id TEXT,idea_prompt TEXT,image_aspect_ratio TEXT,status TEXT)`, `INSERT INTO projects VALUES('project-one','기존 프로젝트','16:9','COMPLETED')`, `CREATE TABLE pages(id TEXT,project_id TEXT,order_index INTEGER,outline_content TEXT,description_content TEXT,narration_text TEXT,generated_image_path TEXT,status TEXT)`, `INSERT INTO pages VALUES('page-one','project-one',0,'{"title":"원본 제목","points":["본문"]}','{"text":"설명"}','의도적으로 보존할 대본','project-one/pages/slide.png','COMPLETED')`, `CREATE TABLE page_image_versions(id TEXT,page_id TEXT,image_path TEXT,version_number INTEGER,is_current INTEGER)`, `INSERT INTO page_image_versions VALUES('version-one','page-one','project-one/pages/slide.png',1,1)`} {
		if _, e = db.Exec(query); e != nil {
			t.Fatal(e)
		}
	}
	db.Close()
	counts, e := s.ImportLegacy(root)
	if e != nil {
		t.Fatal(e)
	}
	if counts["project"] != 1 || counts["page"] != 1 || counts["version"] != 1 {
		t.Fatal(counts)
	}
	page, e := s.Store.Get("page", "page-one")
	if e != nil {
		t.Fatal(e)
	}
	if str(page, "narration_text") != "의도적으로 보존할 대본" || str(object(page["outline_content"]), "title") != "원본 제목" {
		t.Fatal(page)
	}
	imported, e := s.ExportPath(str(page, "generated_image_url"))
	if e != nil {
		t.Fatal(e)
	}
	if imported == source {
		t.Fatal("source was not copied")
	}
	versions, e := s.Store.List("version", "project-one")
	if e != nil || len(versions) != 1 || !boolean(versions[0], "is_current") {
		t.Fatal(versions, e)
	}
	if _, e = os.Stat(source); e != nil {
		t.Fatal("original removed", e)
	}
	counts, e = s.ImportLegacy(root)
	if e != nil || counts["project"] != 0 || counts["skipped_projects"] != 1 {
		t.Fatal(counts, e)
	}
}
func TestAzureRetryAndDatedEndpoint(t *testing.T) {
	var calls atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/deployments/corporate-model/chat/completions") || r.URL.Query().Get("api-version") != "2026-01-01-preview" {
			t.Error(r.URL.String())
		}
		if calls.Add(1) == 1 {
			w.WriteHeader(429)
			w.Write([]byte(`{"error":{"code":"RateLimit","message":"retry"}}`))
			return
		}
		w.Write([]byte(`{"choices":[{"message":{"content":"recovered"},"finish_reason":"stop"}]}`))
	}))
	defer api.Close()
	cfg := newTestServer(t, newFixture(t)).Config
	cfg.Endpoint = api.URL
	cfg.APIVersion = "2026-01-01-preview"
	cfg.TextDeployment = "corporate-model"
	result, e := NewAzure(cfg).Text(context.Background(), "test", nil, 100, nil)
	if e != nil || result != "recovered" || calls.Load() != 2 {
		t.Fatal(result, e, calls.Load())
	}
}
func TestLocalOCRAndTemplatePDF(t *testing.T) {
	if _, e := exec.LookPath("tesseract"); e != nil {
		t.Skip("Tesseract is not installed")
	}
	s := newTestServer(t, newFixture(t))
	folder := t.TempDir()
	path := filepath.Join(folder, "slide.png")
	if e := os.WriteFile(path, testImage(), 0600); e != nil {
		t.Fatal(e)
	}
	lines, e := s.ocr(context.Background(), path)
	if e != nil {
		t.Fatal(e)
	}
	if len(lines) == 0 {
		t.Fatal("OCR did not find test text")
	}
	pdf := filepath.Join(folder, "slide.pdf")
	if e = writePDF(pdf, []exportSlide{{ImagePath: path}}); e != nil {
		t.Fatal(e)
	}
	if _, e = exec.LookPath("pdftoppm"); e != nil {
		t.Skip("Poppler is not installed")
	}
	count := 0
	e = s.renderPDF(context.Background(), pdf, func(index int, rendered string) error {
		count++
		raw, e := os.ReadFile(rendered)
		if e != nil {
			return e
		}
		_, e = decodeImage(raw)
		return e
	})
	if e != nil || count != 1 {
		t.Fatal(e, count)
	}
	parsed, e := s.parseDocument(context.Background(), pdf)
	if e != nil || !strings.Contains(strings.ToUpper(parsed), "SLIDE") {
		t.Fatal(parsed, e)
	}
}
func TestSpreadsheetResolvesSharedStrings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sample.xlsx")
	file, e := os.Create(path)
	if e != nil {
		t.Fatal(e)
	}
	archive := zip.NewWriter(file)
	entry, _ := archive.Create("xl/sharedStrings.xml")
	entry.Write([]byte(`<sst><si><t>한국어 제목</t></si><si><r><t>두 번째</t></r><r><t> 값</t></r></si></sst>`))
	entry, _ = archive.Create("xl/worksheets/sheet1.xml")
	entry.Write([]byte(`<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c><c r="C1" t="s"><v>1</v></c></row></sheetData></worksheet>`))
	archive.Close()
	file.Close()
	text, e := zipText(path)
	if e != nil || !strings.Contains(text, "A1: 한국어 제목") || !strings.Contains(text, "B1: 42") || !strings.Contains(text, "C1: 두 번째 값") {
		t.Fatal(text, e)
	}
}
func TestTransparentSubjectRetainsInteriorHighlights(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 12, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 12; x++ {
			img.Set(x, y, color.White)
		}
	}
	for y := 3; y < 9; y++ {
		for x := 3; x < 9; x++ {
			img.Set(x, y, color.Black)
		}
	}
	img.Set(5, 5, color.White)
	out := removeBorderBackground(img)
	if out.NRGBAAt(0, 0).A != 0 || out.NRGBAAt(5, 5).A != 255 || out.NRGBAAt(3, 3).A != 255 {
		t.Fatal("subject mask removed interior pixels")
	}
}
func TestAssetOwnershipAndInvalidOrders(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	p1, _ := s.newProject(Object{})
	p2, _ := s.newProject(Object{})
	pid := str(p1, "project_id")
	page := s.newPage(pid, Object{}, 0)
	s.Store.Put("page", str(page, "page_id"), pid, 0, page)
	asset, e := s.newAsset(str(p2, "project_id"), testImage(), "upload", "")
	if e != nil {
		t.Fatal(e)
	}
	call(t, s, "PATCH", "/api/projects/"+pid+"/pages/"+str(page, "page_id")+"/template", Object{"template_asset_id": asset["id"]}, 404)
	call(t, s, "PUT", "/api/projects/"+pid, Object{"pages_order": []string{str(page, "page_id"), str(page, "page_id")}}, 400)
	call(t, s, "GET", "/api/projects/"+str(p2, "project_id")+"/pages/"+str(page, "page_id")+"/image-versions", nil, 404)
}

func TestWindowsDriveFileURI(t *testing.T) {
	if got := fileURI("C:/Users/Test User/data.db", "mode=ro"); got != "file:///C:/Users/Test%20User/data.db?mode=ro" {
		t.Fatal(got)
	}
}

func TestThumbnailKeepsOriginalCoordinates(t *testing.T) {
	s := newTestServer(t, newFixture(t))
	project, _ := s.newProject(Object{})
	pid := str(project, "project_id")
	page := s.newPage(pid, Object{}, 0)
	id := str(page, "page_id")
	if e := s.Store.Put("page", id, pid, 0, page); e != nil {
		t.Fatal(e)
	}
	page, e := s.saveImage(pid, id, testImage())
	if e != nil {
		t.Fatal(e)
	}
	original, _ := s.ExportPath(str(page, "generated_image_url"))
	thumb, _ := s.ExportPath(str(page, "thumbnail_image_url"))
	originalFile, _ := os.Open(original)
	originalCfg, _, e := image.DecodeConfig(originalFile)
	originalFile.Close()
	if e != nil || originalCfg.Width != 640 {
		t.Fatal(originalCfg, e)
	}
	thumbFile, _ := os.Open(thumb)
	thumbCfg, _, e := image.DecodeConfig(thumbFile)
	thumbFile.Close()
	if e != nil || thumbCfg.Width != 480 {
		t.Fatal(thumbCfg, e)
	}
	r := httptest.NewRequest("GET", str(page, "thumbnail_image_url"), nil)
	r.Header.Set("X-SolA-Session", s.Token)
	w := httptest.NewRecorder()
	s.Handler(true).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestReferenceImagesRejectInternalAddresses(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "10.1.2.3", "169.254.169.254", "100.100.100.200", "::1", "::ffff:127.0.0.1", "192.168.10.10"} {
		if publicIP(net.ParseIP(address)) {
			t.Fatal("internal address allowed", address)
		}
	}
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer server.Close()
	if _, e := fetchPublicImage(context.Background(), server.URL+"/metadata"); e == nil {
		t.Fatal("loopback image fetch accepted")
	}
	if hits.Load() != 0 {
		t.Fatal("request reached internal server")
	}
}
