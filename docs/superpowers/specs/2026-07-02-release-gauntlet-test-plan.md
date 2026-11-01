# Release Gauntlet：Pre-issuance automated test collection programme

> Objective： an order `npm run release:gauntlet`，Automatically discover most functional and experience problems after running，
> and generate clarity about the remaining risks that cannot be verified automatically《Residual risk reporting》Give it to the developers for a minimalized manual spot check.。

## 0. First Principle： Why"99％ Autocheckout"You can’t use a stack of tests.

One. bug It’s self-discovered. It has to meet both conditions.：

1. **Touche.（Reachability）**：Test execution path overwrites a problem state。
2. **Decision（Oracle）**：There’s an automated one."Yeah./Wrong."Criteria for judgement。

Traditional testing programme (under this project) unit + e2e）There’s a structural blind zone at both dimensions.：

- Touched blind zone： test only."Path the author thought of"。Real users are a little bit messy, they’re a little refreshed, they’re off the grid.、
  Open two tabs, upload strange files。
- The determination of the blind zone：Banana Slides Yes.**Generating AI Products**，Core output (show pictures) does not have the only correct answer。
  `expect(x).toBe(y)` I can’t judge."This page. PPT The text was cut off.""The contrast is too low to see."——
  And that’s exactly what users care about."Experience problems"。

So the core of this program is not"Write more examples"，It’s...**Press the certifier（Oracle）The strong and the weak divide the product.，
Each floor is equipped with the most powerful decorator it can use.**：

| Product Layer | Nature of the act | Best Available Oracle |
|---|---|---|
| API Contracts / DB / Task status machine / Export File Structure | Determination | Exact assertion、Schema Verify, Properties Test |
| Frontend UI Logical / Route / i18n / Status Management | Determination | e2e The assertion. + Console Zero. + Visual regression |
| Validity of user journeys (disorder operations, abnormal input, network failure)） | Semi-certainty | **Non-variant assertion**（Never white screen, never without hints, never silently fail.）+ Agent Explore |
| AI Production (format, readability, adhesive description)） | Probability | **VLM-as-Judge**（Visual model scores by score card） |
| Subjective aesthetics / Taste. | Subjective | No Auto Oracle → Enter residual risk report |

Critical insight.：**"Experience problems"Most of them can be transcribed into no variables.（invariant）**，So it becomes self-declarable.：

- 「Confusion Note Text」→ No variable： all visible files must be i18n Dictionary pairing exists（zh/en），
  and VLM Review the screenshot answers for each interface"Is there a file on this interface that confuses new users?？"
- 「Waiting without hint」→ No variable： any >800ms It’s... pending Network request period，
  must exist on the page loading Indicator elements（spinner/skeleton/progress）。This one can be written.
  Playwright Global hooks，**Hang on to All 70 Existing e2e Whitecovering**。
- 「It’s not responding.」→ No variable： any click Back 2s It has to happen inside. DOM Change, change of route or one of the network requests。
- 「Whitescreen/Crash」→ No variable： any moment console None uncaught error，root Element is not empty。

## 1. Overall structure：8 Streaming waterline（Release Gauntlet）

Press"Cheap run first, expensive run later.、fail-fast"Arrange。L0–L3 It’s a reinforcement of existing assets.，
L4–L7 It’s a new part of the real gap with the normal project.。

```
L0 Static defences（~2min）      → lint / tsc / py_compile / Reliance on audit / Reversibility of migration / i18n Integrity
L1 Units+Integration（~5min）     → Existing pytest + vitest（Completion Properties Test）
L2 Deeds against drifting（~3min）    → Backend OpenAPI schema ⇄ Frontend mock ⇄ True response, triangulation.
L3 Determination E2E（~15min）   → Existing 70 individual spec + Global non-variant hooks + Visual regression matrix
L4 Product validation（~10min）     → PPTX/PDF/Video/Edit Version PPTX Structure-level depth verification
L5 Real. AI Full Process（~25min）→ Existing ui-full-flow + provider Matrix + VLM Quality rating
L6 Agent Explore testing（~40min）→ Multiple personality. AI agent Driver Real Browser to Disruption/Exploration tests
L7 Disruption and escalation（~15min）   → Fault injection, co-production, old version data upgrade, environment matrix
→ Outputs《Publication of the report》+《Residual risk reporting》
```

