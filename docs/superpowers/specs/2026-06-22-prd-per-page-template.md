# PRD：Different template functions per page (harmonized template system adaptation)）

> Source：2026-03-22 ~ 03-23 Codex session Design discussions organized to be based on the final confirmed plan。

---

## 1. Functional Positioning

Will Current"Project-level list template"Programme upgraded to**A uniform page-level template system**。Always press the bottom"Each page has its own template."Modeling;single template mode is a mass-granted syntax sugar。

### Core principles

- **Content Priority**：Template does not affect page description, only image generation and presentation styles
- **AI Let’s do it first. Users have control.**：AI Parsing and matching. Users can view, correct, and cover all AI Outputs

---

## 2. Process Overview

```
Home → OutlineEditor → DetailEditor → TemplateSetupPage（Add） → SlidePreview
```

- `Home`：Content input, creation of items, selection of template mode (single template) / Multiple Templates）
- `OutlineEditor`：Outline Editor
- `DetailEditor`：Description Editor (Content Layer)）
- **`TemplateSetupPage`**：Template asset management + Template Match (New Page, This Function Core)）
- `SlidePreview`：Final Preview and Export

### Why did you put it? DetailEditor After

- Template automatically matches the real content and information density of a page dependent，DetailEditor It’s only stable when it’s over.
- User is best placed to judge whether the template library is adequate at this time、AI Is the label accurate?
- Match"Content Priority"Principle： First content, then template.

---

## 3. Template Mode

### 3.1 Two models.

| Mode | Annotations |
|------|------|
| **Single Template Mode** | User selects a template once (photo) + text) , automatically apply to template fields on all pages |
| **Multiple Template Modes** | Each page manages its own template (photogram template) + Text Templates） |

**Bottom Data Semantics**：In any pattern, the database is always used"One per page `template_asset_id` + `template_style_text`"Form Storage。**Single template mode only means that two fields on all current pages coincide with the same set of values**——It’s... UI hint，Not a stand-alone data form. This means that the mode switch does not require a data structure migration, but simply overwrites or synchronizes a page level field。

### 3.2 Mode-to-mode rules (decision-making) 7，2026-06-22）

> This section is revised from the original PRD"Multiple Templates → Single template not allowed"Change the rule to two-way cut-off for the whole phase.。

**Candidates：**
- A) Maintain the original PRD：Single→It’s okay. It’s okay.→Singlely forbidden
- B) Single→It’s okay. It’s okay.→single permission; many→Single-time user selects one of the existing templates as a uniform template and the rest of the page-level data is covered
- C) full-stage two-way switch; multiple→Single-time users select a uniform template from the existing template, while the rest of the page level data is covered; the data layer remains the same"One template per page"，Modes Just UI hint
- D) full-stage two-way switch; multiple→Empty all page-level data in a single time and ask users to re-select a uniform template
- E) full-stage two-way switch; multiple→Keep page-level data single-time only UI Layer shield. Restore data as it is when cutting back to multiple templates

**Selection：C**

**Rationale：**
- Select C：and PRD Page 1 Section"The bottom always has its own template model on each page."The core principles are consistent; allow users to select an existing template as a unified template, both to avoid the loss of the template library and to visualize over-cover actions。
- No choice. A：The user worked in multiple templates for a while to find out."I’m trying to unify."Locked Unable to retreat; and since one per page at the bottom，UI Toggle should not be irreversibly bound.。
- No choice. B：and C Less than that."Semantic Data Harmonization"The statement that the project is still going to be confused."Whether to write a project level when cutting to a single template `template_image_path`"。
- No choice. D：Forced emptiness; users might just want"It’s one of the ones that unites into the present."，Cleaning up makes the operation more expensive.。
- No choice. E：UI Hide but keep the data, and cut back to multiple templates"A bunch of templates came out of nowhere."It’s a shock to the user. It’s a breach."Modes Just UI hint"Principles。

