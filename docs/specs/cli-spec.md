# Banana Slides CLI Requirements specification（API Drive, close to full capacity.）

## 1. Objectives and non-objectives

### 1.1 Objective

1. Do not change backend API provided with batchable command line tools `banana-cli`。
2. with ”purity” HTTP API Organised as the only dependent border, not directly reuse the backend internal Python Operations module。
3. First edition provides high-level batch processing portals `run jobs`，And provide low-level commands to cover the main back-end capability area。
4. Support for non-challenges `X-Access-Code` Two existing backend modes。
5. Standardized machine-readable reports for outputs（JSON）and terminal summaries to meet batch tracking and failed retesting。

### 1.2 Non-target

1. Do not achieve new backend interfaces, fields or return structures。
2. Don’t do it. pip Publicly issued or single-document binary distribution, supported only in warehouses Python Package Run。
3. Do not modify existing Web Front-end process or front-end state model。
4. No direct-linking of databases introduced in the current period，CLI Passes Only HTTP。

## 2. Backend Capability Mapping Matrix（Endpoint -> CLI Suborder -> Phase）

### 2.1 Phase 1（Available Closed Rings + HF extensions）

| Methodology | Endpoint | CLI Suborder | Phase |
|---|---|---|---|
| `GET` | `/api/projects` | `banana-cli projects list` | P1 |
| `POST` | `/api/projects` | `banana-cli projects create` | P1 |
| `GET` | `/api/projects/{project_id}` | `banana-cli projects get` | P1 |
| `PUT` | `/api/projects/{project_id}` | `banana-cli projects update` | P1 |
| `DELETE` | `/api/projects/{project_id}` | `banana-cli projects delete` | P1 |
| `POST` | `/api/projects/{project_id}/generate/outline` | `banana-cli workflows outline` | P1 |
| `POST` | `/api/projects/{project_id}/generate/from-description` | `banana-cli workflows outline --from-description` | P1 |
| `POST` | `/api/projects/{project_id}/generate/descriptions` | `banana-cli workflows descriptions` | P1 |
| `POST` | `/api/projects/{project_id}/generate/images` | `banana-cli workflows images` | P1 |
| `POST` | `/api/projects/{project_id}/refine/outline` | `banana-cli workflows outline --refine` | P1 |
| `POST` | `/api/projects/{project_id}/refine/descriptions` | `banana-cli workflows descriptions --refine` | P1 |
| `GET` | `/api/projects/{project_id}/tasks/{task_id}` | `banana-cli tasks status` | P1 |
| `GET` | `/api/projects/{project_id}/tasks/{task_id}` | `banana-cli tasks wait` | P1 |
| `POST` | `/api/projects/{project_id}/pages` | `banana-cli pages create` | P1 |
| `PUT` | `/api/projects/{project_id}/pages/{page_id}` | `banana-cli pages update` | P1 |
| `DELETE` | `/api/projects/{project_id}/pages/{page_id}` | `banana-cli pages delete` | P1 |
| `PUT` | `/api/projects/{project_id}/pages/{page_id}/outline` | `banana-cli pages set-outline` | P1 |
| `PUT` | `/api/projects/{project_id}/pages/{page_id}/description` | `banana-cli pages set-description` | P1 |
| `POST` | `/api/projects/{project_id}/pages/{page_id}/generate/description` | `banana-cli pages gen-description` | P1 |
| `POST` | `/api/projects/{project_id}/pages/{page_id}/generate/image` | `banana-cli pages gen-image` | P1 |
| `POST` | `/api/projects/{project_id}/pages/{page_id}/edit/image` | `banana-cli pages edit-image` | P1 |
| `POST` | `/api/projects/{project_id}/template` | `banana-cli templates upload` | P1 |
| `DELETE` | `/api/projects/{project_id}/template` | `banana-cli templates delete` | P1 |
| `GET` | `/api/projects/{project_id}/export/pptx` | `banana-cli exports pptx` | P1 |
| `GET` | `/api/projects/{project_id}/export/pdf` | `banana-cli exports pdf` | P1 |
| `GET` | `/api/projects/{project_id}/export/images` | `banana-cli exports images` | P1 |
| `POST` | `/api/projects/{project_id}/export/editable-pptx` | `banana-cli exports editable-pptx` | P1 |
| `POST` | `/api/reference-files/upload` | `banana-cli refs upload` | P1 |
| `GET` | `/api/reference-files/project/{project_id}` | `banana-cli refs list` | P1 |
| `GET` | `/api/reference-files/{file_id}` | `banana-cli refs get` | P1 |
| `POST` | `/api/reference-files/{file_id}/parse` | `banana-cli refs parse` | P1 |
| `POST` | `/api/reference-files/{file_id}/associate` | `banana-cli refs associate` | P1 |
| `POST` | `/api/reference-files/{file_id}/dissociate` | `banana-cli refs dissociate` | P1 |
| `DELETE` | `/api/reference-files/{file_id}` | `banana-cli refs delete` | P1 |
| `GET` | `/api/projects/{project_id}/materials` | `banana-cli materials list --project-id` | P1 |
| `POST` | `/api/projects/{project_id}/materials/upload` | `banana-cli materials upload --project-id` | P1 |
| `POST` | `/api/projects/{project_id}/materials/generate` | `banana-cli materials generate --project-id` | P1 |
| `GET` | `/api/materials` | `banana-cli materials list --scope` | P1 |
| `POST` | `/api/materials/associate` | `banana-cli materials associate` | P1 |
| `DELETE` | `/api/materials/{material_id}` | `banana-cli materials delete` | P1 |

