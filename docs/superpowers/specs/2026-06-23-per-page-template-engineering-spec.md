# Per-Page Template Project implementation Spec

> Create Date:2026-06-23<br>
> Upstream PRD:`docs/superpowers/specs/2026-06-22-prd-per-page-template.md`<br>
> Upstream.:`docs/superpowers/plans/2026-06-22-per-page-template-handoff.md`<br>
> Scope statement:**It’s all done at once.**,None MVP/v2。All PRD §14 Decision-making(1-6)+ §3.2 Decision-making 7 I and implementation。

---

## 1. Scope and principles

### 1.1 Contained Functions

Coverage of this implementation PRD All Chapters,I’m not staying. v2 Phase:

| Module | Source | Status |
|------|------|------|
| Project Template Library(`project_template_assets`) | PRD §5 | Implementation |
| Page-level template field(`pages` Add 5 Columns) | PRD §6 | Implementation |
| TemplateSetupPage Full Page | PRD §7 | Implementation(Decision-making 1) |
| PDF Open Page Upload | PRD §5.4 + Decision-making 3 | Implementation |
| AI Template Parsing(Auto + User Edit) | PRD §5.3 + Decision-making 4 | Implementation |
| Automatic Matching(Whole project + Single Page) | PRD §8/§9 + Decision-making 5 | Implementation |
| Manual selection template(Bounce Layer) | PRD §10 | Implementation |
| Template Delete + Empty Quote Page | PRD §11 | Implementation |
| Mode two-way switch(Single↔More) | PRD §3.2 Decision-making 7 | Implementation |
| Picture Generation Link Read by Page Template Priority | PRD §13 | Implementation |
| Parsing failed to downgrade(Available,Do Not Automatic Match) | Decision-making 2 | Implementation |
| Single Template Route Skipping | Decision-making 6 | Implementation |

### 1.2 Leave a message.(Scope of Extension)

In order to avoid locking in subsequent evolution,,The following dots are visible"Interface set-up + Not achieved at present":

- **System preset template**:`GET /api/templates`(`template_controller.py:98`)Existing but returned empty list,Don’t touch it.,Follow-up as system template pool entry
- **Template Version/History**:`project_template_assets` No, I don’t. `version` Field,But... `analysis_json` Use it. JSON Save,schema It doesn’t have to be. migration
- **Match Algorithm Multiple Versions**:`pages.template_selection_source` enum Retention `auto_v2 / hybrid` Equivalent,Current only `manual / auto / batch_apply`

---

## 2. Data Model

### 2.1 `projects` Table + 1 Columns

```python
template_mode = db.Column(db.String(10), nullable=False, server_default='single', default='single')
# 'single' | 'multi' — Only UI Render Branch,Do not affect page-level field reading and writing
```

### 2.2 Add `project_template_assets` Table

```python
class ProjectTemplateAsset(db.Model):
    __tablename__ = 'project_template_assets'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    image_path = db.Column(db.String(500), nullable=False)        # The original map relative path
    thumb_path = db.Column(db.String(500), nullable=True)         # Thumbnail,Failed to generate empty
    file_size = db.Column(db.Integer, nullable=True)
    source = db.Column(db.String(20), nullable=False, default='upload')  # upload | pdf_split | system_preset
    source_pdf_id = db.Column(db.String(36), nullable=True)       # PDF Record when unpaged PDF task_id
    source_page_index = db.Column(db.Integer, nullable=True)      # PDF Record when unpaged PDF Page Number

    analysis_status = db.Column(db.String(20), nullable=False, default='pending')  # pending|processing|completed|failed
    analysis_json = db.Column(db.Text, nullable=True)             # JSON String,9 Field schema(PRD §5.3)
    analysis_notes = db.Column(db.Text, nullable=True)            # AI Free Text Supplement
    analysis_error = db.Column(db.Text, nullable=True)            # Reason for failure(Decision-making 2)
    user_label = db.Column(db.String(200), nullable=True)         # User Tags
    user_edited_analysis = db.Column(db.Boolean, nullable=False, default=False)  # Whether or not the user edits the resolution

    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = db.relationship('Project', back_populates='template_assets')
    pages_referenced = db.relationship('Page', back_populates='template_asset', foreign_keys='Page.template_asset_id')
```

`Project.template_assets = db.relationship('ProjectTemplateAsset', back_populates='project', cascade='all, delete-orphan', order_by='ProjectTemplateAsset.sort_order')`

### 2.3 `pages` Table + 5 Columns

```python
template_asset_id = db.Column(db.String(36), db.ForeignKey('project_template_assets.id', ondelete='SET NULL'), nullable=True, index=True)
template_style_text = db.Column(db.Text, nullable=True)
template_selection_source = db.Column(db.String(20), nullable=True)  # manual | auto | batch_apply
template_match_reason = db.Column(db.Text, nullable=True)
template_match_confidence = db.Column(db.Float, nullable=True)
```

external keys `ondelete='SET NULL'` Achieved PRD §11"Remove the template automatically emptys the reference page"。

### 2.4 Alembic migration

Documentation:`backend/migrations/versions/2026_06_23_add_per_page_template.py`

