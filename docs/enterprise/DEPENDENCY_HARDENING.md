# Sol.A 의존성과 외부 연동 정리

2026-11-03 기준. 확인된 업체 연동, 문서 업로드 경로, 패키지 배포처를 정리하고 공개 취약점 데이터베이스로 검사했다. 라이브러리 작성자의 국적을 검증한 목록이나 소스 전체 보안 감사 결과는 아니다.

## 제거와 대체

| 기존 경로 | 현재 구현 |
|---|---|
| MinerU 문서 업로드·진행 조회·결과 ZIP 다운로드, 범용 HTTP 문서/OCR 업로드 | PyMuPDF로 PDF 텍스트 추출, MarkItDown으로 Office 문서 로컬 변환. MarkItDown 플러그인 비활성화 |
| Baidu/PaddleOCR 및 외부 추출기 설정·잔여 코드 | 로컬 Tesseract로 OCR, OpenCV로 배경 복원. 생성형 복원은 사내 Azure 이미지 배포 |
| LazyLLM, Qwen, Doubao/Volcengine, SenseNova 등의 데모·설정 문서·오래된 공급자 테스트·패키징 등록 | Azure 전용 제공자와 로컬 파싱 계약. 제거한 공급자를 다시 선택하는 테스트는 삭제하고 로컬 경계 검증으로 대체 |
| ModelScope 모델 미러 안내 | 사전 승인된 로컬 ONNX 파일만 선택 가능. 자동 다운로드 없음 |
| 데스크톱 lockfile의 npmmirror 배포 주소 25개 | 공식 npm 배포 주소. 기존 25개 integrity 값은 공식 npm 메타데이터와 일치 확인 |
| PyPDF2 | 유지보수되는 pypdf |
| 이전 Python/JS 의존성 | Python 3.12, 갱신한 uv/npm lockfile, Vite 8·Vitest 5·React Router 7·ESLint 10 등 |
| 원본 프로젝트의 Docker 이미지·데스크톱 업데이트 대상 | 현재 fork 소스 빌드 기본값, Jungwoo-Ryu/banana-slides 업데이트 대상 |

Node.js 보안 버전 검사는 유지한다. 기본 버전은 22.23.4이며 기존 컨테이너는 새 이미지로 다시 빌드해야 한다. 공식 배포처와 lockfile 해시는 공급망 검증의 일부이며 안전성을 보증하지 않는다.

## 동작과 데이터

- `DOCUMENT_PARSER=local`, `OCR_PROVIDER=local`만 허용한다. 남아 있는 외부 제공자 설정은 명확한 오류로 거부한다. 사내 HTTP 문서/OCR 어댑터도 제거했다.
- 이미지 슬라이드 생성 자체에는 OCR이 필요하지 않다. 스캔 PDF 텍스트 인식과 이미지에서 편집 가능한 텍스트를 추출할 때 로컬 Tesseract를 사용한다. Docker 백엔드/통합 이미지에는 한국어·영어 언어팩을 포함했다.
- 문서 파싱은 서버 내부에서 처리한다. 이후 사용자가 AI 생성을 요청하면 관련 문서 내용·이미지는 설정한 사내 Azure로 전송된다. 자산의 원격 이미지 URL을 가져오는 기능은 별개로 존재한다.
- 기존 `mineru_files` 폴더는 `parsed_files`로 이동하고, DB의 `/files/mineru/` 링크 및 Windows/Linux 파일 경로를 갱신한다. 파싱 작업 ID와 외부 API 주소 컬럼을 제거한다. 기존 슬라이드·문서·이미지는 보존한다.
- 업그레이드 전 서버를 멈추고 DB와 uploads를 함께 백업한다. 대상 경로에 충돌이 있으면 덮어쓰지 않고 이관을 중단한다. 여러 인스턴스에서 동시에 마이그레이션하지 않는다.
- 과거 마이그레이션, 제거/이관 검증 테스트와 역사 문서에는 이전 이름이 남는다. 과거 설치의 업그레이드와 원본 라이선스·저작권 고지를 유지하기 위한 기록이다.

## 검사와 제한

- 프론트엔드 전체 의존성: `npm audit` 알려진 취약점 0건.
- Python 실행 의존성: `pip-audit` 알려진 취약점 0건.
- 데스크톱: high/critical 0건. electron-builder 패키징 의존성의 minimatch 문제로 moderate 영향 패키지 15개가 남는다. 웹 이미지에는 이 의존성을 포함하지 않는다. 강제 다운그레이드나 호환되지 않는 minimatch override로 가리지 않았다. 네이티브 설치 파일 출시 전 별도 해결·검증이 필요하다.
- 브라우저 테스트는 로컬 Azure 프로토콜 응답 서버를 사용한다. 실제 Azure 배포의 권한·쿼터·모델 출력 품질은 사내 환경에서 확인해야 한다.
- `Dependency Security` CI가 공식 registry/해시와 제거한 어댑터 재유입을 검사한다. 프론트엔드와 Python은 모든 공개 취약점을, 데스크톱은 high/critical을 실패 처리한다. 매주 재검사한다.
- 중단했던 Cloudflare 소스 보안 감사는 이 작업에서 재개하지 않았다.

재현 명령은 `.github/workflows/local-web.yml`과 `.github/workflows/dependency-security.yml`에 있다. 실행 결과는 커밋 시 검증 기록에 정리한다.

## 검증 기록

- 백엔드 565개 통과: 기본 기능, 문서 파싱·로컬 OCR 경계, 데이터 이관, 경로 보호, 공급망 정책의 거부 사례 포함.
- 프론트엔드 196개 통과, TypeScript/Vite 빌드 및 ESLint strict 통과.
- 실제 Chromium 11개 통과: 개요/설명/이미지 생성, PDF 템플릿, 정밀 영역 선택·수정, 버전 복원, 생성 실패/재시도, PPTX/PDF/MP4 파일 저장 검증.
- 데스크톱 로직 77개 통과, 이 fork에 없는 배포 workflow 전용 2개 명시적 건너뜀. 네이티브 설치 파일 빌드 검증은 수행하지 않음.
- Python 3.12 백엔드 Docker 이미지 빌드 성공. 1코어/2GB로 기동하여 health 응답, Tesseract 5.5.0 및 kor/eng 언어팩, 실제 OCR 인식, 마이그레이션과 DB 커밋 검증. 다중 사용자 부하 시험 결과는 아님.
- 중국어 소스 검사, dependency policy, diff 공백 검사 통과.
