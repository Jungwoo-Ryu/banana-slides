@echo off
cd /d "%~dp0"
go run ./cmd/sola-server --no-auth --env-file ../.env %*
