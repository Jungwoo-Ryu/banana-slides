package backend

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// webAssets serves the built React application from the same Go process.
// API/file misses must never fall back to HTML or expose application data.
func webAssets(directory string) http.Handler {
	files := http.FileServer(http.Dir(directory))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/files/") {
			http.NotFound(w, r)
			return
		}
		path := filepath.Join(directory, filepath.FromSlash(r.URL.Path))
		if info, e := os.Stat(path); e == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		if filepath.Ext(r.URL.Path) != "" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(directory, "index.html"))
	})
}
