# Backend Integration Tests

## Test Category

### 1. Flask Test Client Test (no running services required)）
**Documentation**: `test_full_workflow.py`

These tests are used. Flask Test client（`client` fixture），No real service running required。

**Characteristics**：
- ✅ Fast (ms)）
- ✅ No start-up service required
- ✅ Yes. CI It’s... `backend-integration-test` Phase Run
- ✅ Usage mock Mode, no need to be real. API key

**Method of running**：
```bash
cd backend
uv run pytest tests/integration/test_full_workflow.py -v
```

### 2. Real Service Test (requires running services）
**Documentation**: `test_api_full_flow.py`

These tests are used. `requests` Library Direct Call HTTP End, require real back-end service run。

**Characteristics**：
- ⏱️ Slower (need to be real) HTTP Request）
- 🔧 Need service to run on `http://localhost:5011`
- 🏗️ Yes. CI It’s... `docker-test` Phase run (service started)）
- 🔑 Full process testing needs real. AI API key

**Tags**: `@pytest.mark.requires_service`

**Method of running**：
```bash
# 1. Start service.
docker compose up -d

# 2. Run Test
cd backend
uv run pytest tests/integration/test_api_full_flow.py -v -m "requires_service"
```

## CI/CD Policy

### Backend Integration Test Phase
**When to run**: Every time. PR and push Time

**Run Test**:
- ✅ Usage Flask test client Tests
- ❌ Skip testing for real services

```yaml
# Skip @pytest.mark.requires_service Marked Test
pytest tests/integration -v -m "not requires_service"
```

**Environmental variables**:
```yaml
TESTING: true
SKIP_SERVICE_TESTS: true
GOOGLE_API_KEY: mock-api-key-for-testing
```

### Docker Test Phase
**When to run**: Yes. PR Add `ready-for-test` When tabing

**Run Test**:
- ✅ Run tests that require real services
- ✅ Test complete. API Call Process

```yaml
# Run only @pytest.mark.requires_service Marked Test
pytest tests/integration/test_api_full_flow.py -v -m "requires_service"
```

**Environmental variables**:
```yaml
SKIP_SERVICE_TESTS: false
GOOGLE_API_KEY: <real-api-key-from-secrets>
```

## Pytest Markers

All Available markers Define in `pytest.ini` Medium：

| Marker | Annotations | Example： |
|--------|------|------|
| `unit` | Unit Test | Test a single function or method |
| `integration` | Integrated testing | Test multiple components interactive |
| `slow` | Slow test. | Yes. AI API Call Test |
| `requires_service` | Operation services required | Usage requests Call HTTP Peer |
| `mock` | Usage mock | Do not call real external services |
| `docker` | Docker Environmental testing | Yes. Docker Environment |

## Run Example

### Run all integration tests (jumping service required)）
```bash
cd backend
SKIP_SERVICE_TESTS=true uv run pytest tests/integration/ -v -m "not requires_service"
```

### Only run tests that require services
```bash
# Ensure that services are initiated
docker compose up -d

# Run Test
cd backend
SKIP_SERVICE_TESTS=false uv run pytest tests/integration/ -v -m "requires_service"
```

### Run all integration tests (service required)）
```bash
# Ensure that services are initiated
docker compose up -d

# Run all tests
cd backend
uv run pytest tests/integration/ -v
```

### Run Specific Tests
```bash
# Run fast API Testing (needs services)）
cd backend
uv run pytest tests/integration/test_api_full_flow.py::TestAPIFullFlow::test_quick_api_flow_no_ai -v

# Run a complete process test (need for service and real) API key）
cd backend
uv run pytest tests/integration/test_api_full_flow.py::TestAPIFullFlow::test_api_full_flow_create_to_export -v
```

## It’s out of order.

### Problem：`ConnectionRefusedError: [Errno 111] Connection refused`

**Reason**: Test an attempt to connect `localhost:5011`，But the service is not running.。

**Solutions**:
1. Start service.：`docker compose up -d`
2. Or skip these tests.：`pytest -m "not requires_service"`

### Question： Test in CI It’s... backend-integration-test Stage failure

**Reason**: No service start at this stage. Should skip. `requires_service` Test。

**Solutions**: Ensure CI The configuration was right. pytest Command：
```yaml
pytest tests/integration -v -m "not requires_service"
```

## Best practices

1. **New Integrated Test**:
   - If the test can be used Flask test client → Add to `test_full_workflow.py`
   - If the test needs to be real, HTTP Call → Add to `test_api_full_flow.py` and mark `@pytest.mark.requires_service`

2. **Marker Usage**:
   ```python
   @pytest.mark.integration
   @pytest.mark.requires_service
   def test_real_api_call(self):
       response = requests.post('http://localhost:5011/api/projects', ...)
   ```

3. **Environmental inspection**:
   - File Level Skipped： Use `pytestmark = pytest.mark.skipif(...)`
   - Test Level Skip： Use `@pytest.mark.skipif(...)`

---

**Update Date**: 2025-12-22<br>
**Maintainer**: Banana Slides Team
