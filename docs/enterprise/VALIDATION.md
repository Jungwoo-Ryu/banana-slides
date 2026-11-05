> Historical reference: setup has moved to the Go backend. Follow the root README and backend/README.md; commands below describe the retired implementation.

# Sol.A 로컬 웹 검증 기록

검증 환경: Linux, Python 3.12, Node.js **22.23.4**, FFmpeg/FFprobe, Chromium (Playwright). 실제 사내 Azure 키는 사용하지 않았습니다.

## 검증 범위

2026-11-01에 전체 회귀 검증으로 확대했고, Dev 브랜치에서 [이미지 일괄 생성 실패 진단](IMAGE_GENERATION_DEBUG.md)을 추가했습니다. [발견한 문제·수정·검증 상세](REGRESSION.md)를 참고하세요.

- 백엔드 전체 unit 및 로컬 integration **557개**, 프런트엔드 전체 **191개**, 실행 도구 **28개** 통과.
- Playwright **9개**: 설정·자료 업로드·영역 편집·PPTX 다운로드·디자인 기본값·TTS MP4, 개요/설명 SSE부터 이미지 생성·수정·버전 복원·정적 내보내기, PDF 템플릿 분할·분석·적용.
- TypeScript 검사, Vite production build, 소스 언어 검사 통과.
- 다운로드한 PPTX/PDF/ZIP/MP4를 다시 열어 내용을 검사합니다. MP4는 실제 FFmpeg가 만들며 FFprobe로 음성·영상 스트림을 확인합니다.
- 모델 응답은 localhost Azure 호환 프로토콜 대역을 사용합니다. 앱의 SDK·DB·SSE·작업·내보내기 경로는 실제 실행합니다. 사내 Azure 권한·지원 API·품질 검증을 대신하지 않습니다.
- 이전 단계에서는 프런트엔드 Docker builder 빌드와 Linux/Windows 실행 CI도 통과했습니다([2ed3760 Actions](https://github.com/Jungwoo-Ryu/banana-slides/actions/runs/41191522370)). 최신 커밋의 Windows 결과는 `Local Web / windows-launcher`에서 확인합니다.

## 재현

Node.js 22.23.4 이상 지원 패치 버전과 FFmpeg/FFprobe, Tesseract `eng`, DejaVu Sans 글꼴을 준비합니다. 백엔드 테스트의 정확한 파일 목록과 실행 순서는 [.github/workflows/local-web.yml](../../.github/workflows/local-web.yml)의 `web-contracts` 작업에 있습니다.

```bash
uv sync --frozen --extra test --python 3.12
npm --prefix frontend ci
npm --prefix frontend run build:check
python scripts/check_source_language.py
python -m unittest discover -s scripts/tests -q
uv run pytest backend/tests/unit backend/tests/integration/test_full_workflow.py backend/tests/integration/test_migration_019_backfill.py backend/tests/integration/test_reference_file_ssrf.py backend/tests/integration/test_requests_socks_proxy.py -q
```

프런트엔드 회귀 테스트:

```bash
cd frontend
npx vitest run --poolOptions.threads.singleThread
```

브라우저 테스트는 실제 사용자 데이터와 분리한 DB·업로드 경로를 사용합니다. 저장소 루트에서 다음 환경을 설정하고 **같은 환경을 세 터미널에서 사용**합니다. 테스트용 Azure 주소와 키를 실제 `.env`에 저장하지 마세요.

```bash
export SOLA_E2E_FOLDER="$PWD/.runtime/sola-e2e"
export DATABASE_PATH="$SOLA_E2E_FOLDER/database.db"
export UPLOAD_FOLDER="$SOLA_E2E_FOLDER/uploads"
export SOLA_E2E_VIDEO=1
# 검증 전용: OCR이 없어도 이미지 생성이 가능한지 확인합니다.
export TESSERACT_CMD=/nonexistent/sola-test-tesseract
export AZURE_OPENAI_ENDPOINT=http://127.0.0.1:5044
export AZURE_OPENAI_API_KEY=local-test-key
export AZURE_OPENAI_API_VERSION=v1
export AZURE_OPENAI_DEPLOYMENT=local-text
export AZURE_OPENAI_IMAGE_DEPLOYMENT=local-image
export AZURE_OPENAI_TTS_DEPLOYMENT=local-test-speech
```

1. 첫 터미널: `uv run python frontend/e2e/helpers/fake_azure_tts.py`
2. 둘째 터미널: `uv run python scripts/start_local.py --no-browser`
3. 셋째 터미널: `cd frontend`, `npx playwright install chromium`, `npx playwright test --config playwright.local.config.ts`

완료 후 두 서버 터미널에서 Ctrl+C로 종료합니다. 테스트 대역은 테스트 입력을 `.runtime/sola-e2e/speech-inputs.jsonl`과 `model-requests.jsonl`에 기록합니다. 운영 TTS는 대본을 파일 로그에 기록하지 않습니다.

## 남은 실제 환경 확인

- 사내 Azure GPT-5.5/GPT-image-2/별도 TTS 배포의 실제 연결·지원 기능·한국어 생성 품질.
- 한국어 OCR 정확도, 복잡한 표/차트·글꼴·배경의 복원 품질, 사내 프록시와 Root CA.
- 실제 1 vCPU·2GB 제한에서 여러 사용자의 부하·재시작 복구. 현재 영상은 프로세스당 1건만 접수하고 순차 인코딩하지만 분산 큐나 메모리 사용량 보장을 제공하지 않습니다.
- Sol.A OAuth·DB·사용량·사용자 소유권·영속 큐·FastMCP는 [후속 통합 명세](../../sola-integration.md)를 따릅니다.

## 소스 언어

주석·프롬프트·로그·오류·문서는 영어 또는 한국어를 사용합니다. `scripts/check_source_language.py`는 Git 추적 파일과 새 파일의 중국어 문자를 검사합니다. Unicode escape는 기존 입력 필드명과 문자 클래스 테스트 호환성에만 사용합니다. 기존 사용자 데이터는 번역 작업으로 덮어쓰지 않습니다.
