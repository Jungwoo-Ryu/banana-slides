# Project notes

- The sole backend is the Go module in backend/. Wails imports it with a local module replacement. Web and desktop must share its implementation.
- Pin Go to 1.27.3 and Node.js to a supported security patch (22.23.4 baseline). Do not restore retired interpreter/Electron backends.
- Run go -C backend test -race ./..., go -C backend run ./cmd/sola-check, and relevant frontend checks. Native Windows builds and file dialogs are tested in Wails Windows CI.
- Pin Playwright CI to ubuntu-24.04. Register download listeners before export and validate the saved PPTX with the Go verifier and LibreOffice/Poppler; HTTP 200 is insufficient.
- Preserve user databases and uploads. Legacy import is read-only and writes to sola-go.db in a separate namespace.
- The material toolbox can mount from multiple entry points. Share task state and polling by project; verify remounts and concurrent entry points.
- Write comments, prompts, errors and docs in English or Korean. Keep Korean UI defaults. Unicode aliases are for legacy input compatibility only.
- Preserve AGPL-3.0, upstream attribution and third-party notices. Never commit secrets, user uploads or generated binaries.
- main contains general open-source features only. Website-specific changes belong in production/bananaslides-online. Do not merge or synchronize main without explicit authorization.
