# 이미지 일괄 생성 진단

`Dev` 브랜치는 Sol.A 로컬 웹 구현(`917ea46`)에서 분기했습니다. 이번 변경은 이미지 일괄 생성의 진단·실패 처리·재시도 관련 수정입니다.

## Tesseract와 이미지 생성의 관계

일반 슬라이드 이미지 생성은 Azure 이미지 배포를 호출하며 Tesseract를 사용하지 않습니다. 이미지 품질 검사를 켠 경우에도 Azure 비전 배포를 사용합니다. Tesseract는 로컬 OCR과 이를 사용하는 문서 처리·편집형 PPTX 분석에 필요합니다.

브라우저 테스트에서는 `TESSERACT_CMD`를 존재하지 않는 경로로 설정했습니다. OCR 서비스 테스트가 실제로 실패하는 것을 먼저 확인하고, 같은 서버에서 이미지 생성·실패 후 재생성·이미지형 PPTX 내보내기가 동작하는지 검증합니다. 따라서 OCR 설치 실패를 일반 이미지 일괄 생성의 원인으로 단정할 수 없습니다.

실제 사내 Azure 오류 응답은 아직 전달받지 못했습니다. 당시 실패가 인증·배포 이름·API 호환성·요청 제한 중 무엇인지는 이번 코드만으로 확정하지 않습니다.

## 확인한 코드 문제와 수정

- 일부 또는 모든 이미지가 실패해도 작업 상태가 `COMPLETED`였고, 페이지별 오류 원인이 작업 응답에서 사라졌습니다. 이제 `FAILED`와 성공/실패 수, `page_errors`를 반환합니다. 성공한 이미지와 기존 버전은 유지합니다.
- 앱 시작 중 Alembic이 루트 로그를 WARN으로 바꿔 INFO 단계 로그가 사라졌습니다. 앱 내 migration에서는 앱의 로그 설정을 유지합니다. 독립 Alembic CLI 설정은 유지됩니다.
- 이미지 생성 직전의 설명·대본 수정이 아직 저장 중일 수 있었습니다. 저장 완료를 기다리고 실패하면 모델 호출을 막습니다.
- 실행 중인 페이지를 제외한 목록을 계산하고도 원래 목록을 전송하던 문제를 수정했습니다.
- 선택한 페이지만 생성할 때 개요 인덱스가 어긋나고 첫 선택 페이지가 표지로 처리될 수 있었습니다. 전체 개요와 실제 페이지 번호를 사용합니다.
- 선택한 일부 페이지만 성공했는데 전체 프로젝트가 완료로 표시되는 문제를 수정했습니다. 빠르게 끝나는 작업의 최종 상태를 요청 처리 코드가 다시 덮어쓰지 않도록 상태 저장 순서도 조정했습니다.

## 로그 확인

브라우저 개발자 도구(F12)의 Console에서 `Sol.A image-generation`을 필터링하세요. 개발 빌드와 배포 빌드 모두 출력됩니다.

- `save` → `request` → `accepted`: 로컬 편집 저장, 생성 요청, 작업 접수.
- `progress`: 작업 상태 또는 성공/실패 수가 바뀔 때 기록.
- `failed`: 작업 ID, 페이지별 실패 단계·HTTP 상태·Azure 요청 ID와 안내.
- `request_failed` / `poll_failed`: 작업 접수 실패 또는 상태 조회 실패.

백엔드는 표준 출력으로 `image_generation` JSON 이벤트를 기록합니다. `start.bat` / `start_local.py` 실행 시 `.runtime/logs/backend.log`에 저장됩니다. 해당 파일은 실행기를 다시 시작하면 덮어쓰므로 재시작 전에 필요한 로그를 복사하세요.

PowerShell에서 실시간으로 확인:

```powershell
Get-Content .runtime\logs\backend.log -Tail 100 -Wait | Select-String 'image_generation'
```

Linux/macOS:

```bash
tail -f .runtime/logs/backend.log | rg image_generation
```