upgrade Steps:
1. Add `projects.template_mode` Columns
2. Create `project_template_assets` Table
3. Add `pages` 5 Columns
4. **Backfill**:All existing projects,Take it. `projects.template_image_path` / `template_style` Batch Sync to All Pages:
   - If `template_image_path` Non-empty **And the file exists**:Create an article for this project `project_template_assets` Records(source='upload', analysis_status='pending', image_path Point to the original file,thumb_path Leave room for subsequent lazy generation.),All the pages. `template_asset_id` Point it.
   - If `template_image_path` Non-empty but missing files:Skip asset Create,Take a line. warning log,The item maintains a single template mode but the template field is empty(User follow-up setup Page Re-upload)
   - If `template_style` Non-empty:All the pages. `template_style_text` Set as Project Level Value
   - `template_mode` Default `'single'`(Correct semantics for stock items——All pages with the same template)

downgrade Steps(Symmetric Roll Back)Slight。

### 2.5 Data Semantic Constraint(Application layer maintenance,Do Not Write DB Constraints)

- Single Template Mode,All pages `template_asset_id` It should be consistent.、`template_style_text` It should be consistent.——Switch/Bulk value assured by the backend;No, I’m not. DB Layers trigger
- "Unconfirmed Page":`template_asset_id IS NULL AND (template_style_text IS NULL OR template_style_text = '')`
- Multiple Template Mode Dock Disable(PRD §4):The application layer is entering. `SlidePreview` Previous Validation,No, I’m not. DB Layers check

---

## 3. API Schema

### 3.1 Routes

New Blueprint `template_assets_bp = Blueprint('template_assets', __name__, url_prefix='/api/projects')`,Hang on `template_controller.py` Internal,Compared to existing `template_bp` Coexistence(The latter keeps the old one."Project-level list template upload"Access.,Not for the current period.,As decision-making 7 Switch Semantic Compatibility Layers)。

### 3.2 Template assets CRUD

**`GET /api/projects/:projectId/template-assets`** — List Project Template Library
```json
// Response
{ "assets": [
  { "id": "...", "image_url": "/files/...", "thumb_url": "/files/...",
    "analysis_status": "completed", "analysis_json": {...}, "analysis_notes": "...",
    "user_label": "Cover Map", "source": "upload", "sort_order": 0,
    "referenced_page_ids": ["p1", "p2"] }
]}
```

**`POST /api/projects/:projectId/template-assets`** — Put on a flyer with a template picture
```
Content-Type: multipart/form-data
Form: image=@file.png, user_label=Cover Map(Optional)
```
- Sync:Save original map + Thumbnail + Write `project_template_assets` Okay.(`analysis_status='pending'`)
- A walk.:Activate Now `analyze_template_task`(Decision-making 4),Do not block response.
- Response:`{ "asset": {...}, "analyze_task_id": "..." }`
- Optional query Parameters `bind_to_page=:pageId`(Correspond PRD §10.3 "Automatically bind the current page on uploading the shell layer")

**`POST /api/projects/:projectId/template-assets/upload-pdf`** — Upload PDF Open Pages(Decision-making 3)
```
Content-Type: multipart/form-data
Form: pdf=@file.pdf
```
- Sync:Save PDF Present. `uploads/:projectId/template-pdf/:taskId.pdf`,Create `Task(task_type='SPLIT_TEMPLATE_PDF')`
- A walk.:`process_pdf_to_template_images_task` Open Pages → Each page generates one `project_template_assets`(`source='pdf_split'`, `source_pdf_id` / `source_page_index` Fill)→ Each triggers an independent resolution mission
- Response:`{ "task_id": "..." }`,Front wheel query `GET /api/tasks/:taskId` Get the progress.(progress Ham `total/completed/failed`)
- Upper limit:Pages ≤ 50,More than return `bad_request`

**`PATCH /api/projects/:projectId/template-assets/:assetId`** — Edit Assets(User Tags / Fix Parsing)
```json
// Request
{ "user_label": "Contrast Pages",
  "analysis_json": { ...Edited by User 9 Field... },
  "analysis_notes": "..." }
```
- Optional for any field;`analysis_json` Once it’s changed,,Autoset `user_edited_analysis=true`
- Could not initialise Bonobo `analysis_status`(Status is task-driven)

**`DELETE /api/projects/:projectId/template-assets/:assetId`** — Delete Assets
- Delete File(Original Chart + Thumbnail)
- DB Layer `ON DELETE SET NULL` Automatically empty all reference pages `template_asset_id`
- Apply layer to empty the emptied page `template_selection_source` Yes, sir. `NULL`,Match PRD §11"Unrecognized status"
- Response:`{ "deleted": true, "cleared_page_ids": ["p1", "p2"] }`(Let the frontend toast Hint)

**`POST /api/projects/:projectId/template-assets/:assetId/reanalyze`** — Manually Resolved(Decision-making 2)
- Trigger `analyze_template_task`,Take it. `analysis_status` Set `pending`
- Response:`{ "analyze_task_id": "..." }`

### 3.3 Page-level template + Mode Switch

**`PATCH /api/projects/:projectId/pages/:pageId/template`** — Single Page Setup Template
```json
// Request
{ "template_asset_id": "..." | null,
  "template_style_text": "..." | null,
  "selection_source": "manual" }  // Default manual
```
- Optional for any field;And in the meantime null That’s..."Empty Templates"
- Verify:`pageId` It has to be. `projectId`;`template_asset_id` Must belong to the same project
- Do not verify in multiple templates mode"At least one is not empty."(Leave user with blank status),But... SlidePreview Front Press PRD §4 It’s a lockdown.
- Response:`{ "page": { ...page.to_dict()... } }`