### 2.2 Phase 2（Completion close to full amount）

| Methodology | Endpoint | CLI Suborder | Phase |
|---|---|---|---|
| `POST` | `/api/projects/renovation` | `banana-cli renovation create` | P2 |
| `POST` | `/api/extract-style` | `banana-cli styles extract` | P2 |
| `GET` | `/api/projects/{project_id}/pages/{page_id}/image-versions` | `banana-cli pages versions` | P2 |
| `POST` | `/api/projects/{project_id}/pages/{page_id}/image-versions/{version_id}/set-current` | `banana-cli pages set-current` | P2 |
| `POST` | `/api/projects/{project_id}/pages/{page_id}/regenerate-renovation` | `banana-cli pages regenerate-renovation` | P2 |
| `GET` | `/api/settings` | `banana-cli settings get` | P2 |
| `PUT` | `/api/settings` | `banana-cli settings update` | P2 |
| `POST` | `/api/settings/reset` | `banana-cli settings reset` | P2 |
| `POST` | `/api/settings/verify` | `banana-cli settings verify` | P2 |
| `POST` | `/api/settings/tests/{test_name}` | `banana-cli settings test` | P2 |
| `GET` | `/api/settings/tests/{task_id}/status` | `banana-cli settings test-status` | P2 |
| `POST` | `/api/materials/upload` | `banana-cli materials upload --global` | P2 |
| `POST` | `/api/materials/download` | `banana-cli materials download` | P2 |
| `GET` | `/files/{project_id}/{type}/{filename}` | `banana-cli files fetch` | P2 |
| `GET` | `/files/materials/{filename}` | `banana-cli files fetch` | P2 |
| `GET` | `/files/user-templates/{template_id}/{filename}` | `banana-cli files fetch` | P2 |

## 3. CLI Command contract (parameters, input output, exit code)）

### 3.1 Command line main entrance

```bash
banana-cli [GLOBAL_OPTIONS] <domain> <action> [OPTIONS]
```

Global Parameters：

1. `--base-url <url>`：Default `http://localhost:5011`。
2. `--access-code <code>`：Auto-injection after entry `X-Access-Code` Request Header。
3. `--poll-interval <sec>`：Default `3`。
4. `--request-timeout <sec>`：Default `60`。
5. `--config <path>`：Profile Path。
6. `--json`：Output Machine Readable JSON。
7. `--verbose`：Output Request/Round Detail Log (do not print keys)）。

### 3.2 Top Command