백엔드 단계는 `request` → `batch` → `queue` → `description` → `template` → `prompt` → `generate_image` → `azure_image_request` → `decode_image` → 선택적 `quality_review` → `save_image` → `page` / `batch`입니다. `queue` 대기 시간과 Azure·디코딩·저장 소요 시간을 기록합니다.

공통 `task_id`, `project_id`, `page_id`로 브라우저와 백엔드 로그를 연결합니다. 실패 이벤트에는 예외 클래스, 파일·함수·줄 번호, 가능한 경우 `http_status`, `provider_code`, `provider_request_id`, `parameter`가 포함됩니다. 추가한 진단 로그에는 API 키·프롬프트 본문·대본·이미지 base64·공급자 오류 본문을 기록하지 않습니다.

## 실패 코드별 확인 대상

| 코드 / 단계 | 확인 대상 |
| --- | --- |
| `AZURE_IMAGE_CONFIG` | `AZURE_OPENAI_IMAGE_DEPLOYMENT`에 실제 사내 배포 이름 설정 후 백엔드 재시작 |
| `AZURE_IMAGE_AUTH` (401/403) | API 키·리소스·배포 접근 권한 |
| `AZURE_IMAGE_DEPLOYMENT` (404) | 이미지 배포 이름, 엔드포인트, API 버전 |
| `AZURE_IMAGE_REQUEST` (400) | 지원 이미지 API, 해상도·품질 파라미터, 콘텐츠 정책; `provider_code` / `parameter` 확인 |
| `AZURE_IMAGE_RATE_LIMIT` (429) | 이미지 배포 할당량·동시 요청 수; 잠시 후 실패한 페이지만 재시도 |
| `AZURE_IMAGE_UNAVAILABLE` (5xx) | Azure 서비스 일시 장애 |
| `AZURE_IMAGE_TIMEOUT` / `AZURE_IMAGE_CONNECTION` | 네트워크·프록시·Root CA·`OPENAI_TIMEOUT` |
| `AZURE_IMAGE_RESPONSE` / `decode_image` | 비어 있거나 손상된 이미지 응답, API 호환성 |
| `IMAGE_DESCRIPTION_REQUIRED` / `description` | 페이지 설명 입력·저장 |
| `IMAGE_TEMPLATE_REQUIRED` / `template` | 디자인 스타일·템플릿 연결 및 참조 파일 |
| `IMAGE_SAVE_FAILED` / `save_image` | 업로드 폴더 권한·디스크 공간·DB 상태 |

텍스트 개요 생성이 성공해도 이미지 배포의 권한·배포 이름·할당량은 별개입니다. `AZURE_OPENAI_DEPLOYMENT`와 `AZURE_OPENAI_IMAGE_DEPLOYMENT`를 각각 확인하세요. 비밀키를 콘솔이나 공유 로그에 붙여 넣지 마세요.

## 추가 테스트

- 실제 OpenAI SDK에 HTTP 대역을 연결해 400/401/403/404/429/503, 시간 초과, 빈 이미지·잘못된 base64·손상된 이미지 응답을 검사합니다.
- 실제 DB·파일 저장 경로에서 전체 실패, 부분 실패, 성공 이미지 유지, 실패 페이지만 재생성, 저장 권한 오류, 이미지 배포 설정 누락, 설명 누락, 잘못된 동시 생성 수를 검사합니다.
- 품질 검사 활성화 시에도 OCR을 호출하지 않는지 검사합니다.
- 프런트엔드에서 저장 완료 대기·저장 실패 차단·프로젝트 전환·진행 중 페이지 제외·오류 안내와 진단 콘솔 출력을 검사합니다.
- 실제 Waitress + Chromium에서 OCR 불가 상태, 401 부분 실패, 404 전체 실패, 오류 표시, 재시도 성공, 서버 INFO 로그 보존을 검사합니다.

실제 사내 모델 품질·사내 네트워크 연결과 1 vCPU·2GB에서 4명 동시 사용 부하는 이 테스트의 보장 범위가 아닙니다. 재현 방법은 [검증 안내](VALIDATION.md)를 참고하세요.
