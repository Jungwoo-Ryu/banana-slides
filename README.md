# Sol.A — 발표자료 로컬 웹

[Anionex/banana-slides](https://github.com/Anionex/banana-slides) 기반의 한국어 발표자료 작업공간입니다. 아이디어·문서로 슬라이드를 생성하고, 템플릿·디자인 프롬프트·영역 수정·발표 스크립트를 편집하여 PPTX/PDF/MP4로 내보냅니다. 원본 및 변경 코드에 [AGPL-3.0](LICENSE)이 적용됩니다.

## 실행

1. **Node.js 22.23.4 LTS**와 [uv](https://docs.astral.sh/uv/getting-started/installation/)를 설치합니다. 지원되는 다른 보안 패치 버전은 24.22.1 이상 24.x, 26.12.1 이상 26.x입니다. 패치 이전 버전과 지원 목록 외 메이저 버전은 실행 검사에서 차단합니다.
2. Windows에서 `start.bat`를 실행합니다. Python 3.12와 패키지, 초기 `.env`를 준비하고 브라우저를 엽니다. macOS/Linux는 `uv sync --frozen --python 3.12` 후 `uv run python scripts/start_local.py`를 실행합니다.
3. 프론트는 `http://127.0.0.1:3011`, 백엔드는 `http://127.0.0.1:5011`입니다. 종료는 실행 창에서 Ctrl+C를 누릅니다.

키가 없어도 빈 프로젝트와 편집 화면을 사용할 수 있습니다. 기존 `.env`는 자동 덮어쓰지 않으므로 [.env.example](.env.example)의 Azure 설정을 반영하고 재시작하세요. 로그는 `.runtime/logs/`에 있습니다.

## 사내 Azure Foundry OpenAI

텍스트·이미지 인식은 **GPT-5.5**, 이미지 생성·수정은 **GPT-image-2**로 고정합니다. 다른 제공자, 공개 OpenAI 주소, 모델 선택 UI, 역할별 임의 주소 덮어쓰기는 제거했습니다. 기존 DB의 제공자·모델 선택 열은 migration으로 제거합니다. 사용자 프로젝트와 저장한 스크립트는 유지합니다.

```dotenv
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_KEY=YOUR-KEY
AZURE_OPENAI_API_VERSION=v1
AZURE_OPENAI_DEPLOYMENT=YOUR-GPT-5.5-DEPLOYMENT
AZURE_OPENAI_IMAGE_DEPLOYMENT=YOUR-GPT-IMAGE-2-DEPLOYMENT
# 선택: 생략하면 텍스트 배포로 이미지 인식
AZURE_OPENAI_CAPTION_DEPLOYMENT=
# 별도 음성 모델 배포. 예: gpt-4o-mini-tts의 실제 배포 이름
AZURE_OPENAI_TTS_DEPLOYMENT=YOUR-TTS-DEPLOYMENT
AZURE_OPENAI_TTS_VOICE=alloy
```

배포 이름과 모델 이름은 다를 수 있습니다. 실제 배포가 위 모델인지 Azure에서 확인하세요. `v1`은 Azure `/openai/v1/` 경로를 사용하며 날짜 기반 Azure API 버전도 지정할 수 있습니다. 모델·API 버전별 지원은 실제 사내 리소스에서 검증해야 합니다. API 키는 환경변수 또는 `AZURE_OPENAI_API_KEY_FILE`의 마운트 파일에서만 읽습니다.

`CORPORATE_CA_FILE`로 사내 Root CA를 추가하고 `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`를 사용할 수 있습니다. TLS 검증은 항상 켜져 있습니다. 설정 화면의 서비스 테스트는 실제 API를 호출합니다.

## 디자인과 발표 스크립트

설정의 **디자인 시스템 프롬프트**에 회사 색상·여백·글꼴·레이아웃 지침을 저장합니다. 새 프로젝트에 기본 스타일로 복사되며 기존 프로젝트는 바뀌지 않습니다. 프로젝트에 직접 스타일을 지정하면 그 스타일을 사용합니다. 페이지별 템플릿과 스타일 지정, 기본 템플릿, PDF 템플릿의 페이지 분리·분석·자동 매칭도 사용할 수 있습니다. 지침은 생성 모델에 전달되며 픽셀·글꼴·좌표를 강제하는 PowerPoint 마스터 기능은 아닙니다.

슬라이드 설명을 생성할 때 LLM이 **TTS 발표 스크립트**도 작성합니다. 상세 편집 카드와 미리보기 속성 패널에서 최대 4000자까지 수정할 수 있습니다. 스크립트는 이미지에 표시할 텍스트와 분리해 저장하며 설명을 재생성해도 기존 스크립트를 덮어쓰지 않습니다.

## TTS 발표 동영상

1. FFmpeg와 FFprobe를 설치합니다. PATH에 없으면 `FFMPEG_PATH`에 ffmpeg 실행 파일 경로를 지정합니다. ffprobe는 같은 폴더에 있어야 합니다.
2. 사내 Azure의 음성 합성 배포를 `AZURE_OPENAI_TTS_DEPLOYMENT`에 설정합니다. GPT-5.5와 GPT-image-2만으로 음성 합성이 되지는 않습니다.
3. 슬라이드 이미지와 발표 스크립트를 확인한 뒤 **내보내기 → TTS로 발표 미디어 생성하기**를 누릅니다.
4. 음성과 속도를 선택하면 페이지별 음성 길이에 맞춰 재생하는 MP4를 만듭니다. 기존 스크립트는 그대로 사용하고 비어 있는 페이지만 AI가 작성합니다. 완료 파일은 내보내기 작업 패널에서 받습니다.

현재 영상 출력은 1280×720, 25fps이며 원본 비율은 여백으로 보존합니다. 영상은 프로세스당 한 작업만 접수하고 FFmpeg는 1스레드로 순차 인코딩합니다. 바쁜 동안에는 다시 시도 안내를 반환합니다. 이는 분산 작업 큐나 2GB 메모리 내 동시 사용 용량 보장을 뜻하지 않습니다. Edge TTS와 ElevenLabs는 사용하지 않습니다.

## 문서·OCR와 내보내기

기본 로컬 문서 파서는 PDF, DOCX, PPTX, XLSX/XLS, CSV, TXT, Markdown을 읽습니다. 스캔 PDF 및 OCR 편집형 PPTX에는 Tesseract와 `kor`, `eng` 언어 데이터가 필요합니다. `TESSERACT_CMD`, `OCR_LANGUAGES=kor+eng`로 설정합니다. 구형 DOC/PPT는 먼저 현대 형식으로 변환하세요. 기존 PPTX 재구성은 PDF 렌더링용 LibreOffice가 필요할 수 있습니다.

일반 PPTX는 페이지별 이미지를 담습니다. 편집형 PPTX는 OCR 텍스트 상자를 재구성하므로 표·차트·글꼴·배경의 완전 복원을 보장하지 않습니다. 영역 드래그 수정은 참고 이미지와 프롬프트로 재생성하는 방식이므로 지정 영역 밖도 바뀔 수 있습니다.

AI 생성·분석·TTS는 지정한 사내 Azure로 관련 내용을 전송합니다. 문서/OCR은 기본 로컬이며 사내 HTTP/MinerU 호환 어댑터를 명시적으로 설정할 수 있습니다. 데이터는 기본적으로 `uploads/`, DB는 `backend/instance/database.db`에 저장합니다. 기존 데이터 위치를 바꾸려면 서버 종료 후 직접 옮기고 `UPLOAD_FOLDER`, `EXPORT_FOLDER`, `DATABASE_PATH`를 설정하세요.

## 검증과 후속 통합

[검증 안내](docs/enterprise/VALIDATION.md), [어댑터 계약](docs/enterprise/ADAPTERS.md), [Sol.A 통합용 GitHub Copilot 프롬프트](sola-integration.md)를 참고하세요. 현재는 단일 사용자 로컬 웹입니다. Sol.A OAuth·사용자별 소유권·세션 사용량 집계·영속 작업 큐·원격 저장소·FastMCP는 후속 통합 범위입니다.

Node 기준 버전은 [공식 22.23.4 보안 릴리스](https://nodejs.org/en/blog/release/v22.23.4)에 맞췄습니다. Dockerfile 변경 후 기존 이미지는 반드시 재빌드해야 합니다. 웹의 Node 버전 검사와 레거시 Electron 내장 런타임은 별개이며 데스크톱 배포는 이 웹 검증 범위에 포함하지 않습니다.

Docker 프런트엔드 빌드에서 회사 인증서가 필요하면 BuildKit의 `--secret id=proxy_ca,src=/path/to/company-ca.pem`으로 전달할 수 있습니다. 인증서를 이미지에 저장하지 않고 npm 설치 단계에서만 추가 신뢰하며 TLS 검증은 유지합니다.