**Switch Rules：**
- Select single or multiple templates when the item is created
- **Single → More**：Switch Only `template_mode = 'multi'`，All pages inherit the currently selected template (main status quo)）
- **More → Single**：Play."Select a uniform template"Bomb Layer (selectable from the template library) / New Upload） → User confirmation → Backend writes the selected template batch to all pages `template_asset_id` and `template_style_text`（Overwrite Existing Page Level Value） → `template_mode = 'single'`
- **Images generated are not affected by switching**：Toggle only changing fields, generated `generated_image_url` saving;use new template only when user recreates the page

**Switch entrance：**
- Single Template User：`DetailEditor` / `SlidePreview` Top template control area. `Convert to Multiple Templates` button
- Multiple Template Users：`TemplateSetupPage` / `SlidePreview` Top template control area. `Convert to Single Template` Button (Symmetry)）

**Data Layer Engagement：** `projects.template_mode` Fields only control UI Rendering branch, no impact. `pages.template_asset_id` / `pages.template_style_text` to read and write。

### 3.3 "No Templates"No longer exists on its own.

Old."No template mode"Unite As"Text Template Only". Three modes are combined.：
- Single Template = Batch the same set of template values
- Multiple Templates = Page-by-page Management
- No Templates = Text template only for all pages

---

## 4. Type definition for template per page

Two template slots per page：

| Field | Annotations |
|------|------|
| Picture Template | Quote a template asset in the project template library（`template_asset_id`） |
| Text Templates | Page-level text style description（`template_style_text`） |

### Legal status (select at least one)）

1. Picture Templates Only
2. Text Templates Only
3. Picture Template + Text Templates

**Prohibited Status**：Pictures and text are empty

### Multiple Template Mode Dock Disable

- Under Multi Template Mode，**All pages must select a template (not an unrecognized state) to move on to the next step**（SlidePreview）

---

## 5. Project Template Library

### 5.1 Data Model：`project_template_assets`

