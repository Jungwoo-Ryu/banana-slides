# 로컬 웹 검증 기록

검증 환경: Linux, Python 3.12, Node.js 22 이상, Chromium (Playwright). 실제 Azure/OpenAI 키를 사용하지 않았습니다.

## 통과한 검증

- 백엔드 188개 테스트: 환경변수/파일 자격 증명, 키 비노출·저장 거부, HTTPS 검증 유지, Azure 텍스트·비전·이미지 편집의 배포 이름 전달, 별도 이미지 배포 필수 조건, 로컬 PPTX 문서 파싱, 저장소 경로 이탈 방지, 프로젝트/페이지/템플릿 흐름.
- 실제 Tesseract OCR로 이미지의 문자를 추출하고 편집 가능한 PPTX로 저장한 뒤 `python-pptx`로 다시 열어 텍스트 상자 검증. 테스트 이미지와 설치 언어는 영어이며 한국어 OCR 정확도 평가는 별도입니다.
- TypeScript 검사 및 Vite production build.
- Playwright 3개 시나리오: 한국어 설정 저장·재조회, 참고 파일 업로드·로컬 파싱, 빈 프로젝트 생성·영역 드래그·프롬프트 제출·브라우저 PPTX 다운로드.
- 이미지 수정 API 실패 시 한국어 오류를 표시하고 입력한 프롬프트와 선택 이미지를 유지하며, 처리되지 않은 브라우저 예외가 발생하지 않는지 확인했습니다.
- 다운로드 클릭 **전에** 브라우저 download 이벤트를 등록하고 실제 파일을 저장한 뒤 PPTX 슬라이드/객체를 다시 읽어 검증했습니다.
- 실행 관리자로 두 서버 시작·준비 상태 확인·Ctrl+C 동시 종료를 확인했습니다.

영역 편집 E2E는 **유료 모델 호출만 가로채서** 요청 내용과 선택 이미지 전달을 검사합니다. 나머지 업로드·DB·내보내기는 실제 로컬 백엔드를 사용합니다. Azure 테스트도 SDK 요청 계약을 검증하는 대역 테스트이며 실제 서비스 연결·생성 품질을 검증한 것은 아닙니다.

Windows GitHub Actions에서 실제 `cmd.exe`로 `start.bat --no-browser`를 실행하여 의존성 설치, 백엔드 health 응답, 프론트엔드 HTTP 응답까지 통과했습니다. [검증 실행 기록](https://github.com/Jungwoo-Ryu/banana-slides/actions/runs/40874993167)에서 확인할 수 있습니다. 실제 PC의 회사 프록시·인증서와 한국어 OCR 환경은 별도로 확인해야 합니다.

## 재현 명령

```bash
uv sync --frozen --extra test --python 3.12
uv run pytest backend/tests/unit/test_local_web.py backend/tests/unit/test_text_output_limit.py backend/tests/unit/test_api_project.py backend/tests/unit/test_page_part_inheritance.py backend/tests/unit/test_template_mode_switch.py backend/tests/unit/test_description_field_contract.py backend/tests/unit/test_task_manager_image_prompt_fields.py backend/tests/unit/test_template_auto_match.py backend/tests/unit/test_style_from_content.py backend/tests/unit/test_image_prompt_ratio.py backend/tests/unit/test_english_schema_compat.py -q
npm --prefix frontend ci
npm --prefix frontend run build:check
uv run python scripts/start_local.py --no-browser
```

서버 실행 상태에서 다른 터미널:

```bash
cd frontend
npx playwright install chromium
npx playwright test --config playwright.local.config.ts
```

E2E는 테스트 프로젝트를 만들고 정리합니다. 실행 중인 저장소와 `DATABASE_PATH`/`UPLOAD_FOLDER`를 같은 값으로 사용해야 합니다. OCR 왕복 테스트에는 Tesseract `eng`와 테스트 글꼴(DejaVu Sans 또는 Windows Arial)이 필요합니다.

## 남은 실제 환경 확인

- 실제 Azure 리소스의 배포 이름·API 버전·이미지 생성/편집 권한과 품질.
- 한국어 OCR 정확도, 복잡한 표/차트와 배경의 복원 품질.
- 회사 프록시/Root CA, 사내 문서/OCR API의 실제 응답 호환성.
- FastMCP 노출, 원격 샌드박스, 원격 object storage 구현은 후속 개발 범위입니다.

## 내부 언어 정리

내부 주석·docstring·로그·프롬프트·테스트·기술 문서의 중국어를 영어로 변환했습니다. 기존 영어 사전을 재사용하고, 나머지는 소스 외부 전송 없이 로컬 번역 모델로 초안을 만든 뒤 주요 생성/편집 프롬프트를 직접 정리했습니다. 번역 도구와 모델은 앱 의존성에 추가하지 않았습니다.

기본 필드명은 `Visual assets`, `Layout and emphasis`, `Speaker notes`입니다. 기존 DB의 필드명은 읽을 때 연결하며 원본 데이터는 덮어쓰지 않습니다. Unicode escape는 기존 입력 식별자와 정규식 호환성 용도로만 남겼습니다. 관련 호환성 테스트 4개를 추가했습니다.

`python scripts/check_source_language.py`로 Git이 추적하는 텍스트 파일의 중국어 잔존 여부를 검사하며 CI에서도 실행합니다.
