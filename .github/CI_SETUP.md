# CI/CD Profile Description

Use of this project GitHub Actions Automation CI/CD，Organisation**Light Inspection**and**Full Test**Two levels。

## 📋 CI Overview of the structure

### 🚀 Light Inspection - PR Quick Feedback
**Trigger Time**: Submit PR Autorun when<br>
**Time-consuming**: 2-5 min<br>
**Workstream**: `.github/workflows/pr-quick-check.yml`

Organisation：
- ✅ Code Syntax Check（flake8, ESLint）
- ✅ Code Format Check（black, prettier）
- ✅ TypeScript Build Check
- ✅ Back-end smoke testing (health check-ups)）
- ✅ PR Auto Comment

### 🎯 Full Test - Full Authentication
**Trigger Time**:
1. **PR Add`ready-for-test`When tabing** 👈 Recommended Method
2. Direct Push Present.`main`or`develop`Branch (not passed) PR）

**Attention.**：PR After Merge**I won’t.**Run complete testing again to avoid waste of resources

**Time-consuming**: 15-30 min<br>
**Workstream**: `.github/workflows/ci-test.yml`

Organisation：
- ✅ Backend Unit Test（pytest + coverage）
- ✅ Backend integration test (use) mock AI）
- ✅ Front-end Test（Vitest + coverage）
- ✅ Docker Environmental test (container construction, start-up, health check)）
- ✅ **E2E Test (from creation to export) PPT）**
  - It needs to be real. Google Gemini API key
  - Test complete. AI Generate Process
  - If Unconfigured API key，Automatically skip and show instructions
- ✅ Security scan (dependent on gap checking)）

---

## 🔧 Configure Steps

### 1. Configuration GitHub Secrets（Required）

To run the whole thing. E2E Test (includes real) AI Generate) , need to configure below Secrets：

#### Steps：
1. Enter GitHub Repository Page
2. Click `Settings` → `Secrets and variables` → `Actions`
3. Click `New repository secret`
4. Add the following Secret：