| Field | Type | Annotations |
|------|------|------|
| `id` | string | Primary Key |
| `project_id` | string | Items to which it belongs |
| `image_path` | string | Template Picture Path |
| `thumb_path` | string | Thumbnail Path |
| `analysis_status` | enum | `pending / processing / completed / failed` |
| `analysis_json` | json | Structural decomposition results (see 5.3） |
| `analysis_notes` | string | AI Free Text Supplement |
| `user_label` | string | User Manual Tags (e. g."Cover Map""Contrast Pages""Directory Template"） |
| `sort_order` | int | Sort |
| `created_at` | datetime | Created |

### 5.2 Core relations

- One project has multiple template assets
- **A template asset can be reused by multiple pages**（Not 1:1 Tie）
- Select a picture template for each page

### 5.3 Template Parsing Results schema

After uploading AI Auto-step resolution, output structured JSON：

```json
{
  "summary": "Top Title + Center Double Bar Body + Bottom conclusion",
  "template_type": "content",
  "layout_structure": "title-top-two-column",
  "content_capacity": "medium",
  "text_regions": [
    { "role": "title", "count": 1 },
    { "role": "body", "count": 2 }
  ],
  "image_regions": [
    { "role": "illustration", "count": 1 }
  ],
  "visual_density": "medium",
  "style_keywords": ["academic", "clean", "blue"],
  "notes": "It’s fixed on the lower right corner. logo Regional"
}
```

- Fixed fields for program logic and automatic matching
- `notes` Field Load AI Not a very structured observation.
- **users can access it in TemplateSetupPage Directly modify the resolution result**

### 5.4 Template Uploading Method

1. **Upload pictures one by one**
2. **Upload PDF AutoClose Pages**：System Auto parsing PDF Each page of pictures, add all to the project template library

### 5.5 User Tags

- Each template asset can be marked with a durability mark, e.g.：`Cover Map`、`Directory Template`、`A/B Contrast Pages`、`Chapter transition page` Wait.
- Tag Information Available AI Automatic Matching as Selection Reference
- Yes. TemplateSetupPage Edit

---

## 6. Page-level template field

Yes. `pages` Add to Table：

| Field | Type | Annotations |
|------|------|------|
| `template_asset_id` | string / null | Picture template cited |
| `template_style_text` | string / null | Page Text Template |
| `template_selection_source` | enum | `manual / auto / batch_apply` |
| `template_match_reason` | string / null | Auto-matching reason |
| `template_match_confidence` | number / null | Automatically match confidence |

### Status determination

| Status | Conditions |
|------|------|
| Confirmed | `template_asset_id` is not empty, or `template_style_text` Non-empty |
| Not confirmed | Both are empty or automatically matched for return `undecided` |

---

## 7. TemplateSetupPage（New Page）

### 7.1 Page Duty

It’s... `DetailEditor` After、`SlidePreview` Prior formal steps, responsible：

1. Select Template Mode (if not already selected)）
2. Upload template： Picture by Picture / Upload PDF Open Pages
3. Show Template Thumbnail List
4. Presentation AI Parsing results (step resolution immediately after uploading)）
5. Edit template tags and layout descriptions (user can correct) AI Parsing）
6. One button automatically matches the template to the page
7. Template selection for manual correction of individual pages
8. Remove Template
9. View Parsing Status
10. Check in after completion. SlidePreview

### 7.2 Template Card Layout

Expand assets per template：
- Thumbnail
- User Tag Fields
- AI Parsing layout structure (editable)）
- Parsing Status Directives

---

## 8. Automatically match multipage templates

### 8.1 Match Method

- **One-time full project LLM Call**，Not page by page.
- Input： All Template Librarys and their Parsing Information + Title of all pages/Description Summary/Location of page number/Content density
- Output： Structured Match Results per Page JSON

### 8.2 Output Format

```json
[
  {
    "page_id": "...",
    "template_asset_id": "tpl_003",
    "status": "matched",
    "confidence": 0.86,
    "reason": "Medium content density, double-bar structure, suitable for the text template"
  },
  {
    "page_id": "...",
    "template_asset_id": null,
    "status": "undecided",
    "confidence": 0.32,
    "reason": "There is no template in the current template library suitable for high-density time line content"
  }
]
```

### 8.3 Preconditions

- **Require all pages to be described**
- If there is a missing description page, do not execute the match, click the hint：<br>
  > "And... N There’s no description on the page. It’s a suggestion./Automatically match templates after editing the description"

### 8.4 Overwrite Logic

- **Default template selection to overwrite all pages**
- Click on the tickbox to confirm that the hint overwrites the current template selection
- The confirmation box provides options：`Keep an existing template selection`（Skip After Checking `template_asset_id` Non-empty Pages）
- If... LLM Back `undecided`，**Empty the old template of the page**，Mark as"Template not confirmed"

### 8.5 Match Result Processing

- Automatically match successful pages：**Directly considered confirmed**（No page-by-page confirmation required）
- `undecided` pages: treat as unconfirmed
- Matching Results Direct Library

---

## 9. Auto Matching One Page

### 9.1 Access.

In each page card toolbar `Automatic Match Templates` Buttons (Similar)"Single Page Generation Description"It’s a mental model.）

### 9.2 Preconditions

- **Just ask for a description on the current page**，Not affected by the lack of description on other pages

### 9.3 Overwrite Logic

- If there is a template on the current page, click the confirmation box：<br>
  > "Automatic matching will overwrite the selected template of the current page, sure to continue?？"
- Confirmation box supports ticking `Next time, no more hints.`（Local Preferences Storage）

---

## 10. Manual selection template

### 10.1 Access.

Under each page card toolbar (editor, recreate left) plus `Select Template` button

### 10.2 Interactive

- Popup after Click**Templates with Thumbnails to select ballistic layers**（Not a drop-down list) includes：
  - All templates in the current project template library ( thumbnail presentation)）
  - `No template selected` Options
  - `Upload New Templates` Access.
- The selected template preview is fixed above the card toolbar

### 10.3 Upload a new template from the ballistic layer

- After upload success：
  1. Add Project Template Library
  2. **Automatically bind to current page**（Default selection of this new template）
  3. Continue with the template’s solver backstage step (manual selection does not depend on resolution)）

---

## 11. Template Delete

- Allows the deletion of templates cited on the page
- Delete the tick confirmation box and specify how many pages will be affected by the hint
- After deletion, all pages that refer to the template empty the template, enter"Template not confirmed"Status

---

## 12. Summary of entrances

| Access. | Location | Functions |
|------|------|------|
| Template Mode Selection | Home when creating a project | Select Single Template / Multiple Template Modes |
| Convert to Multiple Templates | DetailEditor Top Template Control Area | Upgrade single template to multiple templates (irreversible)） |
| Automatically match multipage templates | TemplateSetupPage Top | Automatically match the whole project batch |
| Auto-match template for single pages | Page Card Toolbar | Auto Matching One Page |
| Select Template | Page Card Toolbar | Manual Selection / Change Template |
| Manage Template Library | TemplateSetupPage | Upload, delete, mark, correct resolution |

---

## 13. Compatibility with existing functions

| Existing Functions | Alteration |
|---------|---------|
| Project level `template_image_path` | It is still available for bulk value in single template mode, but ultimately the truth falls in the page level field |
| Project level `template_style` | Idem, as a bulk grant source under a single template model, no longer as the truth of final validity |
| No template process | Unite As"Text Template Only". . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . |
| Template Reference for Picture Generation | Read Page Level First `template_asset_id`，Second Page Level `template_style_text` |

---

## 14. Matters decided（2026-06-22）

> Original PRD It’s here. 6 This review has been decided and settled on a case-by-case basis."Candidates → Selection → Reasons (including reasons for not choosing other candidates)）"。

### Decision-making 1 — TemplateSetupPage Is it necessary?

**Candidates：**
- A) Single and multiple templates must pass.
- B) Multiple templates must pass, single templates must skip completely (no rendering, no route)）
- C) Multiple templates must be passed, with a single template showing a simplified version (only a preview of the template as a confirmation page)）
- D) Both single and multiple templates are available (all done on page card entrances)）

