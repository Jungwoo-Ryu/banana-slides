# Develop interfaces for different templates per page

> Date of handover：2026-06-22<br>
> Function alias：per-page-template / Unified Page Level Template System<br>
> Current status： Yes PRD and frontend prototypes; backend durability, real generation links、AI Parsing & Matching Unrealised。

## 1. Where’s the information?

### 1.1 Original PRD

The original design information is in the compressed package of this download directory.：

```bash
tar -xOzf ~/Downloads/per-page-template.tar.gz per-page-template-pack/docs/prd-per-page-template.md
```

Compressive package structure：

```text
per-page-template-pack/
  docs/prd-per-page-template.md
  code/commits.txt
  code/changed-files.txt
  code/changes-vs-main.patch
  sessions/
```

Attention.：`code/changes-vs-main.patch` It’s from the old baseline. diff，It can blend into a lot of historical noises. When you really judge the difference between the old branch and the current branch, you use a remote branch. `origin/main` Three o’clock. diff Yes.。

### 1.2 Old realization branch

Remote Branch：

```bash
git fetch origin --prune
git show --no-patch --decorate --oneline origin/feat/per-page-template
git diff --name-status origin/main...origin/feat/per-page-template
```

Current Remote HEAD：

```text
8f940d4 origin/feat/per-page-template tmp commit
```

Old branch checked out by this machine. worktree：

```text
/Users/davidyang/banana-slides-per-page-template
```

It’s... worktree Current Track：

```text
feat/per-page-template -> origin/feat/per-page-template
```

### 1.3 The most relevant file of the old branch

Current relative `origin/main` That’s the main difference. 8 A file：

```text
frontend/src/components/preview/PageFineTuneDrawer.tsx
frontend/src/pages/SlidePreview.tsx
frontend/src/pages/Home.tsx
frontend/src/pages/DetailEditor.tsx
frontend/src/store/useProjectStore.ts
frontend/src/types/index.ts
frontend/e2e/fine-tune-drawer.spec.ts
frontend/e2e/drawer-screenshot.spec.ts
```

Focus.：

- `PageFineTuneDrawer.tsx`：Prototype of the right Page Precise drawer, including template library, template selection, description editing, additional field editing。
- `Home.tsx`：Select a single template when creating items / Multiple Templates。
- `useProjectStore.ts`：after creating the project, move `template_mode_${projectId}` Writing `localStorage`，It’s just temporary. mock。
- `types/index.ts`：It’s reserved. `TemplateAsset`、`TemplateMatchResult`、Front-end type of page-level template field, etc.。
- `fine-tune-drawer.spec.ts`：Verify drawers open, templates uploaded/Bind, describe editing endurance, hide template areas in single template mode。
- `drawer-screenshot.spec.ts`：Default width for manual visual check of drawers, drag width, screenshot。

## 2. Current spec What have you identified?

Existing PRD Product orientation and core concepts defined：

1. Upgrade from Project Level Line Template to Unified Page Level Template System”。
2. The bottom is always modeled by ” own template per page ” ; the single template is a batch value。
3. Template does not affect page description, only image generation and presentation styles。
4. The process is planned as：

```text
Home -> OutlineEditor -> DetailEditor -> TemplateSetupPage -> SlidePreview
```

5. Template Mode：
   - Single template mode： selection of templates at a time, batch application to all pages。
   - Multiple Template Mode： Independently manage photo and text templates per page。
   - Single templates can be upgraded to multiple templates; multiple templates cannot drop a single template。
6. “No Template is no longer a stand-alone mode and is grouped as ” Text-only Templates ””。
7. Two template slots per page：
   - `template_asset_id`：Reference to a picture template in the project template library。
   - `template_style_text`：Page-level text style description。
8. Project Template Library Model `project_template_assets`，Template assets can be reused by multiple pages, selecting up to one photo template per page。
9. New Pagesheet Schedule：
   - `template_asset_id`
   - `template_style_text`
   - `template_selection_source`
   - `template_match_reason`
   - `template_match_confidence`
10. TemplateSetupPage Responsible for template upload, template resolution, user tags, automatic matching, manual correction, template deletion。
11. The automatic match is the whole project. LLM Call, no page-by-page call。
12. When deleting the referenced template, all reference pages empty the template and enter unrecognized status。
13. Prefer page-level templates to recompatible project-level templates when pictures are generated。

## 3. Current spec We haven’t identified anything yet.

PRD Explicitly identified outstanding matters：

