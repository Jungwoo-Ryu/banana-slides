#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
printf '#!/bin/sh\nexec scripts/pre-push-check.sh\n' > .git/hooks/pre-push
chmod +x .git/hooks/pre-push
