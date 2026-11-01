# E2E Test Note

## 📋 Test Policy

Use of this project**Single real. E2E Test**Strategy, avoid."Hypocrite E2E"Tests are confusing.。

### Test the pyramid

```
        ┌──────────────────┐
        │   E2E Test        │  ← Small. Test complete process. It needs real. API
        │  (api-full-flow)  │
        └──────────────────┘
              ▲
              │
      ┌───────────────────┐
      │   Integrated testing         │  ← Medium, Test API endpoint, use mock
      │  (backend/tests/)  │
      └───────────────────┘
            ▲
            │
    ┌─────────────────────┐
    │   Unit Test           │  ← Massive, fast, independent.
    │ (Frontend + Backend)        │
    └─────────────────────┘
```

---

## 🎯 E2E Test File

### 1. **api-full-flow.spec.ts** ⭐ Main E2E Test

**Characteristics**：
- ✅ Real End-to-End Test (full process)）
- ✅ Use real AI API（Google Gemini）
- ✅ Test the complete link from creation to export
- ✅ Yes. CI in autorun (if configured) API key）

**Test Process**：
```
1. Create project (from ideas)/Outline/Description）
   ↓
2. Wait. AI Generate Outline
   ↓
3. Generate Page Description
   ↓
4. Generate page pictures
   ↓
5. Export PPT Documentation
```

**Run Conditions**：
- ⚠️ It needs real. `GOOGLE_API_KEY`
- ⚠️ It’s a date. 10-15 min
- ⚠️ It’ll consume. API Quota (approximately) $0.01-0.05/Numbers）

**Run locally**：
```bash
# 1. Ensure .env It’s equipped with real GOOGLE_API_KEY
# 2. Start service.
docker compose up -d

# 3. Wait service ready (use smart wait scripts)）
./scripts/wait-for-health.sh http://localhost:5011/health 60 2
./scripts/wait-for-health.sh http://localhost:3011 60 2

# 4. Run Test
npx playwright test api-full-flow.spec.ts --workers=1
```

**CI Run**：
- Autorun： in `docker-test` job Medium
- Conditions：`GOOGLE_API_KEY` Already GitHub Secrets Medium Configuration
- Skip： without configuration API key，You skip and show instructions

---

### 2. **ui-full-flow.spec.ts** 🎨 UI Driver Full Test

**Characteristics**：
- ✅ From Browser UI Start operation (simulate real users)）
- ✅ Test complete user interaction process
- ✅ It needs real. AI API（Google Gemini）
- ⚠️ Run longer（15-20 min）
- ✅ Yes. CI in auto running (if any) API key）

**Purpose**：
- Final authentication before release
- Validate real user experience
- CI/CD Full process testing

**Run locally**：
```bash
# 1. Ensure .env It’s equipped with real GOOGLE_API_KEY
# 2. Start service.
docker compose up -d

# 3. Waiting for service.
./scripts/wait-for-health.sh http://localhost:5011/health 60 2
./scripts/wait-for-health.sh http://localhost:3011 60 2

# 4. Run Test
npx playwright test ui-full-flow.spec.ts --workers=1
```

**CI Run**：
- Autorun： in `docker-test` job Medium
- Conditions：`GOOGLE_API_KEY` Already GitHub Secrets Medium Configuration
- Skip： without configuration API key Or... Fork PR，You skip and show instructions

---

## 🚫 Deleted Tests

The following test files have been deleted (avoid confusion)）：

- ~~`home.spec.ts`~~ - Basis UI Testing (not real) E2E）
- ~~`create-ppt.spec.ts`~~ - API Integrated testing (not real) E2E）

**Reason**：
- They don’t call reality. AI API，Not a real end-to-end test
- The contents of the test are covered by other tests：
  - UI Interactive → Front-end unit testing
  - API Peer → Backend Integration Test
  - Full Process → `api-full-flow.spec.ts`

---

## 🔧 CI Configuration

### Yes. GitHub Actions running logic in

```yaml
# .github/workflows/ci-test.yml

docker-test job:
  ├─ Build Docker Mirror
  ├─ Start service.
  ├─ Health screening
  ├─ Docker Environmental testing
  └─ E2E Test (api-full-flow.spec.ts)
      ├─ If there is one... GOOGLE_API_KEY → Run Full E2E
      └─ If not API key → Skip, show instructions
```

### Configuration GitHub Secrets

Yes. CI Running E2E Test, need configuration：

1. Into the warehouse. → **Settings** → **Secrets and variables** → **Actions**
2. Add Secret：
   - Name: `GOOGLE_API_KEY`
   - Value: Yours. Google Gemini API Key
   - Fetch Address：https://aistudio.google.com/app/apikey

### If No Configuration API key

CI I’ll skip. E2E Test, and show：

```
⚠️  Skipping E2E tests

Reason: GOOGLE_API_KEY not configured or using mock key

Note: Other tests already passed:
  ✅ Backend unit tests
  ✅ Backend integration tests (with mock AI)
  ✅ Frontend unit tests
  ✅ Docker environment tests

E2E tests require a real Google API key to test the complete AI generation workflow.
```

**It’s normal.！** Other tests have covered most of the functions.。

---

## 📊 Test coverage

| Test Level | Test content | It needs to be real. API | Run Time | CI Run |
|---------|---------|-------------|---------|---------|
| **Front-end unit testing** | React Component、hooks、Tool Functions | ❌ | < 1 min | ✅ Always. |
| **Backend Unit Test** | Services、Utils、Models | ❌ | < 2 min | ✅ Always. |
| **Backend Integration Test** | API Peer（mock AI） | ❌ | < 3 min | ✅ Always. |
| **Docker Environmental testing** | Container launch, health check. | ❌ | < 5 min | ✅ Always. |
| **E2E Test** | Full AI Generate Process | ✅ | 10-15 min | ⚠️ Yes. API key Time |

---

## 🎯 Best practices

### When developing

1. **Daily development**：Run module testing and integration testing
   ```bash
   # Backend
   cd backend && uv run pytest tests/

   # Frontend
   cd frontend && npm test
   ```

2. **Submit PR Front**：Ensure CI All tests passed.
   - Light Check（Autorun）
   - Full Test（Add `ready-for-test` Tag Trigger）

3. **When the large function is completed**：Run locally once E2E Test
   ```bash
   # Ensure .env It’s real. API key
   npx playwright test api-full-flow.spec.ts
   ```

### Before release

1. **Final Authentication**：Run Full UI E2E Test
   ```bash
   npx playwright test ui-full-flow.spec.ts
   ```

2. **Inspection CI**：Ensure that all tests (including E2E）It’s through.

---

## 🐛 Debug failed test

### View test reports

```bash
# After running the test, open HTML Report
npx playwright show-report
```

### View failed screenshots and videos

When Test Failed，Playwright It’s saved automatically.：
- Screenshots：`test-results/**/test-failed-*.png`
- Video：`test-results/**/video.webm`
- Tracking：`test-results/**/trace.zip`

### View Tracks

```bash
npx playwright show-trace test-results/**/trace.zip
```

### UI Mode debugging

```bash
# Yes. UI Run tests in mode (see browser operations)）
npx playwright test --ui
```

---

## 📚 Relevant Documents

- [Playwright Documentation](https://playwright.dev)
- [CI Profile Description](../.github/CI_SETUP.md)
- [Item README](../README.md)

---

**Last Update**: 2025-12-22<br>
**Test Policy**: Single real. E2E Test
