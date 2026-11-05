@echo off
setlocal
cd /d "%~dp0backend"
go run ./cmd/sola-dev --repo .. %*
if errorlevel 1 (
  echo Sol.A web startup failed. Install Go 1.27.3 and Node.js 22.23.4, then check .runtime\logs.
  pause
  exit /b 1
)
