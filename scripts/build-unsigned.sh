#!/bin/bash
set -e

rm -rf dist

export CSC_IDENTITY_AUTO_DISCOVERY=false

npx electron-vite build

npx electron-builder --mac --arm64 \
  -c.mac.notarize=false \
  -c.mac.entitlementsInherit=build/entitlements.mac.unsigned.plist

# Re-sign with entitlements (ad-hoc signing doesn't apply entitlements from electron-builder)
# Remove quarantine attribute so macOS doesn't block the unsigned app
xattr -cr "dist/mac-arm64/ACP Inspector.app"

echo "✓ Build complete: dist/mac-arm64/ACP Inspector.app"
