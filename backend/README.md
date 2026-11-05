# Sol.A Go backend

이 폴더가 유일한 발표자료 백엔드입니다. Wails와 웹은 이 Go 모듈을 공유합니다.

- 서버: `go run ./cmd/sola-server --no-auth --env-file ../.env`
- 개발 웹: `go run ./cmd/sola-dev --repo ..`
- 테스트: `go test -race ./...`
- CLI 조회: `go run ./cmd/sola-cli --path /api/projects`
- CLI JSON 전송: `go run ./cmd/sola-cli --method POST --path /api/projects --data @project.json`
- CLI 다운로드: `go run ./cmd/sola-cli --path /files/.../deck.pptx --out deck.pptx`

이전 Python CLI의 서브커맨드·CSV 배치 문법은 위 HTTP 방식 Go CLI로 교체했습니다. 업로드와 대화형 작업은 웹/Wails UI를 사용하세요. Wails 세션은 SOLA_SESSION_TOKEN 환경변수로 전달할 수 있습니다. [전체 설정 안내](../README.md)