**Selection：B**

**Rationale：**
- Select B：`feat/per-page-template` Branch Home Landed"Single/Multi-Model Button"，Templates for single template mode are already available Home It’s... `TemplateSelector` Select a batch value at a time，setup The page does not have any operational targets for single template users (team library management, automatic matching, page-by-page amendments); multiple templates do not exist setup The project template library is not managed anywhere. 7 It’s..."Full-stage two-way switch"，A single template automatically enters when users cut multiple templates TemplateSetupPage Route, no need to recreate project。
- No choice. A：Make single template user redundant to skip one page，UX Retrogression, forced."Manage Template Library"The concept is attached to all users.。
- No choice. C：For more details on decision-making 6——The maintenance and testing costs of the simplified version are the same as those of the functional version and are not cost-effective。
- No choice. D：Multiple template users could not find a template library management portal and no batch operation such as auto-matching, batch uploading, etc. was available.。

---

### Decision-making 2 — Template parsing failed downgrade policy

**Candidates：**
- A) The template for parsing failed is completely unavailable (removed or not shown from the template library)）
- B) Parsing failed templates can be manually selected and used to generate, but not automatically matching candidate pools；UI ID failed to provide a recyclable button
- C) Neither does the parse fail to participate in all functions without distinction (including automatic matching). fallback Text Bottom
- D) Parsing failed template entry"Manually complete resolution to the user"Mode, user has to fill in to use

**Selection：B**