1. `TemplateSetupPage` Whether it is necessary and whether skipping direct access is permitted `SlidePreview`。
2. Template parsing failed downgrade policy： Whether the failed template is still manually selected。
3. PDF Dismantling page realization： reuse `file_parser_service.py`，Or do you want to add a dedicated resolution link?。
4. Template Parsing prompt Design, how to stabilize output fixes schema。
5. Automatic Matching prompt Design, especially in the context of the project token Limitation and cut-off strategies。
6. Single Template Mode `TemplateSetupPage` Simplified form： display a simplified version, or skip it directly。

There’s still no clear agreement at the engineering level.：

1. Backend API It’s... request/response schema。
2. Database migration and old projects backfill Policy。
3. When to write a project-level template batch to a page-level template field when creating an item。
4. How to transmit page-level image templates and text templates from the image generation link to existing ones AI provider。
5. A directory of files after template pictures are uploaded、URL Generating, Thumbnail Generation, Secure Verification。
6. Old front-end prototype. `localStorage` Whether or not the data are migrated; it is not recommended to migrate as old demo。
7. First edition MVP Whether to include AI Parsing, Automatic Matching、PDF unleashing pages; recommending not to include first edition。
8. Backend, Frontend、E2E The acceptance criteria have not been written yet. spec。

## 4. What have you done?

### 4.1 Product design

I’ve got one. PRD，Overwrite：

- Product positioning
- Page flow
- Template Mode
- Project Template Library
- Page-level template field
- TemplateSetupPage Duties
- Automatically match with single page
- Manual selection template
- Remove Template
- Compatibility policy with existing functionality
- Outstanding matters

This one. PRD It’s the most complete product information available.。

### 4.2 Frontend Prototype

The old branch has made an interactive front-end prototype.：

- First page selects the Unified Template / Multiple Templates”。
- `SlidePreview` It’s connected to the right ”page-sweet” drawer.。
- In multi-template mode, in drawer presentation：
  - Current Page Template Selection
  - Text Style Requirements
  - Project Template Library
  - Upload Template Pictures
  - Remove Template
  - Change Template
- The drawers always show.：
  - Current Page Description Edit
  - Add Field Edit
- The width of the drawer can be dragged and sustained.。
- Yes. E2E smoke tests Overwrite Prototype Basic Interactive。

### 4.3 Temporary storage mode

The old frontend prototype does not have backend support, use `localStorage` mock：

```text
template_mode_${projectId}
template_assets_${projectId}
page_template_assign_${projectId}
page_fine_tune_drawer_width
```

These are... demo Programme, not as final design。

### 4.4 Show environment on-line

Old branch worktree Has been started by the following port：

```text
frontend: http://localhost:3465
backend:  http://localhost:5465
```

screen Name：

```text
banana-per-page-frontend
banana-per-page-backend
```

If restart is needed, confirm port and `.env`：

```bash
cd /Users/davidyang/banana-slides-per-page-template
rg -n '^(BACKEND_PORT|FRONTEND_PORT)=' .env
lsof -iTCP:5465 -sTCP:LISTEN -n -P
lsof -iTCP:3465 -sTCP:LISTEN -n -P
```

## 5. What are you gonna do?

I don’t recommend it directly. merge Old branch. Old branch is old and old. tar Lee. patch There’s a lot of historical noise. `main` New branch, then reset by module/Remove。

### 5.1 Pre-engineering spec

Proposed addition of an additional project spec，For example：：

```text
docs/superpowers/specs/2026-06-22-per-page-template-backend-design.md
```

It has to be written.：

- MVP Scope
- Database Model
- API schema
- File Storage Policy
- Generate chain priority
- Frontend Replace localStorage Programme
- Test acceptance standards

Recommendations MVP Scope：

1. Enduring `template_mode`。
2. Project Template Library for Enduring。
3. Enduring Page Levels `template_asset_id` / `template_style_text`。
4. Read page-level templates when the picture is generated。
5. For front drawer read real API。

Suspended：

- AI Parsing Template
- Automatic Matching
- PDF Open Page Upload
- TemplateSetupPage Full New Page

### 5.2 Backend Data Model

Need new or adjusted：

- `projects.template_mode`
- `project_template_assets` Table
- `pages.template_asset_id`
- `pages.template_style_text`
- `pages.template_selection_source`
- `pages.template_match_reason`
- `pages.template_match_confidence`

Suggested constraints：

- `template_asset_id` External Key Pointer `project_template_assets.id`，Empty reference page while deleting template。
- `template_mode` Default as `single`。
- Keep project-level templates compatible when old items do not have a page-level template and do not force migration。