Total duration ≈ 2 Hours（L5–L7 But it’s on the same side. ~1h）。Press CLAUDE.md Principles"I don’t care about the cost of testing."，
Real. API Projected call costs per call $3–8。

---

## 2. Detailed design of each layer

### L0 Static defence line (new) 3 Item）

Existing：flake8、eslint、`npm run build`。Add：

1. **`tsc --noEmit` Strict type checks**（build It doesn’t mean it’s clean.）。
2. **Migration reversibility test**：Empty library `alembic upgrade head` → `downgrade base` → Again. `upgrade head`；
   Again.**Previous release tag It’s... DB fixture** Direct upgrade（See L7）。
3. **i18n Complete Scan**：Scripts all over. `useT()` The Inline Dictionary. zh/en Type pairing、
   No emptiness, no residue. `TODO`/China-United Kingdom of Great Britain and Northern Ireland. i18n It’s a component-level connection. It’s the easiest to slip.。

### L1 Units + Properties Test

Existing test retention. Add **property-based testing**（Backend `hypothesis`）Call the core of certainty.：

- `file_parser_service`：Random tectonic damage/It’s huge./Empty/Not UTF-8 It’s... PDF/DOCX/MD，
  No Variables = Never leave the uncaptured anomaly, always return to a structural error。
- Task status machine（`task_manager`）：Random sequence of operations (creation)/Cancel/Convergence Finish），
  No Variables = The state can only move along the legal edge.，Task I’ll stay forever. pending Timeout。
- Export： Random Pages/Percentage/Shortchart Group → Export function successfully or give user-readable error。

### L2 Contract protection against drift (largest hidden risk under this project)）

Existing 70 individual e2e It’s used extensively. `page.route()` mock。**mock Drifting with Real Backend**It’s like this.
The most classic source of false negatives in the test system： the backend changed the field name，mock e2e It’s all green. It’s all real.。

Response (triangular coherence)）：

1. Backend flask Route Auto Export OpenAPI schema（`apispec` Or handwritten. schema It’s all right.）。
2. Write one. pytest：For each peer seed Data sending real requests, responding body use. schema Verify。
3. Write one. lint Script： Scan `frontend/e2e/**/*.spec.ts` All `page.route()` It’s...
   mock JSON，Use the same. schema Verify。**mock Do not match schema = Test Failed**。

Since then, schema It’s the only source of facts.。

### L3 Determination E2E：Global non-variant hook (highest value for money)）

It’s not a new example. It’s for you. `playwright.config.ts` Add Global fixture，Jean.**All available spec
While running the original claim, free of charge. §0 Listed experience not variable**：

```
- console error/warn Collector： Any uncaught error / React warning → Test failed
- Network listening device： any unexpected 4xx/5xx → Failed；>800ms pending None loading Elements → Failed
- Dead button detection： every time click Back 2s No feedback → Failed
- a11y Sweep it!（axe-core）：Serious level violations → Failed ( Contrast, None) label input box
  It’s in itself."Experience problems"）
```

Visual regression to**Matrix**：Existing `visual-regression.spec.ts` Expand
`{zh, en}` × `{desktop 1280, mobile 375}` × Key Pages（Home / Outline / Detail /
Preview / Settings / History），Baseline screenshot repository，diff Super-threshold is failure。
The mobile view is a blind zone that is completely uncovered by existing tests.（memory It’s written to avoid it. hover-only Interactive）。

### L4 Export product depth verification