```bash
banana-cli run jobs --file <jobs.jsonl|jobs.csv> --report <path> [--continue-on-error] [--timeout-sec N] [--state-file <path>] [--progress-interval-sec N]
banana-cli run monitor --state-file <path> [--watch] [--interval N]
banana-cli projects list|get|create|update|delete ...
banana-cli workflows outline|descriptions|images|full ...
banana-cli tasks status|wait --project-id <id> --task-id <id>
banana-cli pages create|update|delete|set-outline|set-description|gen-description|gen-image|edit-image|versions|set-current|regenerate-renovation ...
banana-cli templates upload|delete ...
banana-cli exports pptx|pdf|images|editable-pptx ...
banana-cli refs upload|list|get|parse|associate|dissociate|delete ...
banana-cli materials list|upload|generate|associate|download|delete ...
banana-cli settings get|update|reset|verify|test|test-status ...
banana-cli renovation create ...
banana-cli styles extract ...
banana-cli files fetch --url <download_url> --output <path>
```

### 3.3 High command contract.：`run jobs`

1. Read `JSONL/CSV` Task and pre-validation (field validity, absolute path existence of the file)）。
2. Task-by-task, default to continue and aggregate failed。
3. Support task level `policy.continue_on_error` Overwrite Global。
4. For each task record：`steps`、`tasks`、`artifacts`、`error`、`duration_sec`。
5. Support `--state-file` Run-state document： Ongoing writing in execution run/job/task Progress for external monitoring。
6. Support `--progress-interval-sec` Control terminal progress log flow。
7. Output terminal summary at the end of the command and written `--report` Assign JSON Documentation。

### 3.5 Control order contract.：`run monitor`

1. Read `run jobs --state-file` State of operation of output JSON。
2. Default Single Read Output Current Snapshot。
3. `--watch` Mode to Press `--interval` Periodically refresh until `status` Enter Completed State。
4. Global `--json` Available for output structured results (final snapshot)）。

### 3.4 Output and Exit Code

Exit code fixed：

1. `0`：All missions are successful.。
2. `2`：Partially failed (at least one success and at least one failure)）。
3. `1`：Fatal error (configuration error, non-resolveable input, failure to write report, etc.)）。

Output engagement：

1. Default Human Readable Abstracts。
2. `--json` Time output structured JSON（Single command response or run Summary）。
3. The error output format is unified to：`code/message/details`。

## 4. Batch Operations Format（JSONL Main Format + CSV Compatible Format）

### 4.1 JSONL Lord. Schema

One per line JSON Object：

```json
{
  "job_id": "optional-string",
  "job_type": "full_generation|export_only",
  "creation_type": "idea|outline|descriptions",
  "idea_prompt": "...",
  "outline_text": "...",
  "description_text": "...",
  "project_id": "required for export_only",
  "template_image_path": "/abs/path.png",
  "template_style": "text style",
  "extra_requirements": "optional",
  "language": "zh|en|ja|auto",
  "max_description_workers": 5,
  "max_image_workers": 8,
  "use_template": true,
  "reference_files": ["/abs/a.pdf"],
  "material_files": ["/abs/m1.png"],
  "export": {
    "formats": ["pptx", "pdf", "editable_pptx"],
    "filename_prefix": "demo",
    "page_ids": [],
    "editable_max_depth": 1,
    "editable_max_workers": 4
  },
  "policy": {
    "continue_on_error": true,
    "timeout_sec": 1800
  }
}
```

### 4.2 `job_type` Definition of conduct

1. `full_generation`：
   1. Create Item。
   2. Optional Update Item Fields：`template_style`、`extra_requirements`。
   3. Optional Template Uploading（`template_image_path`）。
   4. Select to upload and parse `reference_files`（Enter generation after completion of all）。
   5. Optional Uploads `material_files`。
   6. Generate Process：
      1. `creation_type=descriptions` Call first `/generate/from-description`。
      2. Remaining Calles `/generate/outline` -> `/generate/descriptions`（A walker.）。
      3. Call `/generate/images`（A walker.）。
   7. Press `export.formats` Export products。
