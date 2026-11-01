# 한국어 로컬 웹 리팩토링 계획

작성 시점: 구현 전. 대상: Jungwoo-Ryu/banana-slides #1.
기준: Anionex/banana-slides main을 사용자 레포의 초기 커밋과 병합하고 원본 이력/AGPL 고지를 보존한다.

## 현재 구조

- React/Vite 프론트엔드(3011) → Flask API(5011) → 서비스/Provider → SQLite 및 uploads.
- 페이지: 생성 → 개요 → 상세 설명 → 템플릿 → 슬라이드 미리보기/영역 편집 → PPTX/PDF/동영상 출력.
- 모델 인터페이스: services/ai_providers의 TextProvider / ImageProvider. 역할별 text/image/image_caption 라우팅이 있으나 자격 증명이 Settings DB에도 저장된다.
- 파일 파싱: FileParserService는 텍스트/스프레드시트 로컬 처리와 MinerU 업로드 처리가 섞여 있다.
- editable PPTX: image_editability의 extractor/inpaint registry를 통해 MinerU, Baidu OCR/인페인팅에 의존한다.
- 앱 인증은 ACCESS_CODE guard이며, 별도로 OpenAI OAuth 계정 로그인/토큰 저장 경로가 있다. 템플릿 이름의 user는 개인 작업공간 의미이며 사용자 계정 테이블은 아니다.
- 번역은 중앙 i18next JSON + 컴포넌트 내부 zh/en 사전 + 일부 인라인 문구로 분산되어 있다.

## 외부 통신 및 데이터 경로

| 경로 | 전송 데이터 | 기존 구현 | 변경 |
|---|---|---|---|
| 텍스트/이미지 인식 | 프롬프트, 문서 발췌, 참고 이미지 | ai_providers/text, ai_service | OpenAI/Gemini/Azure 역할별 인터페이스, 환경변수 자격 증명 |
| 이미지 생성/편집 | 설명, 슬라이드/선택 영역 이미지, 참조 이미지 | ai_providers/image | 역할별 Provider, Azure 별도 이미지 deployment |
| 문서 파싱 | 업로드한 원본 파일, 다운로드한 파싱 결과 | file_parser_service | 기본 로컬, 명시적으로 설정한 MinerU 호환/사내 HTTP 어댑터 |
| OCR/레이아웃 | 슬라이드 이미지 | image_editability, ai_providers/ocr | 로컬 OCR 및 사내 HTTP OCR 인터페이스 |
| 배경 제거 | 슬라이드 이미지와 제거 마스크 | inpaint_providers, inpainting_service | 로컬 마스크 인페인팅 또는 명시적 생성형 Provider |
| 모델 다운로드 | ONNX 가중치 | rmbg_segmentation_provider | 자동 ModelScope 다운로드 제거, 로컬 모델 경로만 허용 |
| 참조 이미지 다운로드 | 문서/모델이 반환한 URL | utils/remote_image*, file_parser_service | 기존 SSRF 검사 유지, 공통 HTTPS/CA 설정 |
| 음성/동영상 | 발표 대본 | tts_video_service | 선택적 기능 및 명시적 서비스 설정, 외부 전송 문서화 |
| 업데이트/후원/배포/소셜 | 버전/브라우저 요청 | update_check_service, Settings, Landing, Footer | 로컬 웹에서 제거 |
| 계정 OAuth | 로그인/갱신 토큰 | openai_oauth_controller, codex providers | API 로그인 경로와 UI 제거 |

## 단계 및 변경 대상

1. 현재 계획 및 라이선스 영향 기록 (본 문서, THIRD_PARTY_NOTICES, LICENSE).
2. 최소 실행 기반: pyproject/lock의 불필요한 vendor SDK·중국 미러 제거, .env.example, Windows start.bat + Python 실행 관리자.
3. Provider/통신: ai_providers factory, Azure text/image adapter, 공통 verified TLS 및 CA/프록시, 환경변수 기반 secret resolver. 설정 UI는 비밀값을 저장하지 않고 준비 상태만 표시.
4. 파싱/OCR: 기본 로컬 처리와 사내 HTTP 교체 계약, editable PPTX extractor/inpaint 연결. 기존 핵심 흐름 보존.
5. 한국어: 공통/컴포넌트 사전과 오류 표시, ko 출력 프롬프트; Settings를 사내 로컬용으로 단순화. 계정/후원/중국 provider 선택 제거.
6. 검증: Provider 라우팅/비밀값 비노출/TLS 설정 단위 테스트, 로컬 파일 파싱·PPTX 왕복 검사, 실제 브라우저의 생성/영역 편집/다운로드 통합 검증(모델은 테스트 더블). 실제 유료 API 호출은 자격 증명이 있는 경우에만 실시.
7. 사용자용 실행·설정·외부 전송 안내와 검증 결과 작성. FastMCP와 원격 멀티유저 배포는 이번 범위에서 제외.

## 라이선스 영향

LICENSE의 AGPL-3.0과 upstream 저작권/고지는 그대로 보존한다. UI 브랜딩/후원 제거는 라이선스 제거와 무관하다. 본 변경은 upstream 파생 코드(프론트엔드/백엔드 포함)이며 재배포 및 네트워크 제공 시 AGPL 의무 검토 대상이다. 사내 사용이라는 이유만으로 공개/제공 의무가 없다고 단정하지 않는다. RMBG 등 별도 모델 가중치는 코드와 라이선스가 다를 수 있어 자동 배포에서 제외한다. 신규 의존성/모델은 THIRD_PARTY_NOTICES에서 별도 표시한다.