| Secret Name | Required | Annotations | Access Mode |
|-----------|------|------|---------|
| `GOOGLE_API_KEY` | ✅ Required | Google Gemini API Key (for completeness) E2E Test） | [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `OPENAI_API_KEY` | ⚪ Optional | OpenAI API Key (for integration testing to verify compatibility)） | [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `SECRET_KEY` | ⚪ Optional | Flask Applying key (Property Environment Recommended Configuration)） | Randomly generated, suggested for use：`python -c "import secrets; print(secrets.token_hex(32))"` |
| `MINERU_TOKEN` | ⚪ Optional | MinerU Services Token（If used MinerU Parsing） | From MinerU Access to services |

**About E2E Test Policy**：
- 💡 **Single E2E Test**：Usage Gemini Format test complete process (create)→Outline→Description→Image→Export）
- 💰 **Cost optimization**：Run the whole thing once only E2E，Duplication of testing
- ⚠️ **Conditional Run**：It’s only real. `GOOGLE_API_KEY` Timerun

**Attention.**：
- ⚠️ **No Configuration `GOOGLE_API_KEY` Time，E2E The test will skip.**
- ✅ Other tests (units, integration)、Docker）Still running, covering most functions
- 💰 Real. API Quotas will be consumed by the call $0.01-0.05/(ii) It is recommended to use a test-specific account number
- 🔧 CI It’ll automatically... Secrets Replace to `.env` Placeholder for the file

**CI How? Secrets**：

CI The configuration will automatically handle the following logic：：

1. **Copy`.env.example`Present.`.env`**（Keep all default configurations）
2. **Automatically detect and replace Secrets**：
   - If... GitHub Secrets has a certain configuration in it Secret → Auto Replace`.env`The corresponding placeholder
   - If No Configuration → Hold`.env.example`Default value in

**Supported Secrets List**：

CI The configuration will automatically detect and replace the following： Secrets（If it’s configured.）：

- ✅ `GOOGLE_API_KEY` - Required, if not configured`mock-api-key`
- ⚪ `OPENAI_API_KEY` - Optional, replace if configured
- ⚪ `SECRET_KEY` - Optional, Production Environment Recommended Configuration
- ⚪ `MINERU_TOKEN` - optional, if used MinerU Service Configuration

**Add New Secret Support**：

If you need to support other configurations Secret Replace, just in`.github/workflows/ci-test.yml`Adds the corresponding check logic：

```yaml
# Yes."Set Environmental Variables"Add in Step
if [ -n "${{ secrets.YOUR_NEW_SECRET }}" ]; then
  sed -i '/^YOUR_ENV_VAR=/s/placeholder/${{ secrets.YOUR_NEW_SECRET }}/' .env
  echo "✓ Replaced YOUR_ENV_VAR"
fi
```

### 2. （Optional) Configuration CodeCov

If you need code coverage reports and badges,：

1. Visits [codecov.io](https://codecov.io)
2. Association GitHub Account number and authorization of warehouse
3. Access Upload Token（It’s usually not necessary. It’s open to automatic identification.）
4. Add if manual configuration is required Secret：`CODECOV_TOKEN`

---

## 🏷️ How to trigger it? Full Test

### Methodology 1：PR Add Tab Trigger（✅ Recommendations）

♪ When you think PR I’m ready for a full test.：

```bash
# Yes. PR Page right, click "Labels"
# Add "ready-for-test" Label
```

This triggers the complete test package immediately, including：
- ✅ All units and integration tests
- ✅ Docker Environmental testing
- ✅ **E2E Test (if real is configured) API key）**

**Once the test is complete, it’s fine to merge directly! The test will not be repeated after merging.。**

**E2E Test Note**：
- If it’s configured, `GOOGLE_API_KEY`：Run Full E2E（Extra 10-15 min）
- If not configured： Skip E2E，Show friendly statements (other tests have covered most functions)）

### Methodology 2：Manual Trigger（✅ Add）

Yes. GitHub Actions Page Manual Run Full Test：

1. Enter repository page
2. Click **Actions** Label
3. Select on the left **Full Test Suite**
4. Click on the right **Run workflow** button
5. Select branch (usually)`main`or`develop`）
6. Click **Run workflow**

**Apply scene**：
- ✅ Trying to verify the code at any time.
- ✅ Debug CI Problem
- ✅ Authentication main Current status of branch

### Methodology 3：Direct Push Present. main

If you just... push Present.`main`or`develop`Branch (not passed) PR），You run the full test automatically.。

**Attention.**：
- ⚠️ **PR The merger won’t trigger. Full Test**（Avoidance of duplication）
- ✅ Make sure. PR Passed Before Merge`ready-for-test`Test
- 🔒 Suggest to enable branch protection in warehouse settings, request`ready-for-test`The status can only be merged.

---

## 🔒 Recommendation： Enable branch protection rules

To ensure all PR It’s been fully tested before the merger. It’s recommended. GitHub Branch protection：

### Configure Steps

1. Into the warehouse. → `Settings` → `Branches`
2. Yes. `Branch protection rules` Click Down `Add rule`
3. The configuration is as follows：：
   - **Branch name pattern**: `main`
   - ✅ **Require status checks to pass before merging**
     - Search and Check `Backend Unit Tests`（or other critical tests）
   - ✅ **Require branches to be up to date before merging**
   - Optional：**Require pull request reviews before merging**

### Effects

Configured，PR Merge only if the following conditions are met：
- ✅ Light Check pass (automated running)）
- ✅ Full Test passed (passed)`ready-for-test`Tag Trigger）
- ✅ Code review Passed (if enabled)）

This way we can completely avoid untested code entry.`main`Branch！

---

## 🧪 Test file description

### Light Check Test
- **Frontend Lint**: `frontend/src/**/*.{ts,tsx}`
- **Backend Syntax：**: `backend/**/*.py`
- **Smoke test.**: Start backend and check`/health`Peer

### Full Test File
```
backend/tests/
├── unit/              # Backend Unit Test
│   ├── test_ai_service.py
│   ├── test_file_service.py
│   └── ...
├── integration/       # Backend Integration Test
│   ├── test_api.py
│   └── ...

frontend/src/
├── **/*.test.tsx     # Front-end component testing
└── **/*.spec.tsx     # Front-end functionality test

e2e/
├── home.spec.ts           # Home Page UI Test
├── create-ppt.spec.ts     # PPT Create Basic Test
└── full-flow.spec.ts      # 🎯 Full process test (creation)→Outline→Description→Image→Export）
```

---

## 📊 Test Results View

### CI Status check
- PR At the bottom of the page all check status will be shown
- Click `Details` View Detailed Log
- Light The checkup will be... PR Automatically publish results in comments

### Test reports and coverage
- **Code coverage**: Automatically upload to CodeCov（If Configure）
- **E2E Test report**: If you fail, it’s passed. Playwright Reports and screenshots
  - Yes. Actions Page → Corresponding workflow run → `Artifacts` Download
  - `playwright-report`: HTML Test report
  - `playwright-screenshots`: Screenshots and videos of failure

### View Log
```bash
# Local View Actions Log
gh run list
gh run view <run-id> --log
```

---

## 🚨 Common problems

### Q1: E2E Test timeout failed
**Reason**: AI It takes longer to generate<br>
**Solve**:
- Inspection API key Validity
- Inspection API Exhaustion of quotas
- Local run test validation：`npx playwright test full-flow.spec.ts`

### Q2: Docker Test failed
**Reason**: Container start timeout or port conflict<br>
**Solve**:
- Inspection`docker-compose.yml`Configuration
- View container log（CI Displays automatically when a failure occurs）
- Local Test：`./scripts/test_docker_environment.sh`

### Q3: Front-end construction failed
**Reason**: TypeScript Type error or dependency issue<br>
**Solve**:
- Run locally：`cd frontend && npm run build:check`
- Inspection`frontend/package.json`dependency version
- Ensure`package-lock.json`Submitted

### Q4: "ready-for-test"Label does not trigger test
**Reason**: Workflow Permission or configuration issues<br>
**Solve**:
- Confirm that label names are fully matched (lowcases, hyphens)）
- Check the warehouse. Settings → Actions → General → Workflow permissions
- View Actions Page confirmation workflow Whether to be triggered

---

## 📝 Local Test

### 🚀 Fast start.

```bash
# Light Inspection（2-3 min）- Quick Check Before Submission
./scripts/run-local-ci.sh light

# Full Test（10-20 min）- PR Full Test Before Merge
./scripts/run-local-ci.sh full
```

### 🔧 Pre-dependent

```bash
# Python Environment (>= 3.10)
python3 --version

# Node.js Environment (>= 18)
node --version

# UV Package Manager
curl -LsSf https://astral.sh/uv/install.sh | sh

# Docker
docker --version
docker compose --version

# Installation Dependence
uv sync --extra test
cd frontend && npm ci
npx playwright install --with-deps chromium
```

### 🧪 Run Specific Tests

```bash
# Backend Unit Test
cd backend
uv run pytest tests/unit -v --cov=. --cov-report=html

# Front-end Test
cd frontend
npm test -- --coverage

# E2E Testing (need to be real) API key）
cp .env.example .env  # Edit.env Fill in Real API Key
docker compose up -d
npx playwright test full-flow.spec.ts

# Docker Environmental testing
./scripts/test_docker_environment.sh
```

### 🐛 Debug failed test

```bash
# E2E UI Mode debugging
npx playwright test --ui

# Backend Debug Mode
cd backend
uv run pytest tests/unit/test_xxx.py --pdb

# View Docker Log
docker compose logs backend
docker compose logs frontend
```

---

## 🎯 Best practices

### Development process recommendations

1. **Development phase**：
   - Frequent submission of minor changes
   - Dependency Light Check for quick feedback
   - Rehabilitation lint And build error

2. **Once functionality is completed**：
   - Autometric Main Functions
   - Run local test packages
   - Submit PR

3. **Prepare to merge before**：
   - Add`ready-for-test`Label 👈 **Key steps**
   - Wait. Full Test passed.
   - Code review Consolidated after adoption
   - After Merge**Do not repeat the test**，Resource savings ✅

4. **After Merge**：
   - Code goes straight in.`main`Branch
   - You don’t have to wait for the extra. CI Run
   - Time and cost savings

### CI Recommendations for optimization

- ✅ Keep testing fast (unit testing) < 5 min）
- ✅ E2E Testing only validates critical processes
- ✅ Use cache acceleration dependency installation
- ✅ Run independent tests in parallel
- ✅ Failed quick feedback（fail-fast）

---

## 📚 Relevant Documents

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright Test Document](https://playwright.dev)
- [pytest Documentation](https://docs.pytest.org)
- [Vitest Documentation](https://vitest.dev)

---

## 🆘 Need help.？

If I do, CI Problem：
1. View Actions Log Details Error
2. Frequent question part of the reference document
3. Yes. issue Question and attach error logs
4. Contact maintainer

---

**Last Update**: 2025-01-20<br>
**Maintainer**: Banana Slides Team

