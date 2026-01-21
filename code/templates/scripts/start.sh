#!/bin/bash
# Agent-PS Start Script
# Starts the agent-ps server with proper configuration

set -e

# Detect bundle location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(dirname "$SCRIPT_DIR")"
RUNTIME_DIR="${BUNDLE_ROOT}/runtime"
MESSAGES_DIR="${BUNDLE_ROOT}/messages"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[agent-ps]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[agent-ps]${NC} $1"
}

log_error() {
    echo -e "${RED}[agent-ps]${NC} $1"
}

# Check Node.js version
check_node_version() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        log_error "Node.js 22+ is required (found v${NODE_VERSION})"
        exit 1
    fi
    log_info "Node.js version check passed (v$(node -v | cut -d'v' -f2))"
}

# Create message directories if missing
create_directories() {
    local dirs=("inbox" "outbox" "bugs" "feature-requests")

    for dir in "${dirs[@]}"; do
        if [ ! -d "${MESSAGES_DIR}/${dir}" ]; then
            mkdir -p "${MESSAGES_DIR}/${dir}"
            log_info "Created ${MESSAGES_DIR}/${dir}"
        fi
    done
}

# Install dependencies if needed (minimal bundle)
install_dependencies() {
    if [ ! -d "${RUNTIME_DIR}/node_modules" ]; then
        log_info "Installing dependencies..."
        cd "$RUNTIME_DIR"
        npm install --production
        cd - > /dev/null
        log_info "Dependencies installed"
    fi
}

# Set environment defaults
set_defaults() {
    export AGENT_PS_PORT="${AGENT_PS_PORT:-4111}"
    export MESSAGES_ROOT="${MESSAGES_ROOT:-$MESSAGES_DIR}"
    export LOG_LEVEL="${LOG_LEVEL:-info}"
}

# Main
main() {
    log_info "Starting Agent-PS..."

    check_node_version
    create_directories
    install_dependencies
    set_defaults

    log_info "Runtime: ${RUNTIME_DIR}"
    log_info "Messages: ${MESSAGES_ROOT}"
    log_info "Port: ${AGENT_PS_PORT}"

    cd "$RUNTIME_DIR"
    exec node ./index.mjs
}

main "$@"