2. `export_only`：
   1. Usage `project_id` Direct Export。
   2. Do not trigger creation and generation。

### 4.3 CSV Compatibility Schema

Header Fixed：

```text
job_id,job_type,creation_type,idea_prompt,outline_text,description_text,project_id,template_image_path,template_style,export_formats,options_json
```

Annotations：

1. `export_formats` Yes. `;` Separate value, e. g. `pptx;pdf;editable_pptx`。
2. Complex fields (e. g.) `policy/export/page_ids/reference_files/material_files`）Put it in. `options_json`。
3. Parsing rules： read the visible column first, then use it `options_json` Merge Overwrite。

### 4.4 Pre-validation Rules

1. `job_type` It must be filled and it must be filled. `full_generation|export_only`。
2. `export_only` Must provide `project_id`。
3. `full_generation` It has to be met.：
   1. `creation_type` Valid.。
   2. `idea` Yes. `idea_prompt`。
   3. `outline` Yes. `outline_text`。
   4. `descriptions` Yes. `description_text`。
4. The upload category field path must be absolute and the file exists。
5. `export.formats` Allow only：`pptx|pdf|images|editable_pptx`。

## 5. Configure and Accurate Models (configuration file, environment variable, priority)）

### 5.1 Configure source and priority

Priority (high) -> Low）：

1. CLI Parameters。
2. Environmental variables。
3. Profile。
4. Internal Defaults。

### 5.2 Profile

Default Path：

1. macOS/Linux：`${XDG_CONFIG_HOME:-~/.config}/banana-slides/cli.toml`
2. Windows：`%APPDATA%/banana-slides/cli.toml`

TOML Field：

```toml
base_url = "http://localhost:5011"
access_code = ""
poll_interval = 3
request_timeout = 60
continue_on_error = true
report_dir = "./reports"
```

### 5.3 Environmental variables

1. `BANANA_CLI_BASE_URL`
2. `BANANA_CLI_ACCESS_CODE`
3. `BANANA_CLI_POLL_INTERVAL`
4. `BANANA_CLI_REQUEST_TIMEOUT`
5. `BANANA_CLI_CONTINUE_ON_ERROR`

### 5.4 Secrecy rules

1. If `access_code` Non-empty, all. `/api/*` Request AutoAdd `X-Access-Code`。
2. `/files/*` Download Request Not Attached `X-Access-Code`（Backend is currently not required）。
3. Not supported Bearer Token（Not for the current period）。

## 6. Error model, retry and overtime policy

### 6.1 Error Category

1. `CONFIG_ERROR`：Configuration Invalid、URL Illegal, time-out arguments illegal。
2. `INPUT_ERROR`：Job field missing, file path non-existent、CSV/JSONL Parsing failed。
3. `HTTP_ERROR`：Backend Backend Backend Backend 2xx。
4. `TASK_FAILED`：The staggered task state is： `FAILED`。
5. `TASK_TIMEOUT`：Interrogation timeout。
6. `IO_ERROR`：Report file failed to write, download failed。

### 6.2 Retry Policy

1. Yeah. `GET` Request to enable automatic retry： maximum `3` Once, retreat. `1s/2s/4s`。
2. Yeah. `POST/PUT/DELETE` Default does not automatically retry (avoid side effects such as non-single)）。
3. Network error or `5xx` Try again.；`4xx` Direct Failure。
4. `run jobs` Failed processing is based on mission strategy：
   1. `continue_on_error=true`：Record failure to continue follow-up mission。
   2. `continue_on_error=false`：Termination of the entire mission immediately after failure of the current mission run。

### 6.3 Timeout Policy

1. Request Timeout：`request_timeout`（Default 60 sec）。
2. Task rotation timed out.：
   1. Command Arguments `--timeout-sec` > job `policy.timeout_sec` > Default `1800` sec。
3. `tasks wait` Back after timeout. `TASK_TIMEOUT`。

### 6.4 Job Rotation Calculator

Query Target：

```text
GET /api/projects/{project_id}/tasks/{task_id}
```

