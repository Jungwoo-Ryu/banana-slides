# Sol.A ☀ — Go / Wails

개요·슬라이드 이미지·영역 편집·발표 대본·PPTX/PDF·TTS 영상을 만드는 앱입니다. **정식 백엔드는 `backend/`의 Go 코드**이며 Windows Wails 앱과 웹이 같은 구현을 사용합니다. 기존 Python 백엔드·의존성·마이그레이션 체인과 Electron 런처는 제거했습니다. 이전 소스는 Git 이력에서 확인할 수 있습니다.

## Windows 앱

1. [Wails Windows](https://github.com/Jungwoo-Ryu/banana-slides/actions/workflows/wails-windows.yml)의 성공한 작업에서 **SolA-Windows-x64**를 내려받습니다.
2. 내부 ZIP까지 압축을 풀고 `SolA.exe`를 실행합니다. Microsoft WebView2 Runtime이 필요합니다.
3. 설정 → **Azure 연결 설정**에서 사내 엔드포인트·키·배포 이름을 입력하고 재실행합니다.

소스에서는 Go **1.27.3**, Node.js **22.23.4**를 설치하고 `build-wails.bat` → `start.bat`를 실행합니다. Node.js는 UI 빌드에만 사용하며 배포 EXE에는 포함하지 않습니다. [데스크톱 상세 안내](wails/README.md)

## 로컬 웹

`.env.example`을 `.env`로 복사하고 Azure 설정을 입력합니다.

- Windows: `start-web.bat`
- Linux/macOS: `./start-web.sh`
- Go 서버만: `go -C backend run ./cmd/sola-server --no-auth --env-file ../.env`

Go 런처가 API와 Vite를 함께 시작합니다. UI는 http://127.0.0.1:3011, API는 http://127.0.0.1:5011, 로그는 `.runtime/logs/`입니다. 개발 웹 데이터는 `.runtime/data/`, Windows 앱 데이터는 `%LOCALAPPDATA%/SolA`에 저장합니다. `SOLA_DATA_DIR`로 변경할 수 있습니다.

## 코드 구조

| 경로 | 역할 |
|---|---|
| `backend/*.go` | API, SQLite 저장소, Azure 호출, 작업 큐, 문서 파싱, 내보내기 |
| `backend/cmd/sola-server` | 독립 Go 웹/API 서버 |
| `backend/cmd/sola-dev` | API·프론트엔드 개발 런처 |
| `backend/cmd/sola-cli` | Go HTTP API 명령줄 클라이언트 |
| `wails/` | Windows 창·네이티브 저장·설정·기존 데이터 가져오기 |
| `frontend/` | React/TypeScript UI |

## 모델과 로컬 도구

사내 **Azure Foundry OpenAI**만 사용합니다. GPT-5.5와 gpt-image-2의 실제 Azure 배포 이름을 지정합니다. 발표 영상은 별도 Azure OpenAI TTS 배포가 필요합니다.

| 기능 | 추가 로컬 도구 |
|---|---|
| 초안·이미지 생성·영역 수정·이미지 PPTX/PDF/ZIP | 없음 |
| PDF 페이지·텍스트 추출 | Poppler |
| 스캔 문서 OCR·편집 가능한 텍스트 추출 | Tesseract + kor/eng 언어 데이터 |
| Office 문서 렌더링 | LibreOffice |
| 발표 MP4 생성 | FFmpeg + FFprobe |

이미지 생성 1개, 무거운 변환 1개, 텍스트 요청 최대 2개를 동시에 처리합니다. Go가 로컬 보조 프로그램을 직접 호출합니다.

## 컨테이너

- API·정적 UI 분리: `docker compose up --build -d`
- 단일 Go 프로세스 + 정적 UI: `docker compose -f docker-compose.allinone.yml up --build -d`

기본 게시 주소는 `127.0.0.1:3011`, 데이터 볼륨은 `sola-data`입니다. 실행 이미지는 Go와 네이티브 보조 도구를 사용합니다. 외부 공개 시에는 인증된 게이트웨이가 필요합니다. 현재 앱은 로컬 단일 사용자용이며 OAuth·사용량·사용자별 접근 권한은 [Sol.A 통합 지침](sola-integration.md)의 후속 작업입니다.

## 기존 데이터

기존 `backend/instance/`와 `uploads/`는 덮어쓰지 않습니다. 데스크톱 설정의 **기존 프로젝트 가져오기**, 또는 다음 명령으로 이전 DB를 읽기 전용으로 가져옵니다.

```sh
go -C backend run ./cmd/sola-server --data-dir NEW_DATA_DIR --import-legacy OLD_REPOSITORY_ROOT
```

새 DB는 `sola-go.db`입니다. 이미 가져온 프로젝트 ID는 건너뜁니다. 이전 앱을 종료한 뒤 가져오세요.

## 검증

```sh
go -C backend test -race ./...
go -C backend run ./cmd/sola-check
npm --prefix frontend run test:run
scripts/wails/verify-local.sh
```

Azure 모의 서버와 파일 검증기도 Go입니다. 브라우저에서 받은 PPTX는 ZIP/XML과 LibreOffice·Poppler로, MP4는 FFprobe로 검증합니다. 실제 Azure의 접근 권한·할당량·품질은 사내 인증 정보로 별도 확인해야 합니다.

## 라이선스

Banana Slides에서 파생한 **AGPL-3.0** 프로젝트입니다. [LICENSE](LICENSE), 원저작자 표시와 배포 폴더의 `SOURCE.txt`, `THIRD_PARTY_NOTICES.txt`를 유지합니다.
