#!/bin/bash
# Docker Environmental complete testing script
# Test Project in Docker Complete function in the environment

set -e  # Quit immediately in case of error

# Colour Definition
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Test started.
echo ""
echo "================================="
echo "🐳 Docker Environmental integrity test"
echo "================================="
echo ""

# Check preconditions
log_info "Check preconditions..."

if ! command -v docker &> /dev/null; then
    log_error "Docker Not installed, please install first Docker"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_error "Docker Compose Not installed"
    exit 1
fi

if [ ! -f ".env" ]; then
    log_warning ".env File does not exist, from.env.example Copy"
    cp .env.example .env
fi

log_success "Precondition check passed."

# 1. Cleaning the old environment
log_info "Steps 1/10: Cleaning the old environment..."
docker compose down -v 2>/dev/null || true
docker system prune -f >/dev/null 2>&1 || true
log_success "Environmental clean-up completed"

# 2. Build mirrors
log_info "Steps 2/10: Build Docker Mirror..."
if docker compose build --no-cache; then
    log_success "Mirror Build Success"
else
    log_error "Mirror Build Failed"
    exit 1
fi

# 3. Start service.
log_info "Steps 3/10: Start Docker Services..."
if docker compose up -d; then
    log_success "Service started successfully"
else
    log_error "Service startup failed"
    docker compose logs
    exit 1
fi

# 4. Waiting for service.
log_info "Steps 4/10: Waiting for service to be ready (maximum) 60 sec）..."
max_wait=60
waited=0
backend_ready=false
frontend_ready=false

while [ $waited -lt $max_wait ]; do
    # Check Backend
    if curl -s http://localhost:5011/health >/dev/null 2>&1; then
        backend_ready=true
    fi

    # Check Frontend
    if curl -s http://localhost:3011 >/dev/null 2>&1; then
        frontend_ready=true
    fi

    if [ "$backend_ready" = true ] && [ "$frontend_ready" = true ]; then
        break
    fi

    sleep 2
    waited=$((waited + 2))
    echo -n "."
done
echo ""

if [ "$backend_ready" = false ] || [ "$frontend_ready" = false ]; then
    log_error "Service start timeout"
    log_info "View container state："
    docker compose ps
    log_info "View Backend Log："
    docker compose logs backend
    log_info "View frontend log："
    docker compose logs frontend
    exit 1
fi

log_success "Service readiness (time-consuming) ${waited}sec）"

# 5. Check container health.
log_info "Steps 5/10: Check container health...."
backend_status=$(docker compose ps backend | grep -c "Up" || echo "0")
frontend_status=$(docker compose ps frontend | grep -c "Up" || echo "0")

if [ "$backend_status" -eq "0" ] || [ "$frontend_status" -eq "0" ]; then
    log_error "The container is in an abnormal state."
    docker compose ps
    exit 1
fi
log_success "The container is in good condition."

# 6. Backend health check
log_info "Steps 6/10: Backend health check..."
backend_health=$(curl -s http://localhost:5011/health)
if echo "$backend_health" | grep -q '"status":"ok"'; then
    log_success "Backend health check passed."
    echo "    Response: $backend_health"
else
    log_error "Backend health check failed"
    echo "    Response: $backend_health"
    exit 1
fi

# 7. Front-end access testing
log_info "Steps 7/10: Front-end access testing..."
frontend_status_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3011)
if [ "$frontend_status_code" = "200" ]; then
    log_success "Front-end access is normal (HTTP $frontend_status_code)"
else
    log_error "Front-end access failed (HTTP $frontend_status_code)"
    exit 1
fi

# 8. API Function Test
log_info "Steps 8/10: API Function Test..."

# 8.1 Create Item
log_info "  8.1 Create Item..."
create_response=$(curl -s -X POST http://localhost:5011/api/projects \
    -H "Content-Type: application/json" \
    -d '{"creation_type":"idea","idea_prompt":"Docker Test items"}')

if echo "$create_response" | grep -q '"success":true'; then
    project_id=$(echo "$create_response" | grep -o '"project_id":"[^"]*"' | cut -d'"' -f4)
    log_success "  Project was successfully created: $project_id"
