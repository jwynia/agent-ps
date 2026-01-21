#!/bin/bash
# Agent-PS Health Check Script
# Verifies the server is running and responding

set -e

PORT="${AGENT_PS_PORT:-4111}"
HOST="${AGENT_PS_HOST:-localhost}"
TIMEOUT="${HEALTHCHECK_TIMEOUT:-5}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_endpoint() {
    local endpoint=$1
    local description=$2

    if curl -sf --max-time "$TIMEOUT" "http://${HOST}:${PORT}${endpoint}" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC} ${description}"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} ${description}"
        return 1
    fi
}

echo "Agent-PS Health Check"
echo "====================="
echo "Host: ${HOST}:${PORT}"
echo ""

FAILED=0

# Check health endpoint
if ! check_endpoint "/" "Server responding"; then
    FAILED=1
fi

# Check API endpoint
if ! check_endpoint "/api" "API endpoint"; then
    FAILED=1
fi

echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}Some checks failed${NC}"
    exit 1
fi
