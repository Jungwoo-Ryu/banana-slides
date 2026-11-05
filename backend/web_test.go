package backend

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDescriptionKeepsOneSlideAndPreservesManualNarration(t *testing.T) {
	response := "<!-- BEGIN -->\n--- SLIDE_TEXT ---\nFirst slide\n--- SLIDE_TEXT_END ---\nTTS_SCRIPT: First narration\n<!-- PAGE_END -->\nSecond slide\nTTS_SCRIPT: Other narration\n<!-- PAGE_END -->\n<!-- END -->"
	p := Object{"narration_text": nil}
	setDescription(p, response)
	if str(p, "narration_text") != "First narration" {
		t.Fatal(p)
	}
	if text := str(object(p["description_content"]), "text"); strings.Contains(text, "Second") || strings.Contains(text, "<!--") || strings.Contains(text, "TTS_SCRIPT") {
		t.Fatal(text)
	}
	p["narration_text"] = "Manual script"
	setDescription(p, response)
	if str(p, "narration_text") != "Manual script" {
		t.Fatal("overwrote manual narration")
	}
}

func TestGoWebAssetsAndNetworkBoundary(t *testing.T) {
	f := newFixture(t)
	s := newTestServer(t, f)
	if e := s.Listen("0.0.0.0:0", false); e == nil {
		t.Fatal("network access must be explicit")
	}
	root := t.TempDir()
	if e := os.WriteFile(filepath.Join(root, "index.html"), []byte("<html>Sol.A</html>"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(root, "app.js"), []byte("export const ready = true;"), 0600); e != nil {
		t.Fatal(e)
	}
	handler := webAssets(root)
	for _, item := range []struct {
		path     string
		status   int
		contains string
	}{{"/project/test/preview", 200, "Sol.A"}, {"/app.js", 200, "export const"}, {"/missing.js", 404, ""}, {"/api/missing", 404, ""}, {"/files/missing", 404, ""}} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", item.path, nil))
		if w.Code != item.status || (item.contains != "" && !strings.Contains(w.Body.String(), item.contains)) {
			t.Fatalf("%s: %d %s", item.path, w.Code, w.Body.String())
		}
	}
}