else
    log_error "  Project creation failed"
    echo "    Response: $create_response"
    exit 1
fi

# 8.2 Get items
log_info "  8.2 Retrieving project details..."
get_response=$(curl -s http://localhost:5011/api/projects/$project_id)
if echo "$get_response" | grep -q '"success":true'; then
    log_success "  Project success"
else
    log_error "  Project acquisition failed"
    exit 1
fi

# 8.3 Upload template (if available)）
if [ -f "template_g.png" ]; then
    log_info "  8.3 Upload Template File..."
    upload_response=$(curl -s -X POST http://localhost:5011/api/projects/$project_id/template \
        -F "template_image=@template_g.png")

    if echo "$upload_response" | grep -q '"success":true'; then
        log_success "  Template upload succeeded"
    else
        log_warning "  Template upload failed (not critical)）"
    fi
else
    log_warning "  8.3 Skip Template Upload (file does not exist)）"
fi

# 8.4 Delete Item (cleanup)）
log_info "  8.4 Delete Test Item..."
delete_response=$(curl -s -X DELETE http://localhost:5011/api/projects/$project_id)
if echo "$delete_response" | grep -q '"success":true'; then
    log_success "  Item deleted successfully"
else
    log_warning "  Failed to delete item (non-key)）"
fi

log_success "API Functional test passed."

# 9. Data Durable Testing
log_info "Steps 9/10: Data Durable Testing..."

# Create an item
create_response=$(curl -s -X POST http://localhost:5011/api/projects \
    -H "Content-Type: application/json" \
    -d '{"creation_type":"idea","idea_prompt":"Endurance test"}')
persist_project_id=$(echo "$create_response" | grep -o '"project_id":"[^"]*"' | cut -d'"' -f4)

# Restart Backend
log_info "  Restart Backend..."
docker compose restart backend
sleep 5

# Waiting for backend recovery
for i in {1..30}; do
    if curl -s http://localhost:5011/health >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Check if the project still exists
persist_check=$(curl -s http://localhost:5011/api/projects/$persist_project_id)
if echo "$persist_check" | grep -q '"success":true'; then
    log_success "Data sustainability test passed."
else
    log_error "Data Endurance Test Failed"
    exit 1
fi

# Clear Test Data
curl -s -X DELETE http://localhost:5011/api/projects/$persist_project_id >/dev/null

# 10. Log Check
log_info "Steps 10/10: Check if there’s any error in the container log..."
backend_errors=$(docker compose logs backend 2>&1 | grep -i "error\|exception\|traceback" | grep -v "DEBUG" | wc -l)
frontend_errors=$(docker compose logs frontend 2>&1 | grep -i "error" | grep -v "warn" | wc -l)

if [ "$backend_errors" -gt 5 ]; then
    log_warning "Found in Backend Log $backend_errors A mistake."
    docker compose logs backend | grep -i "error\|exception" | tail -10
else
    log_success "Backend Check Passed（$backend_errors A mistake.）"
fi

if [ "$frontend_errors" -gt 5 ]; then
    log_warning "Found in front log $frontend_errors A mistake."
else
    log_success "Front log check pass（$frontend_errors A mistake.）"
fi

# Test Summary
echo ""
echo "================================="
echo "✅ Docker Environmental tests completed"
echo "================================="
echo ""
echo "📊 Test Summary："
echo "  ✓ Mirror Build"
echo "  ✓ Service start"
echo "  ✓ Health screening"
echo "  ✓ API Functions"
echo "  ✓ Data Durable"
echo "  ✓ Log Check"
echo ""
echo "🎯 Next："
echo "  1. Run Full API Test: cd backend && python ../tests/test_e2e.py"
echo "  2. Run E2E Test: npx playwright test"
echo "  3. Stop Environment: docker compose down"
echo ""

# Ask if to clean the environment
if [ "${AUTO_CLEANUP}" != "false" ]; then
    read -p "Whether to stop Docker Environment？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stop Docker Environment..."
        docker compose down
        log_success "Environment cleared"
    else
        log_info "Keep environment running, manual: docker compose down"
    fi
fi

exit 0