**`PATCH /api/projects/:projectId/template-mode`** — Toggle Template Mode(Decision-making 7,JSON Path)
```json
// Request — Single → More
{ "mode": "multi" }

// Request — More → Single(Organisation asset / Text Templates Only)
{ "mode": "single",
  "unified_asset_id": "..." | null,    // At least. asset_id or style_text One is not empty
  "unified_style_text": "..." | null }
```
- Single→More:Change only `projects.template_mode='multi'`,Do Not Move Page Level Fields
- More→Single:Take it. `unified_asset_id` / `unified_style_text` **Batch Overwrite**To All Pages,And change. `template_mode='single'`;Completed within Service(Single `update().where(Page.project_id==pid)`)
- Verify:`unified_asset_id` Must belong to the same project;Both fields returned empty at once `bad_request`

**`POST /api/projects/:projectId/template-mode/single-with-upload`** — More→Single + A new traditional template(multipart Path)
```
Content-Type: multipart/form-data
Form: image=@file.png, unified_style_text=...(Optional)
```
- Service first created asset(The same §3.2 Upload),Revolumes all pages,Cut again. `template_mode='single'`,One full-time business.
- Response:`{ "asset": {...}, "project": {...} }`

**`POST /api/projects/:projectId/template-assets/auto-match`** — Automatically match all items(Decision-making 5)
```json
// Request
{ "overwrite_existing": true,        // Default true,and PRD §8.4 Unanimously
  "preserve_non_empty": false }      // Check"Keep an existing template selection"Time true
```
- Pre-validation:All pages are described.(PRD §8.3),Unsatisfactory returns `{ "error": "missing_descriptions", "missing_page_ids": [...] }`
- Trigger `auto_match_templates_task`,Response:`{ "task_id": "..." }`
- In-mission:Decision-making 5 threshold——Page ≤ 50 and templates ≤ 20 One call.,Or I’ll press. 30 Page in Series
- After the mission.,Put every page of it. `template_asset_id` / `template_match_reason` / `template_match_confidence` / `template_selection_source='auto'` Writing

**`POST /api/projects/:projectId/pages/:pageId/template/auto-match`** — Auto Matching One Page(PRD §9)
- Prefix:Verify description only for current page;If None in Project Template Library `analysis_status='completed'` It’s... asset Then return `{ "error": "no_analyzed_templates" }`
- Step-by-step mission,Response:`{ "task_id": "..." }`(Consistency with automatic project-wide calibration,Enable front-end reuse of progress components)

### 3.4 Progress queries

Reuse Existing `GET /api/tasks/:taskId`(`task_manager.py`),3 new task types(`SPLIT_TEMPLATE_PDF` / `ANALYZE_TEMPLATE` / `AUTO_MATCH_TEMPLATES`)It’s... `progress` JSON Form:
```json
// SPLIT_TEMPLATE_PDF — Multipage Cumulative
{ "total": 12, "completed": 8, "failed": 0, "created_asset_ids": ["..."] }
// ANALYZE_TEMPLATE — Single asset Phase(None total/completed,Stage tags only)
{ "asset_id": "...", "stage": "calling_ai" | "parsing_json" | "done" | "failed" }
// AUTO_MATCH_TEMPLATES — Multipage Cumulative + Batch
{ "total_pages": 30, "matched": 25, "undecided": 5, "batch_index": 1, "batch_total": 1 }
```
Show pre-end engagements:`SPLIT_TEMPLATE_PDF` / `AUTO_MATCH_TEMPLATES` Walk the progress bar.;`ANALYZE_TEMPLATE` Come on. chip Status(pending/processing/completed/failed)。

---

## 4. File Storage

### 4.1 Directory Layout

Reuse Existing `UPLOAD_FOLDER`(By `FileService` Management):

```
uploads/
  :projectId/
    template/                    # Old:Project-level list template(Decision-making 7 Compatibility retention)
      template.png
    template-assets/             # New:Project Template Library
      :assetId/
        original.png             # Original Chart(Extensions are kept by upload)
        thumb.jpg                # Thumbnail,Kwang 480px,JPEG q85
    template-pdf/                # PDF Page Breaking & Original PDF
      :taskId.pdf                # User Original PDF,Retain after mandate has ended 7 It’s for retesting.
      :taskId/                   # Temporary undiscovered PNG,Disassembly Import template-assets/ Deleted after
        page_1.png ...
    pages/...                    # Existing structure
    materials/...                # Existing structure
```

URL Generate continuation of existing routes `/files/:projectId/...`,See `file_controller.py:14-47`。Add `template-assets/:assetId/original.png` and `thumb.jpg` I’m going to need a visit. `file_controller` Additional Path Release(Logical. `template/`)。

### 4.2 FileService Add Method

write to `backend/services/file_service.py`(Continue `save_user_template_thumbnail` It’s... Pillow Thumbnail Mode,See file_service.py:209-243):

```python
def save_template_asset(self, file, project_id: str, asset_id: str) -> tuple[str, str]:
    """Save original map + Thumbnail,Back (image_path, thumb_path)。Organisation PIL verify Defense.。"""

def save_template_asset_from_path(self, src_path: str, project_id: str, asset_id: str) -> tuple[str, str]:
    """Copy from an existing local file(PDF Open Pages),Back (image_path, thumb_path)。"""

def delete_template_asset(self, project_id: str, asset_id: str) -> None:
    """Delete template-assets/:assetId/ Contents。"""

def save_template_pdf(self, file, project_id: str, task_id: str) -> str:
    """Save Uploaded PDF,Return Path。"""

def cleanup_template_pdf_temp(self, project_id: str, task_id: str) -> None:
    """Delete PDF Middle of page unscrew PNG Contents(Do Not Delete PDF)。"""
```

