# Banana Slides Backend

Banana Slides（Banana Slides）Backend Services - AI Driven PPT Generation System

## Technology.

- **Frame**: Flask 3.0
- **Database**: SQLite + SQLAlchemy ORM
- **AI Services**: Google Gemini API
- **PPT Processing**: python-pptx
- **Co-processing**: ThreadPoolExecutor
- **Package management**: uv

## Project structure

```
backend/
├── app.py                    # Flask Application entrance
├── config.py                 # Profile
├── models/                   # Database Model
│   ├── __init__.py
│   ├── project.py           # Project Model
│   ├── page.py              # Page Model
│   └── task.py              # Task Model
├── services/                 # Service level
│   ├── __init__.py
│   ├── ai_service.py        # AI Related services
│   ├── file_service.py      # Document management services
│   ├── export_service.py    # Export Service
│   └── task_manager.py      # Step-by-step task management
├── controllers/              # Control Layer
│   ├── __init__.py
│   ├── project_controller.py
│   ├── page_controller.py
│   ├── template_controller.py
│   ├── export_controller.py
│   └── file_controller.py
├── utils/                    # Tool Functions
│   ├── __init__.py
│   ├── response.py          # Harmonized Response Format
│   └── validators.py        # Data validation
├── instance/                 # Database File Directory (auto-create)）
├── uploads/                  # File Upload Directory (auto-create)）
├── .env.example             # Examples of environmental variables
└── README.md                # This document
```

## Fast start.

### 1. Installation Dependence

