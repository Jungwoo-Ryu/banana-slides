#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec go run ./cmd/sola-server --no-auth --env-file ../.env "$@"