### 4.3 Cleanup Policy

- Delete asset:Synchronise delete files
- Delete project:cascade It’s passed. ORM Achieved,File by `cleanup_project_files()`(Exists)Bottoms up.
- PDF Page-dismantling middle file:Clean up immediately after the mission. `:taskId/` Contents;Original PDF Reservations 7 Jesus.(Follow-up"Rediscover Page"Use it.),Clean up with a time-scan(Leave interface,Not achieved during the period,Add TODO Comment)
- Thumbnail Missing:`thumb_url` Yes. null Frontend fallback Present. `image_url`(Already at Frontend store Processing)

---

## 5. AI Services and grounding

### 5.1 PDF Pagebreaking service(Decision-making 3)

**New `backend/services/pdf_image_service.py`:**

```python
import fitz
from pathlib import Path

def pdf_to_page_images(pdf_path: str, output_dir: str, dpi: int = 150,
                       max_pages: int = 50) -> list[dict]:
    """
    Render PDF Each page is as PNG,Back [{"index": 1, "path": "..."}],Failed Page path=None But it’s reserved. index。
    More than max_pages Throw! ValueError(By controller Turn. bad_request)。
    """
    doc = fitz.open(pdf_path)
    if len(doc) > max_pages:
        raise ValueError(f"PDF too long: {len(doc)} pages, max {max_pages}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    results = []
    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)
    for i, page in enumerate(doc):
        out_path = Path(output_dir) / f"page_{i+1}.png"
        try:
            pix = page.get_pixmap(matrix=matrix)
            pix.save(str(out_path))
            results.append({"index": i + 1, "path": str(out_path)})
        except Exception as e:
            logger.warning(f"PDF page {i+1} render failed: {e}")
            results.append({"index": i + 1, "path": None, "error": str(e)})
    doc.close()
    return results
```

Reference Code:`backend/controllers/project_controller.py` Existing `fitz.open() + page.get_pixmap()` Call。

### 5.2 Prompt Template(Decision-making 4 / Decision-making 5)

**Add to `backend/services/prompts.py`:**

#### 5.2.1 `get_template_analysis_prompt(language: str = 'zh') -> str`

Based on existing prompts.py Style(Function returns string),Output Format and `get_outline_generation_prompt`(L280)Unanimously——markdown JSON Blocks,3 Try again softly by `generate_json()` Bottoms up.。

Key points:
- Embedded 2-3 A real template parsing sample(few-shot),Overwrite"Cover Map / Double Bar Body / Timeline"Three paradigms. layout
- 9 Field schema Visible List(PRD §5.3),`text_regions[]` / `image_regions[]` Use it. array of objects
- `notes` Field description"AI Subjective observation",Encourage Filling
- Signs of failure:If the picture cannot be identified as slide,Requesting Return `{"error": "not_a_slide"}`,That’s the side of the mission. `analysis_status='failed'`

#### 5.2.2 `get_template_auto_match_prompt(templates: list[dict], pages: list[dict], language: str) -> str`

Enter Crop(Decision-making 5 Elements of achievement):
- Every page:`{ page_id, order_index, title, summary[≤100 Word], content_density: 'low'|'medium'|'high' }`
  - `content_density` Yes. controller It’s from the ground up.,Do Not Enter Library:Press `len(page.description)` Estimate——`<200` Word low、200-600 medium、`>600` high(Thresholds can be subsequently adjusted)
- Every Template:`{ asset_id, user_label, layout_structure, content_capacity, visual_density, style_keywords[≤5], notes[≤200 Word] }`
- Output schema Strictly follow. PRD §8.2(Array,Each element contains `page_id / template_asset_id / status / confidence / reason`)
- prompt Visible Ban"Not on candidate template asset_id"
- `status` enum: `matched | undecided`(`undecided` Time `template_asset_id=null`,Match PRD §8.4)

### 5.3 AIService Add Method

**`backend/services/ai_service.py`:**

```python
def analyze_template(self, image_path: str, language: str = 'zh') -> dict:
    """
    Call generate_with_image + JSON Parsing。
    Reuse self.generate_json It’s... 3 Try again(L202-232),Failed to drop anomaly captured by task。
    Back 9 Field dict(PRD §5.3 schema)or {"error": "not_a_slide"}。
    """

def auto_match_templates(self, project_id: str, language: str = 'zh',
                         overwrite_existing: bool = True,
                         preserve_non_empty: bool = False) -> list[dict]:
    """
    Automatic Matching:Decision-making 5 This is where the threshold and batch logic are achieved.。
    - Take Item All ProjectTemplateAsset(Filter analysis_status != 'completed' I’m not a candidate.,Decision-making 2)
    - Take Item All Page(Only those that have a description.,Prevalidation in controller)
    - If len(pages)<=50 and len(templates)<=20:One call.
    - Otherwise...:Press 30 Page in Series,batch Combination
    Back [{"page_id", "template_asset_id"|None, "status", "confidence", "reason"}]
    """
```

### 5.4 task_manager New Task

**`backend/services/task_manager.py` Add 3 individual task type Constants and Process Functions:**

