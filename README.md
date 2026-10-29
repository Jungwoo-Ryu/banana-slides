# Banana Slides — 한국어 로컬 웹

[Anionex/banana-slides](https://github.com/Anionex/banana-slides)를 기반으로 한 한국어 로컬 웹 버전입니다. 아이디어·개요·문서로 슬라이드를 만들고, 이미지에서 영역을 드래그한 뒤 문장으로 수정하여 PPTX/PDF로 내보냅니다.

현재 목표는 **Windows PC의 브라우저에서 기능을 평가하는 것**입니다. FastMCP 서버와 원격 샌드박스는 아직 구현하지 않았습니다. 교체 가능한 모델·문서·OCR·파일 저장소 인터페이스를 먼저 정리했습니다.

## Windows에서 실행

1. Node.js **22 LTS 이상**과 [uv](https://docs.astral.sh/uv/getting-started/installation/)를 설치합니다. Python 3.12는 uv가 준비합니다.
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install astral-sh.uv
   ```
2. 새 터미널을 열고 저장소를 받습니다.
   ```powershell
   git clone -b feat/korean-local-web https://github.com/Jungwoo-Ryu/banana-slides.git
   cd banana-slides
   ```
3. `start.bat`를 실행합니다. 첫 실행에는 Python/npm 패키지를 설치하고 `.env.example`을 `.env`로 복사합니다.
4. 준비되면 **http://127.0.0.1:3011**을 브라우저로 엽니다. 백엔드는 **http://127.0.0.1:5011**입니다.
5. 종료할 때 실행 창에서 **Ctrl+C**를 누릅니다. 실행 관리자가 자신이 시작한 두 서비스를 함께 종료합니다.

Docker와 계정 로그인은 필요하지 않습니다. 키가 없어도 설정·빈 프로젝트·수동 편집 화면을 확인할 수 있습니다. AI 생성에는 아래 연결 설정이 필요합니다.

첫 설치는 인터넷 연결이 필요합니다. Python/npm 다운로드가 사내 프록시에서 차단되면 먼저 터미널에 `HTTPS_PROXY`와 필요한 인증서 설정을 적용하세요. `start.bat`는 Windows 인증서 저장소도 사용합니다. 앱 실행 후의 CA 설정은 아래 절을 참고하세요.

macOS/Linux에서는 다음과 같이 실행합니다.

```bash
uv sync --frozen --python 3.12
uv run python scripts/start_local.py
```

## Azure OpenAI 설정

`.env`에 실제 연결 정보를 입력하고 앱을 다시 실행합니다.

```dotenv
AI_PROVIDER_FORMAT=azure
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_KEY=YOUR-KEY
AZURE_OPENAI_DEPLOYMENT=gpt-5.5
AZURE_OPENAI_API_VERSION=2025-04-01-preview
TEXT_MODEL=gpt-5.5
IMAGE_CAPTION_MODEL=gpt-5.5

# 실제로 생성한 이미지 모델 배포 이름을 입력해야 합니다.
AZURE_OPENAI_IMAGE_DEPLOYMENT=YOUR-IMAGE-DEPLOYMENT
IMAGE_MODEL=gpt-image-1
```

`AZURE_OPENAI_DEPLOYMENT`는 Azure에 만든 **배포 이름**입니다. `gpt-5.5`가 실제 배포 이름과 다르면 바꿔야 합니다. 텍스트 배포로 이미지 생성까지 할 수 있는 것은 아닙니다. 이미지 인식 배포를 따로 쓰려면 `AZURE_OPENAI_CAPTION_DEPLOYMENT`도 지정하세요. 모델·지역별 API 지원과 사용 권한은 보유한 Azure 리소스에서 확인해야 합니다.

Azure 텍스트와 OpenAI 이미지를 함께 쓸 수도 있습니다.

```dotenv
TEXT_MODEL_SOURCE=azure
IMAGE_CAPTION_MODEL_SOURCE=azure
IMAGE_MODEL_SOURCE=openai
OPENAI_API_KEY=YOUR-OPENAI-KEY
IMAGE_MODEL=gpt-image-1
```

Gemini는 해당 역할의 제공자를 `gemini`로 바꾸고 `GOOGLE_API_KEY`와 실제 사용할 모델 이름을 설정합니다. 설정 화면의 **서비스 테스트**는 저장된 설정으로 실제 API를 호출하므로 요금이 발생할 수 있습니다.

## 먼저 확인할 기능

1. 설정에서 텍스트·이미지·이미지 인식 연결을 확인합니다.
2. 홈에서 아이디어를 입력하거나 참고 문서를 업로드합니다.
3. 개요와 페이지 설명을 수정하고, 템플릿 또는 문장 스타일을 선택합니다.
4. 이미지를 생성한 뒤 미리보기의 **편집**을 누릅니다.
5. 이미지의 일부를 드래그하고 수정 요청을 입력합니다. **Ctrl+Enter**로 제출합니다.
6. 결과와 이전 버전을 비교하고 PPTX 또는 PDF를 다운로드합니다.

영역 선택은 선택 부분을 참고 이미지로 함께 전달하는 방식입니다. AI가 수정 결과를 생성하므로 Canva의 벡터 객체 편집과 같지 않으며, 지정 영역 밖이 항상 그대로 보존된다고 보장하지 않습니다. 일반 PPTX는 페이지 이미지를 담고, **편집 가능한 PPTX**는 OCR로 텍스트를 추출하여 편집 가능한 상자로 만듭니다.

## 편집 가능한 PPTX와 OCR

기본 문서 파서는 로컬에서 TXT/Markdown, PDF, DOCX, PPTX, XLSX/XLS를 읽습니다. 스캔 PDF와 편집형 PPTX에는 **Tesseract 실행 파일과 `kor`, `eng` 언어 데이터**가 필요합니다. Windows 설치 방법은 [Tesseract 공식 안내](https://tesseract-ocr.github.io/tessdoc/Installation.html)를 참고하세요.

```dotenv
OCR_PROVIDER=local
TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe
OCR_LANGUAGES=kor+eng
INPAINTING_PROVIDER=local
TEXT_STYLE_PROVIDER=local
```

설정의 OCR 테스트로 실행 파일과 언어 데이터를 확인할 수 있습니다. 로컬 OCR은 문자 위치를 추출하고 OpenCV가 문자 영역의 배경을 복원합니다. 표·차트의 원래 객체 구조나 정확한 글꼴·복잡한 배경 복원을 보장하지 않습니다. 더 정밀한 인식은 사내 OCR 어댑터, 배경 복원은 `generative`, 스타일 인식은 `caption`으로 교체할 수 있습니다. 생성형 처리는 설정한 모델 서비스로 이미지를 전송합니다.

아이콘 자동 배경 제거·모델 자동 다운로드와 동영상 메뉴는 로컬 기본 화면에서 제외했습니다. 구형 `.doc`/`.ppt`는 `.docx`/`.pptx` 또는 PDF로 변환하세요. PPTX를 기존 자료 재구성 모드로 렌더링하려면 LibreOffice 같은 별도 변환기가 필요할 수 있으므로 PDF 입력을 권장합니다.

## 자격 증명, 프록시, 저장 위치

- 키는 `.env`, 프로세스 환경변수 또는 `NAME_FILE`로 지정한 Secret Manager 마운트 파일에서만 읽습니다. 예: `AZURE_OPENAI_API_KEY_FILE=C:/secrets/azure-key`.
- 설정 화면과 DB에는 키를 저장하지 않습니다. 기존 버전에서 업그레이드하면 DB의 키/OAuth 열을 제거합니다. **기존 키는 환경변수에 다시 설정**해야 하며, 과거 백업에 남은 키는 별도로 관리해야 합니다.
- 환경변수가 `.env`보다 우선합니다. 비밀이 아닌 모델·생성 설정은 웹에서 저장한 값이 우선합니다.
- TLS 검증은 항상 켜져 있습니다. `CORPORATE_CA_FILE=C:/certs/company-root-ca.pem`으로 사내 Root CA를 추가할 수 있습니다. `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`를 지원합니다. 로컬 주소는 프록시 예외로 두세요.
- 기본 데이터는 `uploads/`, DB는 `backend/instance/database.db`, 실행 로그는 `.runtime/logs/`에 저장됩니다. `.env`, 업로드·DB·로그는 Git에서 제외합니다.
- 위치를 바꾸려면 `UPLOAD_FOLDER`, `EXPORT_FOLDER`, `DATABASE_PATH`에 절대 경로를 지정합니다. 기존 데이터는 자동 이동하지 않으므로 서버를 종료하고 직접 옮긴 뒤 설정하세요.
- 서버는 `127.0.0.1`에만 바인딩합니다. 현재 구성은 단일 사용자 로컬 평가용입니다.

모델 생성 시 프롬프트·관련 문서 내용·이미지가 설정한 AI 서비스로 전송됩니다. 문서/OCR은 기본 로컬이며, HTTP/MinerU를 명시적으로 선택한 경우 해당 서비스로 파일을 전송합니다. 자세한 계약은 [어댑터 안내](docs/enterprise/ADAPTERS.md)를 참고하세요.

## 문제 해결

- **포트 사용 중:** 기존 실행 창을 종료하거나 `.env`의 `BACKEND_PORT`, `FRONTEND_PORT`를 서로 다른 값으로 변경하세요.
- **기동 실패:** `.runtime/logs/backend.log`, `frontend.log`를 확인하세요. 설치 실패는 실행 창에 표시됩니다.
- **설정 준비됨인데 생성 실패:** 준비 상태는 필수 값의 존재를 뜻합니다. 실제 연결·배포 권한은 서비스 테스트로 확인하세요.
- **이미지 생성 실패:** 이미지 제공자, 모델 이름, 별도 이미지 배포와 지원 해상도를 확인하세요.
- **OCR 실패:** `tesseract --list-langs`에 `kor`와 `eng`가 있는지 확인하세요. 일반 이미지형 PPTX는 OCR 없이 내보낼 수 있습니다.

## 변경 및 검증

구조 분석과 작업 계획은 [MIGRATION_PLAN.md](docs/enterprise/MIGRATION_PLAN.md), 검증 범위는 [VALIDATION.md](docs/enterprise/VALIDATION.md)에 있습니다. upstream의 기능별 테스트 중 삭제된 로그인·제공자 설정을 전제로 한 테스트는 교체했습니다. 로컬 웹 검증 명령은 검증 문서에 정리했습니다.

원본 이력과 [AGPL-3.0 LICENSE](LICENSE)를 보존했습니다. 수정 프로그램과 해당 소스 제공 의무, PDF·OCR·모델 의존성의 별도 조건은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.
