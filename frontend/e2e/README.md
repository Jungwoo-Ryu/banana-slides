# Go browser tests

Run scripts/wails/verify-local.sh from the repository root. It builds the Go API, Go Azure fixture and Go export verifier, then starts Vite and runs the local-web, regression-web, region-editor and wails-go scenarios. Requires Go, Node.js, Playwright Chromium, Tesseract, FFmpeg, Poppler and LibreOffice. No paid Azure requests are made.