| Task Type | Trigger | Pools | Annotations |
|-----------|--------|--------|------|
| `SPLIT_TEMPLATE_PDF` | `POST .../template-assets/upload-pdf` | `image_resource_limiter` | Rotation `pdf_to_page_images` → Every page `save_template_asset_from_path` → Create asset Okay. → Trigger `ANALYZE_TEMPLATE` Tasks |
| `ANALYZE_TEMPLATE` | Upload/Open Pages/Manual reanalyze | `text_resource_limiter` | Rotation `ai_service.analyze_template`,Write `analysis_json` / `analysis_notes` / `analysis_status` |
| `AUTO_MATCH_TEMPLATES` | `POST .../template-assets/auto-match` | `text_resource_limiter` | Rotation `ai_service.auto_match_templates`,Bulk Update pages |

Code of conduct:Continue `_commit_with_retry`(`task_manager.py:261-273`),Progress when failure JSON Take it. failed +1 But no other tasks are blocked.。

I’ll make a deal.:
- Single PDF Open Pages N individual `ANALYZE_TEMPLATE` Submission passed. `text_resource_limiter` Limited flow(Continue `generate_descriptions_task` Mode)
- `AUTO_MATCH_TEMPLATES` Lines within Projects(Only one item is allowed at the same time,controller Layer `Task.query.filter_by(project_id, task_type, status='PROCESSING').first()` Weight protection)

---

## 6. Image Generation Link Retrofit

### 6.1 Change Point Positioning

Main Path:`backend/services/task_manager.py:645-668`(Existing `use_template` Branch),Complement `prompts.py:815-860` It’s... `generate_image_prompt`。

### 6.2 Priority chain(PRD §13)

Replace existing `use_template = bool(project.template_image_path)` Single judgement,query by page instead:

```python
# False code.
def resolve_page_template(page: Page, project: Project) -> tuple[str | None, str | None]:
    """Back (image_path_for_ref, style_text)"""
    image_path = None
    style_text = None

    # Priority 1:Page-level image template
    if page.template_asset_id:
        asset = page.template_asset  # relationship
        if asset:
            image_path = file_service.resolve_template_asset_path(asset)

    # Priority 2:Page Text Template
    if page.template_style_text:
        style_text = page.template_style_text

    # Priority 3 / 4:Project level fallback(Compatibility of old projects and decision-making 7 Single Template Mode)
    # Attention.:Single Template Mode backfill Synchronizes project-level values to page level,The main here is
    # "Inventory project not running backfill" and"User Skipping Template Selection in Single Template Mode"Bottoms up.
    if image_path is None and project.template_image_path:
        image_path = file_service.get_template_path(project.id)
    if style_text is None and project.template_style:
        style_text = project.template_style

    return image_path, style_text
```

### 6.3 prompt Collapse

`generate_image_prompt` Current Signature `has_template: bool`,Extension to:
```python
def generate_image_prompt(..., has_template_image: bool, page_style_text: str | None, ...) -> str:
    # has_template_image: True Time plus"Coloring and design language and template pictures are strictly similar"(prompts.py:836)
    # page_style_text: Unempty-time-to-script style segment(Alternative project.template_style Project-level couplings)
```

Useful.:`task_manager.py` Yes. `generate_image_prompt` Before calling. `resolve_page_template(page, project)` Take out the page (image_path, style_text),Separate transmissions。

### 6.4 One Page Reproduction Entry

`generate_single_page_image_task`(Exists)Synchronization,Ensure that users are in multi-template mode"Regenerated Single Page"It’s a real page. `template_asset_id` Corresponds to the picture. It’s a decision. 7 "Generated pictures are not affected by switching"A reverse guarantee.——Once User Point Regenerated,New template effective。

### 6.5 Compatibility

- Old items:migration backfill Project-level templates were written to the page level,There’s no difference in retrofitting paths.
- Page-level templates generated by mode switching overwrite:By `PATCH .../template-mode` Synchronize within the service,Ensures that the image generation is read by switching values
- Tusheng failed to repeat the existing test `task_manager.py` Retry Chain,There’s no need to change.

---

## 7. Frontend Structure

### 7.1 Route

`frontend/src/App.tsx` Route sequence extended to(Decision-making 1 + Decision-making 6):

```
/                                     Home
/project/:projectId/outline           OutlineEditor
/project/:projectId/detail            DetailEditor
/project/:projectId/template-setup    TemplateSetupPage(New Page,Multiple templates must pass)
/project/:projectId/preview           SlidePreview
```

**`Home.initializeProject` After completion**:Whatever. `templateMode` Yes. single Or is it? multi,Harmonization `navigate(/project/:id/outline)`——Template configuration occurs outline / detail After(PRD §2 Process)。

**`DetailEditor` Completed state"Next"button**(Decision-making 1 / Decision-making 6 In this branch):
```ts
project.template_mode === 'multi'
  ? navigate(`/project/${id}/template-setup`)
  : navigate(`/project/${id}/preview`)
```

**`TemplateSetupPage` Road guards.**(Decision-making 6 Accompany):If `project.template_mode === 'single'`,Component mount Time `navigate('/preview', { replace: true })`,Prevent users from losing manually URL Empty page by error。

### 7.2 Store(`frontend/src/store/useProjectStore.ts`)

#### 7.2.1 Replaced localStorage key

For old prototypes. 4 individual key(Handover of documents §4.3)Discard All,was replaced by API:

| Old key | New Data Source |
|--------|---------|
| `template_mode_${projectId}` | `project.template_mode`(Backend Field) |
| `template_assets_${projectId}` | `GET /api/projects/:id/template-assets` |
| `page_template_assign_${projectId}` | `page.template_asset_id` / `template_style_text`(Already page.to_dict) |
| `page_fine_tune_drawer_width` | Reservations localStorage(Pure UI Preferences,It’s not about data.) |

