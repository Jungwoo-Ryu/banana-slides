# Sol.A — Go / Wails Windows desktop

기존 React/TypeScript 화면을 Wails WebView2 창에 표시하고, Python 백엔드의 API를 Go 애플리케이션 서비스로 옮긴 Windows 앱입니다. 앱 실행에 Python, Node.js, Electron 또는 Docker가 필요하지 않습니다. Node.js와 Go는 개발·빌드 시에만 사용합니다. 기존 웹/Electron 소스는 비교와 기존 배포를 위해 보존하며 새 EXE에 포함하지 않습니다.

## 실행

Windows 10/11 x64에서 `SolA.exe`를 실행하세요. WebView2 Runtime이 없으면 Wails 안내에 따라 Microsoft WebView2 Evergreen Runtime을 설치합니다.

소스에서 빌드하려면 Go **1.27.3**, Node **22.23.4**를 설치하고 루트의 `build-wails.bat`를 실행합니다. 이후 `start-wails.bat`로 실행할 수 있습니다. 수정한 코드를 반영하려면 `build-wails.bat`를 다시 실행합니다. 결과는 `wails/build/bin/SolA.exe`입니다.

빌드 스크립트는 고정 버전 Wails 2.17.1을 사용합니다. 결과 EXE와 portable ZIP은 GitHub Actions의 **Wails Windows** 워크플로에서도 생성합니다. 배포 서명은 별도 기업 코드 서명 인증서가 있어야 적용할 수 있습니다.

## Azure 연결과 데이터

설정 → **Sol.A 데스크톱 → Azure 연결 설정**에서 `settings.env`를 편집하고 앱을 다시 시작합니다.

```dotenv
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_VERSION=v1
AZURE_OPENAI_DEPLOYMENT=gpt-5.5
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2
AZURE_OPENAI_TTS_DEPLOYMENT=YOUR-TTS-DEPLOYMENT
OCR_LANGUAGES=kor+eng
```

실제 Azure **배포 이름**을 지정합니다. API 키 대신 `AZURE_OPENAI_API_KEY_FILE`에 비밀 파일 경로를 지정할 수도 있습니다. 사내 인증서는 `CORPORATE_CA_FILE`로 추가합니다. TLS 검증을 비활성화하지 않습니다. GPT-5.5 / gpt-image-2 호출은 사내 Azure에서 실행하며, 로컬 PC가 생성 모델을 구동하지 않습니다. 영상 생성에는 별도 Azure OpenAI TTS 배포가 필요합니다.

기본 저장 위치는 `%LOCALAPPDATA%\SolA`입니다. `SOLA_DATA_DIR`로 변경할 수 있습니다. `sola-go.db`, `uploads`, `settings.env`, `logs/desktop.log`를 보관합니다. 환경변수로 전달한 값이 설정 파일보다 우선합니다. 다른 사용자가 접근할 수 없는 사용자 폴더에 보관하세요.

설정의 **기존 프로젝트 가져오기**에서 기존 레포 루트를 선택하면 `backend/instance/*.db`를 읽기 전용으로 열고 `uploads`를 새 네임스페이스에 복사합니다. 원본 파일은 변경하지 않고 이미 존재하는 프로젝트 ID는 건너뜁니다. 실행 중인 작업은 가져오지 않습니다. 가져오기 전에 기존 웹 앱을 종료하면 일관된 문서 파일을 복사할 수 있습니다.

## 로컬 보조 프로그램

| 기능 | 필요한 프로그램 |
|---|---|
| 초안, 설명, 이미지 생성·영역 수정, 이미지 PPTX/PDF/ZIP | 추가 프로그램 없음 |
| PDF 템플릿 페이지 추출, PDF 참고 문서 | Poppler (`pdftoppm`, `pdftotext`) |
| 스캔 PDF OCR, 텍스트 편집 가능한 PPTX | Tesseract + `kor`, `eng` 언어 데이터 |
| PPT/PPTX 화면 렌더링, 구형 PPT/XLS 변환 | LibreOffice |
| TTS 발표 MP4 | FFmpeg + FFprobe, Azure TTS 배포 |

선택 설치 예: `powershell -NoProfile -File install-tools.ps1 -OCR -Video -PDF -Office`.

