# Banana Slides Recommendations for product improvement（2026-07-04）

Based on the code structure (back-to-back module, file size)）、README/Research on road maps, application screenshots (front page, preview page, etc.) from functional, aesthetic, user experience, technical options, each of their four dimensions 5 One of the most worthwhile recommendations。

**Overall judgement**：Product functionality is already wide (generation, page-by-page template, material toolbox, editable export, speaking video)、CLI），The currently shortboard is not in place"It’s not enough."，And the certainty of the generation process/Controllability, waiting experience, and supporting code structures that continue to evolve。

## Summary of recommendations

| Dimensions | Recommendations | Elements and proceeds |
|---|---|---|
| Functions | Online Presentation + Share Link | Full-screen play, page flip, remarks on speeches + Read-only Sharing URL（Reuse AccessCodeGuard Access code mechanism; completion"After Generating"It’s a closed ring. It’s the most powerful. |
| Functions | Data Chart Identification Render | Test the data in the description, use ECharts/matplotlib Rendering real charts and synthesizing them into pages, root. AI It’s a hard wound that’s been scribbleded. That’s right. NotebookLM The difference in the substance of the competition. |
| Functions | Multi-page Comparison Generation | Once Generate 2–4 A list of candidates to select.（page_image_version Model basis is already in place."Generate→Unsatisfactory→Again."Looping |
| Functions | Brand suite（Brand Kit） | logo/Main colour/Font preference settling to project level/Global assets, auto-injecting biographic hints; existing text style templates draw upwards |
| Functions | Agent Drafter Mode | Read all drafts→Note that style is not consistent/Organisation/Logical Fault→One-key repair; reuse of quality control model infrastructure, compared to open agent It’s going to land faster. |
| The aesthetic. | Preview Page Topbar Group Noise Reduction | Home Page/Back/Item Settings/Change Template/Material generation/Previous/Refresh/Export squeeze in line, press"Navigation \| Creation \| Output"Group and lower minor items |
| The aesthetic. | Design token System + Dark Mode | Brand yellow and grade colour. Tailwind theme token（primary/surface/danger），Slightly supports dark colour mode (dark slides contrast to sharp eyes in white bottom interfaces)） |
| The aesthetic. | Unified waiting for action | As Existing ShimmerOverlay Expand to all waiting slots for standard（shimmer + Progress, replace fragmentation. spinner |
| The aesthetic. | Thumbnail Bar Status Unified Language | "Completed/Cover"Labels, Yellow Box Selection, Multiple Selection checkbox Three sets of visual languages coexist, one set. badge System |
| The aesthetic. | Empty state and export ritual sense | Material Centre/History/Export empty panel with illustrations + guiding actions;exporting result cards with preview thumbnails instead of normal toast |
| User Experience | Page-by-page Real-Time Progress Panel | Show Queue Every Page on Batch Generation/Generating/Failure status and projected remaining time, and failure pages can be retried separately——User’s longest-staying, current-weakest link |
| User Experience | Cost transparency | Show the number of estimated calls before generation/Cost, when generated, show actual consumption to avoid billing shock（nano banana pro Higher unit price，README Self-introduced） |
| User Experience | Error InfoTalk | Limited flow/Insufficient balance/Timeout AI Interface error map as actionable hint（"We’re out of range.→To charge./Switch. provider"），I don’t just pass through the original. |
| User Experience | First Use of Guides | Unconfigured API Key The new user currently fails at the time of generation and should be tested on the front page and given a visible view"3 Step Configuration"Guidance (reusable) HelpModal Contents） |
| User Experience | Keyboard Shortcuts + Set Search | Preview Page ←/→ Turn page、E Edit、R regenerated;setting pages with search boxes + Group anchors（Settings There are so many configurations that it’s hard to find deep options.） |
| Technical programme | Split mega files | SlidePreview.tsx 3192 Okay.、Settings.tsx 2121 Okay.、task_manager.py 2751 Okay.、project_controller.py 63K——The cost of all subsequent changes continues to rise if not removed |
| Technical programme | Endurance of mandates + SSE Send | Task It’s on the record. SQLite But it’s an execution. ThreadPoolExecutor RAM, restart or discard; resume on startup in-progress Tasks + SSE Replace the round and support the progress panel |
| Technical programme | prompts.py Externalize | 66K Move hint to YAML/Jinja Template file, version management, A/B、Easy for communities to contribute, no more contamination of hints. Python diff |
| Technical programme | Front-end route by-level code split | React.lazy Split by Page（Settings、SlidePreview Both. 100K+ Source) First Screen Only Home，Improvement in the road map"Partially completed"Load speed |
| Technical programme | API Type of contract | Backend Out OpenAPI schema，Front-end Generation TS Type, elimination 250K+ controller Align code to front-end fields with human meat |

## Cross-dimensional priority (sorted if required)）

1. **Page-by-page Real-Time Progress Panel + Endurance of mandates + SSE**（User Experience × Technical programme）——Three sides of the same project to fix the most painful waiting experience.。
2. **Split mega files**——"Make everything else cheaper."Land-based investments。
3. **Online Presentation + Share Link**——Dissemination and retention leverage highest, low technology cost。
4. **Data Chart Identification Render**——At the heart of the difference in the competition。
5. **Cost transparency + Wrong people.**——Small workload, deciding directly on the retention of new users after their first failure。