Clear Action:Store If old detection occurs at initialization localStorage key,Remove Directly(`removeItem`),Do Not Move——Handover of documents §3 Declaration"Old demo Data does not migrate"。

#### 7.2.2 Add actions

```ts
// Template assets
loadTemplateAssets(projectId): Promise<TemplateAsset[]>
uploadTemplateAsset(projectId, file, opts?: { bindToPageId?: string }): Promise<TemplateAsset>
uploadTemplatePdf(projectId, file): Promise<{ taskId: string }>
updateTemplateAsset(projectId, assetId, patch): Promise<TemplateAsset>
deleteTemplateAsset(projectId, assetId): Promise<{ clearedPageIds: string[] }>
reanalyzeTemplateAsset(projectId, assetId): Promise<{ taskId: string }>

// Page-level template
updatePageTemplate(projectId, pageId, patch): Promise<Page>

// Mode Switch
switchTemplateMode(projectId, payload: SwitchModePayload): Promise<Project>
// SwitchModePayload:
//   { mode: 'multi' }
//   | { mode: 'single', unifiedAssetId?: string, unifiedStyleText?: string }
//   | { mode: 'single', uploadFile: File }  // Come on. multipart Subend

// Automatic Matching
autoMatchAll(projectId, opts): Promise<{ taskId: string }>
autoMatchPage(projectId, pageId): Promise<{ taskId: string }>
```

#### 7.2.3 StatusSync

- Parsing Tasks:Rotation `/api/tasks/:taskId`,Locally refreshed after completion asset(`loadTemplateAssets` Full brush or in-place Replace)
- Automatic Matching:I’ll change it once we’re done with the mission. `loadProject(projectId)` Refresh All page
- Delete Assets:Optimistic Update,Take it. `clearedPageIds` Corresponding page Fields left empty locally

### 7.3 Type(`frontend/src/types/index.ts`)

`feat/per-page-template` Retentioned type to follow,Completion:

```ts
export interface TemplateAsset {
  id: string;
  image_url: string;
  thumb_url: string | null;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis_json: TemplateAnalysis | null;
  analysis_notes: string | null;
  analysis_error: string | null;
  user_label: string | null;
  user_edited_analysis: boolean;
  source: 'upload' | 'pdf_split' | 'system_preset';
  sort_order: number;
  referenced_page_ids: string[];
}

export interface TemplateAnalysis {
  summary: string;
  template_type: string;
  layout_structure: string;
  content_capacity: 'low' | 'medium' | 'high';
  text_regions: Array<{ role: string; count: number }>;
  image_regions: Array<{ role: string; count: number }>;
  visual_density: 'low' | 'medium' | 'high';
  style_keywords: string[];
  notes: string;
}

// Project Add
template_mode: 'single' | 'multi';

// Page Add
template_asset_id: string | null;
template_style_text: string | null;
template_selection_source: 'manual' | 'auto' | 'batch_apply' | null;
template_match_reason: string | null;
template_match_confidence: number | null;
```

### 7.4 Component adaptation and new

#### 7.4.1 New `TemplateSetupPage.tsx`(PRD §7)

Main blocks:
- Top:Template Mode Control Bar(`Convert to Single Template` button,Symmetrical DetailEditor It’s..."Convert to Multiple Templates")+ `One-click automatic match` button
- Left Bar:**Project Template Library**——Grid displays all TemplateAsset Card
  - Thumbnail / User Tag Input Box(inline Edit)/ Parsing status logo / Parsing Summary(Expand Editable 9 Field)
  - Bottom of the card:`Delete` / `Resolve`(When you fail, you show your face.)
  - Top:`Upload pictures` + `Upload PDF` Double Button,PDF Show progress bar after uploading
- Right Bar:**Page List**——Lines per page,Show
  - Serial number + Title + Content density chip
  - Current Template Thumbnail(If there is.)/ Preview of the current text template(If there is.)/ Not confirmed chip
  - button:`Select Template`(Manually select a layer.)/ `Auto Matching One Page` / `Edit Text Templates`
- Automatically match prevalidation:Missing Description Button disabled + tooltip(PRD §8.3)

#### 7.4.2 Adaptation `Home.tsx`(Decision-making 7)

Continue `feat/per-page-template` Branch."Single/Multiple Template Buttons"Prototype,But... `initializeProject` Change the truth. API:
- Single Template:Create items first(`POST /api/projects` The tape. `template_mode='single'` + `template_image_path` / `template_style`)→ Write an upload template to the backend when creating the item `project_template_assets`,But...**At this point, pages Not yet generated**——Synchronization takes place at two time points:
  1. **Outline Generation Creation pages Time**:Backend `task_manager` Yes. outline In the mission. commit pages Time,Based on `project.template_mode='single'` Reunify. asset and style_text Synchronise Write Every Page
  2. **User change template in follow-up template mode**:Activate any changes to the project-level template `PATCH /template-mode`(The pattern is the same.,Semantic As"Reunification"),Backend overwrites all pages
- Multiple Templates:Create items first(`template_mode='multi'`,No Template Fields)→ Straight ahead. outline,Template to TemplateSetupPage Processing

#### 7.4.3 Adaptation `DetailEditor.tsx`

Top plus"Template Mode Control Area":
- Current `single`:Show `Convert to Multiple Templates` button,Click `switchTemplateMode({ mode: 'multi' })` → `template-setup`
- Current `multi`:Show"Current as Multi Template Mode,Go to Template Configuration"Link