설치 스크립트는 winget의 정확한 패키지 ID를 사용하며 설치 프로그램의 해시를 검증합니다. 사내 정책에 따라 승인된 패키지로 수동 설치할 수도 있습니다. Tesseract 한국어 데이터는 공식 [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata)에서 설치합니다. 설치 후 **로컬 도구 확인**을 실행하세요. PATH에 없다면 `settings.env`에서 `TESSERACT_CMD`, `FFMPEG_PATH`, `FFPROBE_PATH`, `PDFTOTEXT_PATH`, `PDFTOPPM_PATH`, `LIBREOFFICE_PATH`에 실행 파일의 절대 경로를 지정합니다.

보조 프로그램은 셸 문자열을 실행하지 않고 인수 배열로 호출합니다. OCR/영상/문서 작업에는 시간 제한이 있으며 이미지 생성 1개, 무거운 변환 1개, 텍스트 요청 최대 2개를 동시에 실행합니다. 여러 프로젝트의 작업은 대기열을 공유합니다. 설정의 작업 수는 이 데스크톱 상한보다 높게 실행되지 않습니다.

## 구현 및 차이

- 동일한 프로젝트·페이지 API, 초안 SSE, 설명 단계별 SSE, 이미지 작업 진행 조회, 이미지 버전, 영역 수정, 발표 스크립트를 지원합니다.
- 기본·개별·PDF 템플릿, 템플릿 시각 분석과 자동 매칭, 사용자 스타일, 소재 생성·수정, 참고 문서를 지원합니다.
- 이미지 PPTX는 Go OOXML ZIP 작성기로 만들며 발표 스크립트는 슬라이드 노트에 포함합니다. PDF/ZIP도 Go에서 작성합니다.
- 편집 가능한 PPTX는 로컬 OCR의 텍스트를 텍스트 상자로 복원합니다. 아이콘·시각 요소 추출 옵션을 켜면 GPT-5.5로 영역을 식별하고 분리된 이미지 객체로 배치합니다. 균일한 테두리 배경은 로컬에서 투명화합니다. 원본에 없는 글꼴과 복잡한 배경을 완벽하게 복원하지는 못합니다. 로컬 배경 복원은 Go 구현이며 OpenCV의 결과와 동일하지 않습니다. 생성형 배경 복원은 Azure 이미지 모델을 사용합니다.
- Go DB는 기존 SQLAlchemy DB와 스키마가 다릅니다. 양방향 동기화가 아닌 명시적 가져오기를 사용합니다.
- API는 임의의 루프백 포트에서만 실행되고 창마다 생성한 세션 토큰으로 보호합니다. 외부 공개 서버나 여러 사용자의 인증 서버로 쓰지 마세요.
- 새 EXE에는 비밀 설정, Python 가상환경, 기존 업로드 데이터가 포함되지 않습니다. 앱 자동 업데이트나 코드 서명 인증서는 포함하지 않습니다.

## 개발 검증

```bash
cd wails
go test -race ./...
go run ./cmd/sola-server --data-dir ../.runtime/wails-dev --listen 127.0.0.1:5012 --no-auth
```

`--no-auth`는 로컬 테스트 전용입니다. Azure 프로토콜 모의 서버도 루프백 HTTP일 때만 `--allow-test-http`로 허용합니다. 실제 Azure 호출 테스트는 사내 인증과 비용이 발생하는 별도 검증입니다.

이 코드는 Banana Slides에서 파생된 AGPL-3.0 프로젝트입니다. 루트 LICENSE와 기존 저작권 표시를 유지합니다. Wails, WebView2, 보조 도구의 라이선스도 각각 적용됩니다.

## 검증 기록

2026-11-04: Go 저장소·API·Azure 프로토콜·작업 실패 및 중단·경로/세션 검증·기존 DB 가져오기·OCR/PDF·XLSX 테스트, 프론트엔드 200개 테스트, Go 서버를 사용하는 브라우저 통합 시나리오를 실행했습니다. 브라우저에서 다운로드한 PPTX는 독립적인 PowerPoint 파서로, MP4는 FFprobe로 확인했습니다. Go 의존성은 Linux와 Windows 대상 `govulncheck`에서 호출 가능한 취약점이 발견되지 않았습니다. Azure 응답은 로컬 프로토콜 모의 서버로 검증했으며 사내 실제 배포의 접근 권한·할당량·생성 품질은 연결 설정 후 확인해야 합니다.