Use of this project [uv](https://github.com/astral-sh/uv) Management Python Dependence. All relying on definitions in the root directory `pyproject.toml` File。

Run under the root directory：
```bash
uv sync
```

This will automatically install all the required dependencies.。

### 2. Configure Environment Variables

Copy `.env.example` Yes. `.env` , and fill in configuration：

```bash
cp .env.example .env
```

Edit `.env` Documentation：

```env
GOOGLE_API_KEY=your-google-api-key
GOOGLE_API_BASE=https://generativelanguage.googleapis.com

# Volcanic engine configuration (optional, for Inpainting Image elimination function）
VOLCENGINE_ACCESS_KEY=your-volcengine-access-key
VOLCENGINE_SECRET_KEY=your-volcengine-secret-key
VOLCENGINE_INPAINTING_TIMEOUT=60
VOLCENGINE_INPAINTING_MAX_RETRIES=3
```

### 3. Initialize / Upgrade database structure（Alembic Migration）

From the current version, use backend Alembic Managing changes in database structure。

```bash
cd backend
uv run alembic upgrade head
```

> Attention.：<br>
> - It will be created automatically on first run `alembic_version` Table and migration of the database to the latest structure；<br>
> - Only update following the new model field `models/`，And then use `alembic revision --autogenerate` Generate migration, execute `alembic upgrade head`。

### 4. Operation services

Usage uv Run：
```bash
cd backend
uv run python app.py
```
The service will be `http://localhost:5011` Start。

## API Documentation

Full API Document refer to the root directory of the item `API Design Document.md`。

### Main Peers

#### Project management
- `POST /api/projects` - Create Item
- `GET /api/projects/{project_id}` - Retrieving project details
- `PUT /api/projects/{project_id}` - Update item
- `DELETE /api/projects/{project_id}` - Delete Item

#### Outline Generation
- `POST /api/projects/{project_id}/generate/outline` - Generate Outline

#### Description Generation
- `POST /api/projects/{project_id}/generate/descriptions` - Batch generation description (speech)）
- `POST /api/projects/{project_id}/pages/{page_id}/generate/description` - Single Page Generation

#### Picture Generation
- `POST /api/projects/{project_id}/generate/images` - Batch generation of pictures (show)）
- `POST /api/projects/{project_id}/pages/{page_id}/generate/image` - Single Page Generation
- `POST /api/projects/{project_id}/pages/{page_id}/edit/image` - Edit Pictures

#### Template Management
- `POST /api/projects/{project_id}/template` - Upload Template
- `DELETE /api/projects/{project_id}/template` - Remove Template

#### Export
- `GET /api/projects/{project_id}/export/pptx` - Export PPTX
- `GET /api/projects/{project_id}/export/pdf` - Export PDF

#### Static File
- `GET /files/{project_id}/{type}/{filename}` - Get File

## Core functions

### 1. AI Driverd Content Generation

Based on Google Gemini API，Support：
- Auto Generate PPT Outline
- Parallel Generate Page Description
- Generate pictures based on reference templates
- Edit pictures in natural languages

### 2. Step-by-step processing

Usage `ThreadPoolExecutor` Achieving simple but efficient walk-through tasks：
- Create multiple page descriptions in parallel
- Generate multiple pages in parallel
- Real-time task tracker

### 3. Document management

Complete document management system：
- Project-level file segregation
- Template Picture Management
- Generate Image Management
- Automatic clean-up mechanism

### 4. Inpainting Image Elimination (optional)）

Volcanic-based engines. Inpainting Services, support：
- By Boundary Frame（bbox）Exact elimination of image range
- Automatically generate mask images
- Recreate the background (retention prospects, elimination of other regions)）
- Supporting batch processing and re-testing mechanisms

Usage method：
```python
from services.inpainting_service import InpaintingService, remove_regions
from PIL import Image

# Modalities 1：Use of service category
service = InpaintingService()
image = Image.open('original.png')
bboxes = [(100, 100, 200, 200), (300, 150, 400, 250)]  # Area to be eliminated
result = service.remove_regions_by_bboxes(image, bboxes)

# Modalities 2：Use a convenient function
result = remove_regions(image, bboxes, expand_pixels=5)
```

### 5. Data Durable

Usage SQLite + SQLAlchemy：
- Lightweight, no additional configuration
- Support relationship data operations
- Service to ensure data consistency

## Development Note

### Data Model

#### Project（Item）
- Basic information on the project
- Template Picture Path
- Project Status
- Associated Pages and Tasks

#### Page（Page）
- Page Order
- Outline（JSON）
- Description（JSON）
- Path to Generate Pictures
- Page Status

#### Task（Tasks）
- Task type (generation description)/Generate pictures）
- Task Status
- Progress Information（JSON）
- Error message

### Status machine

#### Project Status
```
DRAFT → OUTLINE_GENERATED → DESCRIPTIONS_GENERATED → GENERATING_IMAGES → COMPLETED
```

#### Page Status
```
DRAFT → DESCRIPTION_GENERATED → GENERATING → COMPLETED | FAILED
```

#### Task Status
```
PENDING → PROCESSING → COMPLETED | FAILED
```

### Extension development

#### Add New AI Model

Yes. `services/ai_service.py` Add new model support：

```python
class AIService:
    def __init__(self, api_key: str, model_type: str = 'gemini'):
        if model_type == 'gemini':
            # Gemini implementation
        elif model_type == 'openai':
            # OpenAI implementation
        # ...
```

#### Customized Phrasing Template

Modify `services/ai_service.py` , and then click the：

```python
def generate_image_prompt(self, ...):
    prompt = dedent(f"""
        # Customized Phrasing Template
        ...
    """)
    return prompt
```

#### Add New Export Format

Yes. `services/export_service.py` Add new export method：

```python
class ExportService:
    @staticmethod
    def create_custom_format(image_paths, output_file):
        # Get Custom Format Export
        pass
```


## Test

### Health screening

```bash
curl http://localhost:5011/health
```

### Create Item

```bash
curl -X POST http://localhost:5011/api/projects \
  -H "Content-Type: application/json" \
  -d '{"creation_type":"idea","idea_prompt":"Generate the theme of environmental protection ppt"}'
```

### Upload Template

```bash
curl -X POST http://localhost:5011/api/projects/{project_id}/template \
  -F "template_image=@template.png"
```

### Generate Outline

```bash
curl -X POST http://localhost:5011/api/projects/{project_id}/generate/outline \
  -H "Content-Type: application/json" \
  -d '{"idea_prompt":"Generate the theme of environmental protection ppt"}'
```

## Common problems

### Q: Where are the database files?？
A: Yes. `backend/instance/database.db`，It’s created automatically。

### Q: Where are the uploaded files?？
A: Yes. `uploads/{project_id}/` Under the directories, lined up.。

### Q: How to Modify Parallel Numbers？
A: Suggest changes by front-end settings page (sync to database and overwrite) `.env` value; can also be in `.env` Document Changes `MAX_DESCRIPTION_WORKERS` and `MAX_IMAGE_WORKERS` As default, then click ” Reset to Default ” on the settings page to sync to DB。

### Q: How to switch to other AI Model / Modify MinerU Address？
A: From the current version it is recommended that changes be made through the front-end System Settings page：<br>
- Large model provider format / API Base / API Key<br>
- Text Model (`TEXT_MODEL`) / Picture Model (`IMAGE_MODEL`)<br>
- MinerU Address (`MINERU_API_BASE`) / Picture Identification Model (`IMAGE_CAPTION_MODEL`)<br>

These values will be saved to `settings` Table & Overwrite `.env` . Click Reset to Default to return `.env` Default value。

### Q: Which image formats are supported？
A: PNG, JPG, JPEG, GIF, WEBP。Yes. `config.py` Medium `ALLOWED_EXTENSIONS` Configuration。


## Open Source Font Description

Included in this project **Noto Sans CJK SC**（Source Han Sans Simplified Chinese) font file, used for PPT Accurate text measurement at export。

- **Font File**: `fonts/NotoSansSC-Regular.ttf`
- **Source**: [Google Noto CJK Fonts](https://github.com/googlefonts/noto-cjk)
- **Licence**: [SIL Open Font License 1.1 (OFL)](https://scripts.sil.org/OFL)

OFL Licence allows free use, modification and distribution of the font。

## Contact information

If you have any questions or suggestions, please adopt them. GitHub Issues Feedback。