#### 7.4.4 Adaptation `SlidePreview.tsx`

Reservations `feat/per-page-template` Right side of the prototype"Page Precise"The drawer.(`PageFineTuneDrawer.tsx`),But...:
- Data source from localStorage Cut store
- Single Template Mode:Hide the drawers."Project Template Library"Blocks,Only keep page description editing(Decision-making 6 Accompany)
- Multiple Template Modes:Full display of template library in drawers + Current Page Template Selection + One Page Automatic Match Button
- Top Template Control Bar Based on `project.template_mode` Select one to show a button:
  - `single` Show time `Convert to Multiple Templates`,Click `switchTemplateMode({ mode: 'multi' })` → Stay SlidePreview(Users can also jump manually template-setup)
  - `multi` Show time `Convert to Single Template`,Click to open `SwitchToSingleModeDialog`
- More→Switch away."Select a unified template bomb layer":List the current template library + `Upload New Templates` + Text Style textarea,When submitting:
  - Selected asset / Text Only → `PATCH /template-mode`(JSON Path)
  - Upload New Map → `POST /template-mode/single-with-upload`(multipart Path)

#### 7.4.5 New Component

- `TemplatePickerModal.tsx`:Templates with Thumbnails to select ballistic layers(PRD §10.2),Ham"Upload New Templates"Embedded Entry,Check Assemble `updatePageTemplate`
- `TemplateAnalysisEditor.tsx`:9 Field Form Component,Yes. TemplateSetupPage Use of cards to expand;Red box under failed status + Resolve button
- `SwitchToSingleModeDialog.tsx`:More→Unified template selection for single toggle
- `TemplateMatchProgress.tsx`:A summary of progress and results of automatically matching tasks

### 7.5 i18n

By project practice(CLAUDE.md "Component-level `useT()` hook with inline zh/en translations"),All new files are in the components. inline,Not Global i18n Documentation。

---

## 8. Testing and acceptance

### 8.1 Backend Unit/Integrated testing(`backend/tests/`)

Based on existing pytest Structure,Add:

**`test_template_assets_api.py`**
- POST/GET/PATCH/DELETE asset All CRUD
- After uploading `analysis_status='pending'`,Simulation changes after completion of the task `completed`
- DELETE Post-referenced page field set NULL(`SET NULL` Binding Authentication)
- Cross-project visit denied(asset belongs to other project)

**`test_template_pdf_split.py`**
- Real. PDF Upload(Test fixture Fire! 3 Sample Page PDF)
- Authentication N Chang! asset Create + Sub-resolution task trigger
- Super. 50 Back to Page 400
- Other pages were successful when single page rendering failed(`failed` Count correct.)

**`test_template_analysis.py`**
- Mock `ai_service.analyze_template` Return to Fixed 9 Field,Validate Writing Library
- AI Back `{"error": "not_a_slide"}` Time `analysis_status='failed'` + `analysis_error` Fill
- Parse Peers status Reset pending

**`test_template_auto_match.py`**
- Mock LLM Returns fixed matching arrays,Authenticate page field writing
- `preserve_non_empty=true` Skipped already asset_id Page
- `undecided` Status Places Page Fields NULL(PRD §8.4)
- Return when description is missing missing_descriptions Error
- Threshold Switch:51 Page items take batch paths,Validate number of calls

**`test_template_mode_switch.py`**
- Single→More:Only mode Change,Do not move the page level field
- More→Single + `unified_asset_id`:All pages overwhelmed in bulk,Atomity of the transaction(It’s going back and forth.)
- More→Single + `unified_upload`:multipart End first asset Overwrite
- Switch After `generated_image_url` Reservations remain unchanged(Decision-making 7)

**`test_image_generation_template_priority.py`**(Key Real Tests)
- Create 3 Page items,page1 Page Level asset,page2 Set Only style_text,page3 All empty(Take Project Level fallback)
- Trigger image generation,**With the truth. AI provider**(Along CLAUDE.md "I don’t care about the cost of testing."Request)
- On Validation of Three Pages Generation prompt and ref_image They’re from the right source.(Use it. task_manager It’s... log Verify or provider mock First-level scratch. prompt)

### 8.2 Front-end unit testing(Vitest)

- `TemplatePickerModal`:Render All asset、Select to trigger the echo、"Upload New Templates"Open input、Autocheck successfully uploaded
- `TemplateAnalysisEditor`:9 Field editing, saving tunes `updateTemplateAsset`、Failed Presentation
- `SwitchToSingleModeDialog`:List template, text style, upload three options to verify
- `useProjectStore`:Mode Switch / asset Add & Delete / parse task polling action Monometric

### 8.3 E2E(Playwright,`frontend/e2e/`)

Reuse Existing `e2e/helpers/seed-project.ts` Quick Seed Tool,Add:

**`template-mode-creation.spec.ts`(mock + Two layers.,See CLAUDE.md)**
- Home Checklist Template Upload → outline → detail → preview,Authentication preview Use the same template for all pages
- Home Select Multiple Templates → outline → detail → template-setup → Upload 2 Chart → Bind the page separately → preview,Validate refreshing and binding still

**`template-pdf-split.spec.ts`**
- Upload 3 Sample Page PDF → When the job is done. → Template library appearance 3 Chang! → Each analysis State advanced to completed

**`template-auto-match.spec.ts`**
- Multiple Template Items,Template Library ≥2 Chang! → One-click automatic match → When the job is done. → It’s on every page. asset_id or undecided Tags → Authentication reason/confidence Writing

