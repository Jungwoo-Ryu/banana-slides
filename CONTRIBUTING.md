# Contributing to Sol.A

Use Go 1.27.3 and Node.js 22.23.4. The backend is backend/, Windows is wails/, and React/TypeScript is frontend/.

Run `go -C backend test -race ./...`, `go -C backend vet ./...`, `go -C backend run ./cmd/sola-check`, frontend build/lint/tests, and scripts/wails/verify-local.sh for UI/API changes. Validate actual downloaded files.

Keep English/Korean source and Korean UI defaults. Preserve AGPL-3.0 and upstream attribution. Never add credentials or user data. Work on feature branches; do not merge main without an explicit request.