Export is the final delivery that the user gets, one vote vetoes. seed Item
（`frontend/e2e/helpers/seed-project.ts` Supported exempt AI Execute all export paths，
And then...**Open file for internal intestation**，It’s not just an assertion. HTTP 200：

- **PPTX**：`python-pptx` Open → Same number of pages, same graphics per page, same page ratio as item settings、
  The file can be used LibreOffice headless Turn. PDF No error (approximation)"I can be. Office Open"Automation agents）。
- **Edit Version PPTX**：text box contents extracted against page description text to include; fonts/Location field is not empty。
- **PDF**：`pypdf` Check pages, page sizes, content flow per page。
- **Video**：`ffprobe` Validation duration >0、Video stream, audio stream, no damage frame.。

### L5 Real. AI Full Process + VLM Quality assessment (resolution"Generate Mass"Blind areas）

Existing nightly `ui-full-flow.spec.ts`（Real. Gemini）Based on：

1. **Provider Matrix**：gemini Run!；openai/vertex At least run to"Request for correct construction + I can parse.
   Recording Response for Real Format"（Playback with recording. Avoid multiple copies. API key Cost）。
2. **VLM-as-Judge**：A slide picture of each page generated by the entire process + Corresponds to page description, to visual model.
   （Gemini/Claude），Rating by fixed score card：

   ```
   Item by Item 0–2 min： text is intact / No Element Overlay / Contrast Readable /
   Content corresponds to description. / Layout Basic Alignment / No visible AI Hypocrisy (discretion, malformation icon)）
   Any one of them. 0 min → Page FAIL，A screenshot and rationale for the report
   ```

   Same model running. 3 A second majority vote to silence randomity."Human eye check-ups."Automation of core components。
3. **Interface case review**：Yeah. L3 Every key page cutout from the matrix, let’s VLM Answer!
   "Assuming you’re a first-time user, there’s no confusion, ambiguity or Chinese-British writing on this interface.？"
   —— Directly. CLAUDE.md It’s... UX Constraints #1。

### L6 Agent Explore testing (overrided)"The path no one thought of."）

Use it. Claude Agent SDK（or Claude Code headless + Playwright MCP）Start **5 Personality
agent**，They’re on their own. seed Free use of products in the environment 30 Minutes. The only test is...
L3 The global set of no variables (white screens)/Wrong./Dead button./No hint to wait）+ agent Your own subjective reports.：

| Personality | Behavioural Script Orientation |
|---|---|
| White Users | It’s only an interface tip, and it’s recorded when you can’t read it. |
| Acute | It’s crazy. It doesn’t wait. loading Just cut off the page, generate intermediate refreshing/Back |
| Destroyer. | Overlong Inputs、emoji/RTL Text、0 Page outline, upload 200MB Document, illegal document suffix |
| Double Users | Both tabs edit the same item simultaneously（SQLite It’s also a classic minefield.） |
| English Mobile Users | en locale + 375px A complete process of visualization. |

Agent The essence of exploration is...**Use it. LLM Common sense replaces the instincts of humans.**To expand the reach.。
Every one agent Output structured after completion findings（Screenshots + Reverted steps) , by a summary agent
Weighted, sequenced by severity, and**Automatically try Playwright Write minimum recurrence scripts**——
It’s a steady recovery. bug List, unrecoverable in-removable risk report marked as flaky Doubtful.。

### L7 Chaos, mixed hair and upgrade

1. **Fault injection.**（Playwright route + Backend failure switch）：
   - AI API Back 429/500/Timeout/Cut JSON → Confirm that the frontend has a user-readable error hint and can be retried；
   - Generate pictures to 50% Time kill Backend again. → Mission status can be restored or clearly failed, not frozen. pending；
   - Full disk (small capacity) tmpfs Mount uploads/）→ Export to give clear error。
