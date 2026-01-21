#!/bin/bash
# Agent-PS Installation Script
# Copies the bundle to a target project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[install]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[install]${NC} $1"
}

log_error() {
    echo -e "${RED}[install]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[install]${NC} $1"
}

# Detect bundle location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(dirname "$SCRIPT_DIR")"

# Target directory (default: current directory)
TARGET_DIR="${1:-.}"
TARGET_AGENT_PS="${TARGET_DIR}/.agent-ps"

# Check if target already has agent-ps
if [ -d "$TARGET_AGENT_PS" ]; then
    log_warn "Target already has .agent-ps directory"
    read -p "Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    rm -rf "$TARGET_AGENT_PS"
fi

log_step "Installing Agent-PS to ${TARGET_AGENT_PS}..."

# Create directory structure
mkdir -p "$TARGET_AGENT_PS"/{runtime,messages/{inbox,outbox,bugs,feature-requests},scripts,docs}

# Copy runtime files
log_info "Copying runtime files..."
cp -r "$BUNDLE_ROOT/runtime/"* "$TARGET_AGENT_PS/runtime/"

# Copy scripts
log_info "Copying scripts..."
cp "$BUNDLE_ROOT/scripts/"*.sh "$TARGET_AGENT_PS/scripts/"
chmod +x "$TARGET_AGENT_PS/scripts/"*.sh

# Copy templates
log_info "Copying templates..."
cp "$BUNDLE_ROOT/templates/devcontainer-fragment.json" "$TARGET_AGENT_PS/"
cp "$BUNDLE_ROOT/templates/env.example" "$TARGET_AGENT_PS/"

# Copy documentation
if [ -d "$BUNDLE_ROOT/docs" ]; then
    cp -r "$BUNDLE_ROOT/docs/"* "$TARGET_AGENT_PS/docs/"
fi

# Copy bundle metadata
if [ -f "$BUNDLE_ROOT/bundle.json" ]; then
    cp "$BUNDLE_ROOT/bundle.json" "$TARGET_AGENT_PS/"
fi

log_info "Installation complete!"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Add your API key to .devcontainer/.env:"
echo "   ANTHROPIC_API_KEY=your-key-here"
echo ""
echo "2. Merge devcontainer settings from:"
echo "   ${TARGET_AGENT_PS}/devcontainer-fragment.json"
echo ""
echo "3. Rebuild your devcontainer"
echo ""
echo "4. The server will start automatically on port 4111"
echo ""
echo "To start manually: ${TARGET_AGENT_PS}/scripts/start.sh"
