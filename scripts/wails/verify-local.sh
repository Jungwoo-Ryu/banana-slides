#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
for port in 5044 5012 3012; do
  if curl -s --max-time 1 "http://127.0.0.1:$port/" >/dev/null; then
    echo "Port $port is already in use. Stop the earlier test services first." >&2
    exit 1
  fi
done
mkdir -p .runtime
test_root="$(mktemp -d "$repo_root/.runtime/wails-browser-XXXXXX")"
service_pids=()
cleanup() {
  for service_pid in "${service_pids[@]}"; do kill "$service_pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
export SOLA_E2E_FOLDER="$test_root"
export SOLA_VERIFY_BIN="$test_root/sola-verify"
go -C backend build -o "$test_root/azure-fixture" ./cmd/azure-fixture
go -C backend build -o "$SOLA_VERIFY_BIN" ./cmd/sola-verify
go -C backend build -o "$test_root/sola-server" ./cmd/sola-server
"$test_root/azure-fixture" > "$test_root/azure.log" 2>&1 &
service_pids+=("$!")
AZURE_OPENAI_ENDPOINT=http://127.0.0.1:5044 AZURE_OPENAI_API_KEY=sk-fixture-must-not-leak \
AZURE_OPENAI_DEPLOYMENT=gpt-5.5 AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2 \
AZURE_OPENAI_TTS_DEPLOYMENT=tts-fixture OCR_LANGUAGES=eng \
"$test_root/sola-server" --no-auth --allow-test-http --data-dir "$test_root/data" \
  --listen 127.0.0.1:5012 > "$test_root/backend.log" 2>&1 &
service_pids+=("$!")
(
  cd frontend
  exec env BACKEND_PORT=5012 FRONTEND_PORT=3012 node node_modules/vite/bin/vite.js --host 127.0.0.1
) > "$test_root/frontend.log" 2>&1 &
service_pids+=("$!")
ready=false
for attempt in {1..45}; do
  if curl -fsS --max-time 1 http://127.0.0.1:3012/ >/dev/null 2>&1 && \
     curl -fsS --max-time 1 http://127.0.0.1:5012/health >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  cat "$test_root/frontend.log" "$test_root/backend.log" >&2
  exit 1
fi
cd frontend
SOLA_E2E_VIDEO=1 SOLA_GO_E2E=1 BASE_URL=http://127.0.0.1:3012 npx playwright test --config playwright.wails.config.ts
printf 'Protocol and application logs: %s\n' "$test_root"
