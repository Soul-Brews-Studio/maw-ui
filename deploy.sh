#!/bin/bash
# MAW UI Deploy Script — build + clean deploy to production
# Usage: ./deploy.sh

set -e

DIST_DIR="$(dirname "$0")/dist"
DEPLOY_DIR="/opt/maw-dashboard"

echo "🔨 Building..."
bun run build

echo "🧹 Cleaning old assets..."
rm -rf "$DEPLOY_DIR/assets/"

echo "📦 Deploying..."
cp -r "$DIST_DIR/assets/" "$DEPLOY_DIR/assets/"
cp "$DIST_DIR/index.html" "$DEPLOY_DIR/index.html"
cp "$DIST_DIR/favicon.svg" "$DEPLOY_DIR/favicon.svg" 2>/dev/null || true

echo "✅ Deployed. Verifying..."
# Check referenced JS file exists
JS_FILE=$(grep -oP 'src="/maw/assets/\K[^"]+' "$DEPLOY_DIR/index.html")
if [ -f "$DEPLOY_DIR/assets/$JS_FILE" ]; then
  echo "   ✓ $JS_FILE exists"
else
  echo "   ✗ $JS_FILE MISSING — deploy may be broken!"
  exit 1
fi

echo "🎉 Done — http://76.13.221.42/maw/"
