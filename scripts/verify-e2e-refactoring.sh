#!/bin/bash

# E2E Test Reconstruct Verification Script
# To verify whether the reconstruction was successfully completed

set -e

echo "======================================"
echo "🔍 E2E Test Reconstruction Validation"
echo "======================================"
echo

# Colour Output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check Frontend E2E Contents
echo "1. Check Frontend E2E Contents..."
if [ -d "frontend/e2e" ]; then
    check_pass "frontend/e2e/ Directory Exists"
else
    check_fail "frontend/e2e/ Directory does not exist"
fi

# 2. Check Frontend E2E Test File
echo "2. Check Frontend E2E Test File..."
if [ -f "frontend/e2e/ui-full-flow.spec.ts" ]; then
    check_pass "ui-full-flow.spec.ts Moved to frontend/e2e/"
else
    check_fail "ui-full-flow.spec.ts No, I’m not. frontend/e2e/"
fi

if [ -f "frontend/e2e/visual-regression.spec.ts" ]; then
    check_pass "visual-regression.spec.ts Moved to frontend/e2e/"
else
    check_fail "visual-regression.spec.ts No, I’m not. frontend/e2e/"
fi

# 3. Inspection Playwright Configuration
echo "3. Inspection Playwright Configuration..."
if [ -f "frontend/playwright.config.ts" ]; then
    check_pass "playwright.config.ts Moved to frontend/"
else
    check_fail "playwright.config.ts No, I’m not. frontend/"
fi

# 4. Check Frontend package.json
echo "4. Check Frontend package.json..."
if grep -q "@playwright/test" frontend/package.json; then
    check_pass "frontend/package.json Organisation Playwright Dependency"
else
    check_fail "frontend/package.json Missing Playwright Dependency"
fi

if grep -q "test:e2e" frontend/package.json; then
    check_pass "frontend/package.json Organisation E2E Test script"
else
    check_fail "frontend/package.json Missing E2E Test script"
fi

# 5. Check for backend integration tests
echo "5. Check for backend integration tests..."
if [ -f "backend/tests/integration/test_api_full_flow.py" ]; then
    check_pass "test_api_full_flow.py Created in backend/tests/integration/"
else
    check_fail "test_api_full_flow.py No, I’m not. backend/tests/integration/"
fi

# 6. Check root directory cleanup
echo "6. Check root directory cleanup..."
if [ ! -d "e2e" ]; then
    check_pass "Root Directory e2e/ Deleted"
else
    check_warn "Root Directory e2e/ Still exists (should have been deleted)）"
fi

if [ ! -f "playwright.config.ts" ]; then
    check_pass "Root Directory playwright.config.ts Deleted"
else
    check_warn "Root Directory playwright.config.ts Still exists (should have been deleted)）"
fi

if [ ! -f "tsconfig.json" ]; then
    check_pass "Root Directory tsconfig.json Deleted"
else
    check_warn "Root Directory tsconfig.json Still exists (should have been deleted)）"
fi

if [ ! -d "node_modules" ]; then
    check_pass "Root Directory node_modules/ Deleted"
else
    check_warn "Root Directory node_modules/ Still exists (should have been deleted)）"
fi

# 7. Inspection CI Configuration
echo "7. Inspection CI Configuration..."
if grep -q "cd frontend" .github/workflows/ci-test.yml; then
    check_pass "CI Configuration updated (includes) 'cd frontend'）"
else
    check_warn "CI Configuration may not be updated"
fi

if grep -q "test_api_full_flow.py" .github/workflows/ci-test.yml; then
    check_pass "CI Configure contains backends API Test"
else
    check_warn "CI Configure may lack a backend API Test"
fi

# 8. Inspection .gitignore
echo "8. Inspection .gitignore..."
if grep -q "test-results/" frontend/.gitignore; then
    check_pass "frontend/.gitignore Updated"
else
    check_warn "frontend/.gitignore It may need updating."
fi

echo
echo "======================================"
echo "✅ E2E Test reconstruction validation complete！"
echo "======================================"
echo
echo "Next："
echo "1. cd frontend && npm install  # Install front-end dependency (includes) Playwright）"
echo "2. cd frontend && npm run test:e2e  # Run Frontend E2E Test"
echo "3. cd backend && uv run pytest tests/integration/ -v  # Run backend integration test"
echo

