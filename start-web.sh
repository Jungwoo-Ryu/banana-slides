#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
exec go run ./cmd/sola-dev --repo .. "$@"
