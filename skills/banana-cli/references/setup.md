# Banana Slides Setup

Current configuration: repository README.md and docs/enterprise/ADAPTERS.md.

## Install and Start Backend

```bash
git clone https://github.com/Jungwoo-Ryu/banana-slides
cd banana-slides
cp .env.example .env
# Edit .env — at minimum set an AI provider key (see below)
cd backend
uv sync --frozen --python 3.12
uv run alembic upgrade head
uv run python app.py
```

Backend starts on http://localhost:5011.

## Required Configuration

Configure only company Azure deployments in `.env`:

```env
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=gpt-5.5
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2
AZURE_OPENAI_TTS_DEPLOYMENT=
DOCUMENT_PARSER=local
OCR_PROVIDER=local
```

Documents and OCR are local only. Tesseract with language data is required for scanned documents and editable text extraction. No provider credentials are stored through the CLI settings endpoint.

## Verify

```bash
curl -sf http://localhost:5011/health
```

## Install banana-cli

```bash
# Option A: use directly from project root (no install needed)
uv run banana-cli --help

# Option B: install globally (then use banana-cli directly)
uv tool install .
banana-cli --help
```

If the backend runs on a non-default port, pass `--base-url` or set `BANANA_CLI_BASE_URL`.