2. **And pressurized.**：10 Co-generation of projects → ThreadPoolExecutor I’m not gonna die.、SQLite None
   `database is locked` Spill to user. Tasks all reach final.。
3. **Upgrade Test**：I’ll put one in the warehouse.**Previous release Real. DB + uploads fixture**，
   The new version starts directly on it. → Migration successfully, history projects can be opened, and editing continues for export。
   Every time. release And then it’s automatically refreshed by a script. fixture。
4. **Environment Matrix**：docker-compose、Dockerfile.allinone、The source code runs in three ways.
   Smoke (starting) → Health screening → Create Item → seed Export）。

---

## 3. Residual risk report. 1％ It’s an honest list.)

The last step of the current line is automatically generated. `release-report/RISK.md`，It’s not about words. It’s about words.**This time.
Run the actual overwhelm data extrapolation**：

1. **This unattainable list.**（Autostat： Unreal running provider×model Group, Uncovered
   Browser (checked only) Chromium；Safari/Firefox Undetected, undetected font differences in operating systems。
2. **No Auto Oracle Item**（Fixed + VLM Marked low faith entries）：
   - PPTX In reality. PowerPoint / WPS / Keynote Rendering level in
     （LibreOffice Conversion is a proxy indicator.）；
   - Aesthetic taste for slides（VLM It’s just a sentence."Wrong."，I can’t."Beautiful."）；
   - The voice nature of the video ads.；
   - Upstream AI API Future behavioral changes (neither green today nor green next week after the model is updated)）。
3. **Manual random check list（≤10 min）**：Specific actions generated by the two above, e.g.
   "Use it. PowerPoint Open release-artifacts/sample.pptx Go over it."
   "Look at it with your eyes. VLM Yes. 1 This is it. 3 Pageshot"。
4. **Flaky Zone of separation**：List of examples adopted after this retry——They’re the future. bug High-pregnancy zone。

---

## 4. Relationship to existing assets & Landing route

| Phase | Contents | Workload | Checking out gains |
|---|---|---|---|
| P1（Let’s do it first. It’s the highest price.） | L3 Global non-variant hooks + console/Network/loading Listen up to the current. 70 individual spec；L0 Three new；L4 Product Depth Verification | ~3 Jesus. | High： Existing case coverage × New Oracle |
| P2 | L2 Tripartite coherence of the compact；L1 Properties Test；L7 Upgrade/Combination Test | ~4 Jesus. | High： Extermination mock Drifting fake negatives |
| P3 | L5 VLM-as-Judge + provider matrices;visual regression matrices | ~3 Jesus. | Medium height： Generating quality is automatically determined for the first time |
| P4 | L6 Multiple personality. agent Explore + Auto-repeated script generation; residue risk report generator | ~5 Jesus. | Medium： Override Long End Path |

use a single entry point:：

```bash
npm run release:gauntlet          # Full，release I’ll run.
npm run release:gauntlet -- --fast  # L0–L4，Before day-to-day merger
```

CI Hanging： Existing `ci-test.yml` Don’t move.（PR Quick Check）；nightly Run! `--fast`；
Fight! release tag Run full time and attach two reports to it. GitHub Release。

## 5. An honest border statement.

- "Find out. 99% Problem"As**Approaching target.**Founded, not committed——The test can only prove it. bug Existence，
  It can’t prove it doesn’t exist.（Dijkstra）。The programme’s perjury indicators are：：**Number of escape defects after release**。
  Every defect of escape is attributed to it./This is a closed ring.
  （Not any one-off collection of examples) is the real acceptance system."Invincible."Part of。
- VLM Review and assessment agent Exploration is a probabilistic component. It’s a false positive.）——Number of votes cast by majority
  Automatically repeat script filters; also false negatives——Use residual risk report as a cover.。
- Cost rises with layers：L5–L6 There’s real in every run. API Cost, by item"I don’t care about the cost of testing."
  Principle design, but `--fast` The model guarantees zero extra costs for daily development。