**`template-delete-cascade.spec.ts`**
- Multiple Template Items,Template Library 1 Zhang Yu. N Page citation → Remove Template → Quote Page All Change"Not confirmed" → toast Displays the number of affected pages → It’s still empty after refreshing.

**`template-mode-switch.spec.ts`(Decision-making 7 Chile)**
- Single→More:DetailEditor Points"Convert to Multiple Templates" → Road jump. template-setup → The one that was created in the template library
- More→Single:SlidePreview Top Point"Convert to Single Template" → Bounce Selection Template → All pages are uniform → It’s still uniform when it’s refreshed
- More→Single toggle does not affect the image generated:Mr. Cheng page1 Figure,Switch,page1 Figure retention

**`template-fine-tune-drawer.spec.ts`(Inheritance `fine-tune-drawer.spec.ts`)**
- Single template drawer with no template library area
- Full function of the bottom drawer in multiple templates mode,Upload/Tie/Remove All Runs

**`template-route-guard.spec.ts`(Decision-making 6 Guards.)**
- Single Template Item Manual Access `/project/:id/template-setup`,Authentication `replace` Jump to `/preview`,None in browser history stack `template-setup` Entry(Press the browser back to return. detail,Not template-setup)
- Multi Template Project Access `/template-setup` Normal rendering,Do Not Jump

### 8.4 Real Generating Chain Validation(CLAUDE.md Mandatory requirements)

At least once to the end. AI Call(Cost accepted by project):
1. Create 3 Multi-page Template Items
2. Upload 2 A template diagram(When the real resolution is complete.)
3. One-click automatic match(Wait for the truth. LLM Completed)
4. Generate all pages(Wait for the real picture. API Completed)
5. Manual inspection:The style of each page generating pictures corresponds to the template of the page bound

---

## 9. Implementation sequence and milestones

By relying on the cappuccino,Each step of the inside can go in parallel.,Serials between steps:

### Phase A:Basic Data Layer(Projected 1 Jesus.)
1. New Branch `feat/per-page-template-v2`(From the latest `main`,Do Not Reuse Old `feat/per-page-template`)
2. Write SQLAlchemy model:`ProjectTemplateAsset` + `Project.template_mode` + `Page` 5 Columns
3. Write Alembic migration Ham backfill
4. Backend model Monometric(Empty object to to_dict、relationship Cascade)

### Phase B:Documentation and PDF(Projected 1 Jesus.)
5. `FileService` New methodology + `file_controller` Path Release
6. New `pdf_image_service.py`
7. `test_template_pdf_split.py` Pass.(does not contain AI)

### Phase C:Asset CRUD + Mode Switch API(Projected 1.5 Jesus.)
8. `template_controller.py` New endpoints(This section §3.2 / §3.3 All)
9. `task_manager` Add `SPLIT_TEMPLATE_PDF` task type
10. `test_template_assets_api.py` + `test_template_mode_switch.py` Pass.

### Phase D:AI Parsing & Automatic Matching(Projected 1.5 Jesus.)
11. `prompts.py` Two new ones. prompt
12. `ai_service.py` Add `analyze_template` / `auto_match_templates`
13. `task_manager` Add `ANALYZE_TEMPLATE` / `AUTO_MATCH_TEMPLATES` task type
14. `test_template_analysis.py` + `test_template_auto_match.py` Pass.(LLM Part mock)

### Phase E:Image Generation Link(Projected 1 Jesus.)
15. `resolve_page_template` Draw Functions + `task_manager:645-668` Adaptation
16. `generate_image_prompt` Sign Extension
17. `test_image_generation_template_priority.py` Pass.(**Real. AI**)

### Phase F:Frontend(Projected 3 Jesus.)
18. Route + Type + store Full replacement
19. New `TemplateSetupPage` + 4 New component
20. Adaptation `Home` / `DetailEditor` / `SlidePreview`
21. Pick up the drawer. store
22. Frontend Vitest Pass.

### Phase G:E2E + Real link.(Projected 1 Jesus.)
23. 6 individual Playwright Example
24. The real generation of links once.
25. Document Update(`docs/zh/` + README Template module)

### Phase H:PR(Projected 0.5 Jesus.)
26. Disassemble commit:Data Layer / Documentation / Asset API / AI / Tusheng! / Frontend / E2E / Documentation
27. Push! PR,Wait. Gemini review,Processing inline comments
28. Merge, Delete worktree(If you want to use)、Delete Old `feat/per-page-template` Branch

**Total estimate:9.5 Working days**

### 9.1 Risk pointer

- PDF Open Pages OOM:DPI Default 150,We’ll adjust it when we’re done.
- LLM Parsing failure rate:Decision-making 2 Undercovered,But if... >30% Failed to repeat prompt(`prompts.py` Add Log)
- Mode Switching Service:More→A single batch update page may N+1,Use it. `update().where(Page.project_id == ...)` Single SQL
- Old `feat/per-page-template` The branch won’t move.,Delete separately after merging,Avoid flow back to this branch

### 9.2 Don’t do it.(Visible exclusions)

- System preset template pool(Stay. `GET /api/templates` The interface is empty.)
- Template Version/History(`analysis_json` Use it. JSON Field supported schema Evolution)
- Embedding Template prefiltration(Decision-making 5 Excluded,N>20 Evaluate when Templates)
- Reuse Cross-Project Templates(`UserTemplate` Existing but not accessible page-level template system,Follow-up merger)
- Automatic Matches"Separate page by page LLM Call"Mode(Decision-making 5 Exclude)




