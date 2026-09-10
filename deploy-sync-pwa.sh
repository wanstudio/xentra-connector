#!/bin/bash
# Deploy Customer PWA static files into the Connector's public/ directory.
# Run this from the xentra-connector repo root after deploying xentra-core.
#
# Usage:
#   ./deploy-sync-pwa.sh /path/to/xentra-core
#
# The PWA source is xentra-core/apps/customer-pwa/

set -euo pipefail

XENTRA_CORE_DIR="${1:-../xentra-core}"
PWA_SOURCE="$XENTRA_CORE_DIR/apps/customer-pwa"
PWA_TARGET="./public"

if [ ! -d "$PWA_SOURCE" ]; then
  echo "ERROR: PWA source not found at $PWA_SOURCE"
  echo "Usage: $0 /path/to/xentra-core"
  exit 1
fi

echo "=== Syncing Customer PWA from $PWA_SOURCE ==="

# Clean existing public directory (except .gitkeep)
find "$PWA_TARGET" -mindepth 1 -not -name '.gitkeep' -not -path '*/.gitkeep' -exec rm -rf {} + 2>/dev/null || true

# Copy all PWA files
cp -r "$PWA_SOURCE"/* "$PWA_TARGET/"

echo "=== PWA synced to $PWA_TARGET ==="
echo "Files:"
ls -la "$PWA_TARGET/" | head -20