**Rationale：**
- Select B：The core value of the template is"Picture Body + User Tags"，Parsing JSON Service only automatically matches this downstream; existing `generate_json()` Existing 3 We try again, and the real chance of failure is low, but... AI Short-term failure is amplified."Template not available"It’s the experience of disaster.；"Handy, no automatic match."It’s the smallest damage.。
- No choice. A：Punishing users instead of AI；Manual selection does not depend on resolution。
- No choice. C：Auto-matching is more misleading if you use unsolved templates.。
- No choice. D：Take it. AI The failure to convert to a user does not necessarily require the user ’ s ability or willingness to fill in 9 Field schema。

---

### Decision-making 3 — PDF Split Pages Achieved

**Candidates：**
- A) MVP Don’t do it. PDF Split Pages (only single chart uploads are supported）；v2 I’ll make it up.
- B) MVP Organisation PDF Split pages, build yourself `backend/services/pdf_image_service.py`，Use it. PyMuPDF (`fitz`) Render Every Page PNG
- C) MVP Organisation PDF Split Pages, Reuse `backend/services/file_parser_service.py` Existing MinerU Chain
- D) MVP Organisation PDF Open page, frontend PDF.js Page-by-page upload (back-end zero change)）

**Selection：B**

**Rationale：**
- Select B：Reliance in position——`PyMuPDF>=1.24.0`（`backend/pyproject.toml:39`）、`PyPDF2>=3.0.0`（L38）It’s all there.；`backend/controllers/project_controller.py` It’s already in there. `fitz.open() + page.get_pixmap()` . . . . . .；`task_manager.py` It’s... `ResourceLimiter` + `_commit_with_retry` + The staggered mission framework can be applied directly, with approximately the size of the project 8-10h；PDF It’s brandbooks, style. deck HF input format, delay will cause"Project Template Library"Yes. MVP To be a toy.。
- No choice. A：Reliance and reference codes are available. Delays will save less than much of the work. MVP It’s worth a lot of money.。
- No choice. C：`file_parser_service.py` Come on. MinerU Ripping**Contents**（Back Markdown + Embedded ), do not render page graphs; misstepped duties and introduced unnecessary externals API Dependence and network delay。
- No choice. D：Frontend PDF.js Poor performance in large documents; high DPI Render consumer browser memory; do it after cutting to the back end"Batch Upload"Dispatch, it’s more complicated.。

**Achieving contours (for engineering) spec Detailed）：**
- New `backend/services/pdf_image_service.py`：`pdf_to_page_images(pdf_path, output_dir, dpi=150) -> List[str]`
- `task_manager.py` Add `process_pdf_to_template_images_task`，Reuse `image_resource_limiter`
- `template_controller.py` Add `POST /api/projects/:projectId/template-assets/upload-pdf`，Back task_id Query to front wheel
- Defence： maximum number of pages 50，DPI Default 150，Rendering failed single page skips unblocked whole

---

### Decision-making 4 — Template Parsing prompt Design

**Candidates：**
- A) Continue `generate_json()` Mode——few-shot + markdown JSON Blocks + 3 Try again softly
- B) Anthropic provider Come on. `tool_use` Force schema，OpenAI/Gemini Continue A
- C) All provider Introduction of structured output（OpenAI `response_format=json_schema`、Gemini `response_schema`、Anthropic `tool_use`）
- D) Pure description None few-shot，All of it. prompt Text Constraint

**Selection：A**

**Rationale：**
- Select A：`prompts.py` Existing 7 Locations JSON Output prompt（L280/L413/L680/L815 It’s all in the same pattern. Production has been verified; templates are analyzed. 9 Field schema That’s right. outline、descriptions Simple; following the same infrastructure means error processing, retrying, re-use of logs, with the smallest amount of work。
- No choice. B：provider Behavior fork, test matrix double, single. provider Not much of a steady return.。
- No choice. C：OpenAI/Gemini Current provider It doesn’t support the original. schema，Retrofitting work loads, over provider Behavior is difficult.。
- No choice. D：9 Fields `text_regions[]`、`image_regions[]` This structified array doesn’t give the sample a steady output.。