### 5.3 Backend API

First version of the recommendation API：

```text
GET    /api/projects/:projectId/template-assets
POST   /api/projects/:projectId/template-assets
PATCH  /api/projects/:projectId/template-assets/:assetId
DELETE /api/projects/:projectId/template-assets/:assetId

PATCH  /api/projects/:projectId/template-mode
PATCH  /api/projects/:projectId/pages/:pageId/template
```

First edition doesn’t necessarily need automatic matching. API。

After that.：

```text
POST /api/projects/:projectId/template-assets/:assetId/analyze
POST /api/projects/:projectId/templates/auto-match
POST /api/projects/:projectId/pages/:pageId/template/auto-match
```

### 5.4 Documentation and Thumbnails

Template upload requires landing：

- File Save Directory
- Picture Type Validation
- Filename secure processing
- Thumbnail Generation
- Returnable URL
- Remove the corresponding file and thumbnail when deleting the template

Use existing ones again. file/material/template Upload tool, but avoid mixing the user template with the project template asset into a table。

### 5.5 Image Generation Link

Template priority recommendation for generating pictures：

1. Current Page `template_asset_id` Corresponding pictures。
2. Current Page `template_style_text`。
3. Project level `template_image_path`。
4. Project level `template_style`。
5. No Templates。

Need to check and modify：

- `backend/services/task_manager.py`
- `backend/services/ai_service.py`
- `backend/services/prompts.py`
- Relevant image provider Enter Structure

The goal is to recreate a single page of pictures using its own template image and text style。

### 5.6 Frontend API

Replaces old prototype `templateLocalStore`：

- `listAssets` -> `GET template-assets`
- `saveAssets` -> Upload / PATCH / DELETE API
- `getAssignment` -> From `page` Field Read
- `setAssignment` -> `PATCH page template`
- `template_mode_${projectId}` -> `project.template_mode`

Keep old drawers UX It’s a special check.：

- Refresh status when Page Switches
- Automatically bind the current page after uploading the template
- Current Page After Delete Template UI Clear
- Templates still exist after refreshing pages
- Hide or simplify template areas in single template mode

### 5.7 Test

The project requires real validation, not just writing. mock。

Suggested Test Layer：

Backend Unit / Integration：

- Save when creating items `template_mode`
- Upload template assets and return URL
- Modify Template Tags
- Empty reference page while deleting template
- PATCH Page-level template field after reset GET The project is reminiscent.
- Picture Generation Task Read Page Level Template Priority

Frontend E2E：

- Select multiple templates to create items on the first page, preview page to show template areas。
- Upload template pictures, template cards appear。
- Select the template for the current page and select it after refreshing。
- Modify page-level text template and remain after refreshing。
- Delete the referenced template, empty the reference page template。
- Press the template area under single template mode spec Hide or simplify。

The real generation chain.：

- Run a real backend at least once and verify that the page-level template is sent into the production logic。
- If cost is high, small page items can be used, but they cannot be relied upon only mock。

## 6. Recommended order of implementation

1. New Recent `main` Branch, not direct. merge Old branch。
2. Write Project spec，Confirm. MVP does not contain AI Parsing/Automatic Matching/PDF Open Pages。
3. Backend migration + model。
4. Backend API。
5. Backend Test。
6. Access to generation links。
7. Transplant from old branch/Rewrite front drawer API Access。
8. E2E Overwrite Persistence and Refresh Retrospect。
9. Think about it again. TemplateSetupPage、AI Parsing, Automatic Matching。

## 7. Risks and care

- Old branches are older, not suitable for direct integration.。
- Old tar It’s... patch It’s not clean. It’s not straight.。
- The old front-end prototype keeps key data in place. `localStorage`，It’s perfect for you. demo。
- PRD The whole smart system is planned, but the first version better have a stable backend closure.。
- Automatic Matching and Template Resolution Dependence prompt Stability. We should do a single set of designs and real tests.。
- Delete templates, generate links, old project compatibility is the easiest place for data consistency problems。

## 8. Minimum acceptance calibration

The first edition can be accepted and accepted according to the following criteria：：

1. Users create multiple template items。
2. User upload at least two project templates。
3. User selects different templates for different pages。
4. User fills page-level text template for a page。
5. Template selection and text template still exist after refreshing page。
6. When reproducing a page, the backend actually reads the page template。
7. When a template is deleted, the page template field that refers to it is emptied。
8. The old process of single templates is not spoiled。
9. Backend test, frontend test、E2E It’s through.。

