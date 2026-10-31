# Sol.A 어댑터 계약

| 경계 | 구현 | 설정 |
|---|---|---|
| 텍스트·비전 | `ai_providers/text/azure_provider.py` | 사내 Azure GPT-5.5 배포 |
| 이미지 생성·수정 | `ai_providers/image/azure_provider.py` | 사내 Azure GPT-image-2 배포 |
| 음성 | `tts_video_service.generate_tts_audio_sync` | `AZURE_OPENAI_TTS_DEPLOYMENT` |
| 영상 | `tts_video_service.generate_narration_video` | FFmpeg/FFprobe, 순차 처리 |
| 문서 → 텍스트 | `document_providers.DocumentProvider` | `DOCUMENT_PARSER=local/http/mineru` |
| OCR → 요소 목록 | `document_providers.OCRProvider` | `OCR_PROVIDER=local/http` |
| 파일 | `storage.LocalFileStorage` | 로컬 영속 폴더. 원격 저장소 미구현 |

AI 제공자 선택과 임의 모델 이름 설정은 지원하지 않습니다. Azure endpoint/배포/API 버전/키는 환경변수 및 마운트 Secret 파일에서만 구성합니다. OpenAI Python SDK는 Azure 프로토콜 구현에 사용하며 공개 OpenAI fallback은 없습니다.

HTTP 문서 어댑터는 multipart `file`을 보내고 `{"markdown":"..."}`를 받습니다. HTTP OCR은 이미지 `file`을 보내고 `{"elements":[{"type":"text","bbox":[x1,y1,x2,y2],"content":"..."}]}`를 받습니다. 좌표는 원본 이미지 픽셀이며 서버 파일 경로는 응답에서 허용하지 않습니다. OCR 제공자 교체 시 이 계약과 오류 처리를 검증하세요.

영상 작업은 Azure TTS 스트리밍 응답을 파일로 저장하고, 각 슬라이드와 합성한 뒤 MP4들을 연결합니다. 임시 파일은 성공/실패 모두 정리하며 최종 파일은 완성 후 교체합니다. 프로세스 내부 영상 슬롯은 분산 동시성 제어가 아닙니다. 후속 통합 계약은 루트 `sola-integration.md`에 있습니다.