**Elements of achievement：**
- prompt Embedded 2-3 A real template for the resolution sample. few-shot
- Write `get_template_analysis_prompt()` Present. `prompts.py`
- Yes. `ai_service.py` Add `analyze_template(image_path)`，Group `generate_with_image` + `generate_json`

---

### Decision-making 5 — Automatic Matching prompt Design

**Candidates：**
- A) Full one-time call, no defense.
- B) One-time full call + Threshold defence： pages ≤ 50 and templates ≤ 20 , which is called once in a while, the threshold is exceeded. 30 Page in Series
- C) Always in batches (each batch) 30 ”For stability at the expense of the global perspective”
- D) Template Side Embedding Prefilter (select per page first) Top-5 Templates, again LLM Platoon）
- E) Page-by-page independent call（N Page = N Recall）

**Selection：B**

**Rationale：**
- Select B：Actual calibration 50 Page + 10 Template ≈ 6K input tokens，Mainstream model（Gemini 32K、Claude 200K、GPT-4 128K）There’s plenty left.；`generate_descriptions_stream`（`prompts.py:615-677`）Full package of the equivalent level has been verified; threshold defence has blocked the extreme project, and only works on `ai_service.py` Riga’s branch logic.。
- No choice. A：Undefensible-to-extensive project.（>50 Page）token High cut-off risk and high cost of checking if failed。
- No choice. C：It’s normal. ≤ 50 Pages, batches allowing each match to lose the global context (the balance of the template distribution, the visual rhythm of the chapter) and the quality of the match to decline。
- No choice. D：Embedding It’s another infrastructure. / Vector services / Embedding Model），MVP Do not open; and templates ≤ 20 Time Top-5 Pre-filtered accuracy returns less than"Loss of global perspective"Losses。
- No choice. E：N Recall costs and delays are unacceptable and are lost"Cross-page coordination"Capability (not continuous with template) 5 It’s all on the page.）。

**Elements of achievement：**
- Write `get_template_auto_match_prompt(templates, page_summaries)` Present. `prompts.py`
- Yes. `ai_service.py` Add `auto_match_templates(project_id)`
- Enter field cropping： pass only every page title + 100 Word Description Summary + content density; templates are passed only `analysis_json` Key fields + `user_label`，`notes` Intercept to 200 Word
- Batch trigger： Pages > 50 or Templates > 20，Press 30 Pages

---

### Decision-making 6 — Single Template Mode TemplateSetupPage Simplified form

**Candidates：**
- A) Not at all. TemplateSetupPage，Pass directly by route (single template)：Home → OutlineEditor）
- B) Render simplified version (shows the selected template preview only) + "Next"button）
- C) Render full version (the template library management is also displayed, but all pages are locked to the same template）

**Selection：A**

**Rationale：**
- Select A：and decision-making 1 Accompany——The template for single template mode is in Home `TemplateSelector` Selected；setup The page-to-sole template users have no operational objective；`feat/per-page-template` Branch Home Existing `templateMode` Discrepancies, at almost zero cost。
- No choice. B：Simplicity page is noise. Slow down."Create Item→Edit Outline"main path; and simplified version/The full version of visual differences can easily be misconstrued by users."I put it in the wrong way."。
- No choice. C：The semantic of single template mode is"One selection, batch value"，Users should not see"Template Library"Concept; when the template library is seen by the user, multiple template capabilities are expected, leading to confusion in the semantics of the pattern。

**Routes achieved：**
- Home `initializeProject` Back，`templateMode === 'multi'` That’s right. navigate Present. `/project/:projectId/template-setup`
- Otherwise, it’s straight. navigate Present. `/project/:projectId/outline`

---

> **Decision-making date：2026-06-22**　Decision-making bases are available at： `~/.claude/plans/prd-unified-biscuit.md`。Page 3.2 Section on"Mode Toggle Rules"Revisions to decision-making 7。
