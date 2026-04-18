#!/bin/bash
set -e

rm -rf dist

export CSC_IDENTITY_AUTO_DISCOVERY=false

npx electron-vite build

npx electron-builder --mac --arm64 \
  -c.mac.notarize=false \
  -c.mac.entitlementsInherit=build/entitlements.mac.unsigned.plist

# Re-sign with entitlements (ad-hoc signing doesn't apply entitlements from electron-builder)
# Ad-hoc re-sign with entitlements (--deep is fine for local unsigned dev builds)
codesign --force --deep --sign - --entitlements build/entitlements.mac.unsigned.plist "dist/mac-arm64/ACP Inspector.app"
xattr -cr "dist/mac-arm64/ACP Inspector.app"

echo "✓ Build complete: dist/mac-arm64/ACP Inspector.app"
