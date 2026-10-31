# Sol.A 로컬 웹 검증 기록

검증 환경: Linux, Python 3.12, Node.js **22.23.4**, FFmpeg/FFprobe, Chromium (Playwright). 실제 사내 Azure 키는 사용하지 않았습니다.

## 검증 범위

- 관련 백엔드 **239개** 테스트 통과: Azure 텍스트·비전·이미지 배포 이름 전달, 외부 모델 설정 거부, 키 비노출, 설정 migration과 기존 대본 보존, 디자인 기본값, TTS 대본 생성·수정, 영상 중복 실행 제한, 임시 파일 정리, 문서 파싱, 업로드 경로 이탈 방지, PPTX 생성.
- 프런트엔드 **63개** 테스트 통과: 프로젝트 초기화·저장, TTS 스크립트 갱신·편집, 내보내기 작업 복구·오류 처리, 서버 작업 ID 발급 전 폴링 방지.
- 실행 도구 관련 Python 테스트 **28개**, TypeScript 검사, Vite production build, 중국어 잔존 검사 및 변경 파일 Python 오류 검사 통과.
- `frontend/Dockerfile`의 builder 단계도 실제 빌드했습니다. 잠금 파일 기반 `npm ci`, Node 보안 검사, 웹 빌드를 포함합니다. 백엔드·통합 이미지 전체 배포 검증은 별도입니다.
- Playwright **5개** 시나리오: 한국어 설정 저장·재조회, 참고 파일 업로드·로컬 파싱, 빈 프로젝트 생성·영역 드래그·프롬프트 제출·PPTX 다운로드, Sol.A 태양 로고·디자인 기본값, TTS 대본 수정 직후 MP4 내보내기.
- PPTX는 브라우저에서 다운로드한 파일을 `python-pptx`로 다시 열어 검사합니다. MP4는 실제 FFmpeg로 생성한 파일을 브라우저에서 받은 뒤 FFprobe로 영상·음성 스트림을 확인합니다. 다운로드 이벤트는 클릭 전에 등록합니다.
- TTS E2E는 마지막으로 수정한 대본이 서버에 저장되고 Azure SDK 음성 요청의 입력에 그대로 전달되는지 검사합니다. 음성 API만 loopback HTTP 대역으로 대체하며 합성 테스트 음성을 반환합니다. 대역은 실제 음성 품질을 검증하지 않습니다.

전체 upstream 테스트 스위트가 아닌 변경과 관련된 테스트 결과입니다. 영역 편집의 유료 이미지 호출은 대역으로 요청 계약을 검증합니다. SDK 대역 테스트는 사내 Azure의 배포 권한·API 버전 호환성·생성 품질 검증을 대신하지 않습니다.

이전 로컬 실행기의 Windows `cmd.exe` 검증은 [기존 Actions 기록](https://github.com/Jungwoo-Ryu/banana-slides/actions/runs/40874993167)에 있습니다. 이번 Node 버전 변경을 포함한 Windows 결과는 현재 커밋의 `Local Web / windows-launcher` 실행에서 확인해야 합니다.

## 재현

Node.js 22.23.4 이상 지원 패치 버전과 FFmpeg/FFprobe, Tesseract `eng`, DejaVu Sans 글꼴을 준비합니다. 백엔드 테스트의 정확한 파일 목록과 실행 순서는 [.github/workflows/local-web.yml](../../.github/workflows/local-web.yml)의 `web-contracts` 작업에 있습니다.

```bash
uv sync --frozen --extra test --python 3.12
npm --prefix frontend ci
npm --prefix frontend run build:check
python scripts/check_source_language.py
python -m unittest discover -s scripts/tests -q
```

프런트엔드 회귀 테스트:

```bash
cd frontend
npx vitest run src/tests/store/useExportTasksStore.test.ts src/tests/store/useProjectStore.test.ts src/tests/store/useProjectStore.initializeProject.test.ts src/tests/components/DescriptionCard.test.tsx --poolOptions.threads.singleThread
```

브라우저 테스트는 실제 사용자 데이터와 분리한 DB·업로드 경로를 사용합니다. 저장소 루트에서 다음 환경을 설정하고 **같은 환경을 세 터미널에서 사용**합니다. 테스트용 Azure 주소와 키를 실제 `.env`에 저장하지 마세요.

```bash
export SOLA_E2E_FOLDER="$PWD/.runtime/sola-e2e"
export DATABASE_PATH="$SOLA_E2E_FOLDER/database.db"
export UPLOAD_FOLDER="$SOLA_E2E_FOLDER/uploads"
export SOLA_E2E_VIDEO=1
export AZURE_OPENAI_ENDPOINT=http://127.0.0.1:5044
export AZURE_OPENAI_API_KEY=local-test-key
export AZURE_OPENAI_API_VERSION=v1
export AZURE_OPENAI_TTS_DEPLOYMENT=local-test-speech
```

1. 첫 터미널: `uv run python frontend/e2e/helpers/fake_azure_tts.py`
2. 둘째 터미널: `uv run python scripts/start_local.py --no-browser`
3. 셋째 터미널: `cd frontend`, `npx playwright install chromium`, `npx playwright test --config playwright.local.config.ts`

완료 후 두 서버 터미널에서 Ctrl+C로 종료합니다. 테스트 대역은 테스트 대본만 `.runtime/sola-e2e/speech-inputs.jsonl`에 기록합니다. 운영 TTS는 대본을 파일 로그에 기록하지 않습니다.

## 남은 실제 환경 확인

- 사내 Azure GPT-5.5/GPT-image-2/별도 TTS 배포의 실제 연결·지원 기능·한국어 생성 품질.
- 한국어 OCR 정확도, 복잡한 표/차트·글꼴·배경의 복원 품질, 사내 프록시와 Root CA.
- 실제 1 vCPU·2GB 제한에서 여러 사용자의 부하·재시작 복구. 현재 영상은 프로세스당 1건만 접수하고 순차 인코딩하지만 분산 큐나 메모리 사용량 보장을 제공하지 않습니다.
- Sol.A OAuth·DB·사용량·사용자 소유권·영속 큐·FastMCP는 [후속 통합 명세](../../sola-integration.md)를 따릅니다.

## 소스 언어

주석·프롬프트·로그·오류·문서는 영어 또는 한국어를 사용합니다. `scripts/check_source_language.py`는 Git 추적 파일과 새 파일의 중국어 문자를 검사합니다. Unicode escape는 기존 입력 필드명과 문자 클래스 테스트 호환성에만 사용합니다. 기존 사용자 데이터는 번역 작업으로 덮어쓰지 않습니다.