Decision：

1. `status=COMPLETED`：End successfully。
2. `status=FAILED`：End of failure. Error message from `error_message`。
3. Timeout： Return failed and write to report。

## 7. Phased implementation programme（Phase 1/Phase 2）

### 7.1 Phase 1

Scope：

1. `run jobs` Support `full_generation` and `export_only`。
2. Project, task, template, full number of export commands。
3. Common operation of reference files and materials (uploading)/List/Association/Delete）。
4. Page Basic Editor and Single Page Generation Command。

Implementation structure (in warehouse) Python Package）：

```text
cli/banana_cli/
  __init__.py
  __main__.py
  app.py
  config.py
  errors.py
  http_client.py
  models.py
  reporter.py
  jobs/
    loader.py
    runner.py
    workflow.py
  commands/
    run.py
    projects.py
    workflows.py
    tasks.py
    pages.py
    templates.py
    exports.py
    refs.py
    materials.py
```

Technical stack constraints：

1. Command Frame：`argparse`（Standard library）。
2. HTTP：`httpx`（Sync client）。
3. Data Model：`pydantic`（For Operations and Report Validation）。

### 7.2 Phase 2

Scope：

1. `renovation create`、`styles extract`。
2. Page Version Command（`versions`/`set-current`）Rebirth with Refurbishment Page。
3. `settings test` and `settings test-status`。
4. Material Download Packed with `files fetch`。

Completion criteria：

1. CLI Map coverage achieved >=90% Common backends endpoint。
2. Batch/Single commands can be used in a stable way.。

## 8. Tests and acceptance standards

### 8.1 Test Level

1. Unit Test：
   1. Job Parsing（JSONL/CSV）。
   2. Configure Priority Merge。
   3. Error mapping and exit code。
2. Integrated testing（Mock HTTP）：
   1. `run jobs` Process organization。
   2. Task Inquiries。
   3. Structure of reporting products。
3. Real backend connection test：
   1. Alignment with Existing `backend/tests/integration/test_api_full_flow.py` Main link。
   2. Verify Access Code Switch both modes。

### 8.2 It’s gonna take place.

1. Enter Validation：
   1. Fields Missing。
   2. Path is illegal。
   3. CSV/JSONL Structure error。
2. Batch Failed Policy：
   1. Default Continue。
   2. Task level fail-fast Overwrite。
3. Step-by-step mission：
   1. Description Generation。
   2. Picture Generation。
   3. Editable Export。
4. Export links：
   1. `pptx`。
   2. `pdf`。
   3. `images`。
   4. `editable_pptx`。
5. Reference documents and materials：
   1. Upload。
   2. Parsing Trigger and Status Track。
   3. Association and Delete。
6. Coherence of reporting：
   1. Terminal statistics。
   2. JSON `totals/jobs` Unanimously。

### 8.3 Acceptance and inspection standards

1. Batch 10 Full report and correct exit code after operation。
2. Failure of single task does not affect subsequent task (default mode)）。
3. `export_only` Stable output downloads on existing items URL。
4. Yes. `ACCESS_CODE` All commands are accessible when open `/api/*`。

## 9. Risk and Rollback Policy

### 9.1 Main risks

1. Back-end heretic missions are time-consuming and volatile, leading to excessive lead times.。
2. Large uploading of files leads to network time overruns。
3. Non-single interfacing triggers over and over again under network shaking。
4. High failure rate due to poor quality of different job inputs。

### 9.2 Risk control

1. Harmonize timeout configuration and support task-level coverage。
2. Just right. `GET` Automatically retry, write operation default not retry。
3. Prevalidation of file paths and required fields, failure as soon as possible。
4. Records in reports step It’s a failure. It’s easy to run.。

### 9.3 Rollback Policy

1. CLI Only add files and portals without changing backend protocols and can be removed at any time CLI Directory Roll Back。
2. If Phase 2 It’s too risky. Hold on. Phase 1 Stabilize branches and freeze new commands。
3. Directly downgraded to low-scale orders manually in case of online operation anomaly.。

