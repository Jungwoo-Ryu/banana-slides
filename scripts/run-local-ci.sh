#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
go -C backend run ./cmd/sola-check
go -C backend test -race ./...
npm --prefix frontend run build:check
npm --prefix frontend run lint:strict
npm --prefix frontend run test:run -- --maxWorkers=1
