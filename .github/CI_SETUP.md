# Go and Wails CI

Wails Windows runs Go race/integration tests, protocol-fixture browser tests, and real Windows WebView2/save-dialog tests. Go Web checks frontend build/lint/unit tests and the Windows Go web launcher. Dependency Security checks official package provenance plus npm audit and govulncheck for both Go targets.

Use Go 1.27.3 and Node.js 22.23.4. Run `go -C backend run ./cmd/sola-check` and `scripts/wails/verify-local.sh` locally.