## 10. Appendix (example operational document) + Example report JSON）

### 10.1 Example：：`full_generation` JSONL Okay.

```json
{"job_id":"job-ai-001","job_type":"full_generation","creation_type":"idea","idea_prompt":"Generate a question AI Agent Engineering practice 6 Presentation","template_image_path":"/Users/chenzixin/projects/banana-slides/assets/test_img.png","template_style":"Technology, deep blues, high information density.","extra_requirements":"Maintaining title readability per page, roughly proportional to text 6:4","language":"zh","max_description_workers":5,"max_image_workers":6,"use_template":true,"reference_files":["/Users/chenzixin/projects/banana-slides/docs/quickstart.mdx"],"material_files":[],"export":{"formats":["pptx","pdf","editable_pptx"],"filename_prefix":"ai-agent-practice","page_ids":[],"editable_max_depth":1,"editable_max_workers":4},"policy":{"continue_on_error":true,"timeout_sec":1800}}
```

### 10.2 Example： Final report JSON

```json
{
  "run_id": "37f00fd8-3c3f-4b3f-9dfa-d4f6f3344c19",
  "started_at": "2026-02-28T10:00:00Z",
  "finished_at": "2026-02-28T10:18:24Z",
  "base_url": "http://localhost:5011",
  "totals": {
    "total": 2,
    "success": 1,
    "failed": 1
  },
  "jobs": [
    {
      "job_id": "job-ai-001",
      "status": "SUCCESS",
      "project_id": "9f2e8d1d-becf-4a58-8fc7-3c3f0b2f3e4b",
      "tasks": [
        {"task_id": "70f8c7ee-2eb0-4ce4-9f85-4b3ace3f8ef2", "type": "GENERATE_DESCRIPTIONS", "status": "COMPLETED"},
        {"task_id": "7b5cb67e-95f6-4b2a-8f1b-e14e429d15eb", "type": "GENERATE_IMAGES", "status": "COMPLETED"},
        {"task_id": "8de44d14-e42a-4fd4-b1a7-9c0bf4f18adc", "type": "EXPORT_EDITABLE_PPTX", "status": "COMPLETED"}
      ],
      "artifacts": [
        {"format": "pptx", "download_url": "http://localhost:5011/files/9f2e8d1d-becf-4a58-8fc7-3c3f0b2f3e4b/exports/ai-agent-practice.pptx"},
        {"format": "pdf", "download_url": "http://localhost:5011/files/9f2e8d1d-becf-4a58-8fc7-3c3f0b2f3e4b/exports/ai-agent-practice.pdf"},
        {"format": "editable_pptx", "download_url": "http://localhost:5011/files/9f2e8d1d-becf-4a58-8fc7-3c3f0b2f3e4b/exports/ai-agent-practice_editable.pptx"}
      ],
      "error": {"code": null, "message": null},
      "duration_sec": 684
    },
    {
      "job_id": "job-export-002",
      "status": "FAILED",
      "project_id": "missing-project-id",
      "tasks": [],
      "artifacts": [],
      "error": {"code": "HTTP_ERROR", "message": "Project not found"},
      "duration_sec": 2
    }
  ]
}
```

## Phase 1/Phase 2 Receiving and Inspection Checklist

### Phase 1

- [ ] `run jobs` Support `full_generation` and `export_only`。
- [ ] Mission report JSON Output matches this one. spec Report of the Secretary-General schema。
- [ ] Item/Tasks/Template/Export command available。
- [ ] `refs` and `materials` Common commands are available。
- [ ] Page Basic Editor and Single Page Generation Commands Available。
- [ ] Default ”Continue and Summarize” policy effective。
- [ ] Exit Code `0/1/2` Behavior meets definition。

### Phase 2

- [ ] `renovation create` and `styles extract` Available。
- [ ] Page Version `versions`/`set-current` Available。
- [ ] `settings test` and `settings test-status` Available。
- [ ] Text Downloads and `files fetch` Available。
- [ ] Map coverage achieved >=90% Common endpoint。
