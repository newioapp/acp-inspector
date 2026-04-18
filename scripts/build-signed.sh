#!/bin/bash
set -e

# Read notarization credentials from macOS Keychain
export APPLE_ID=$(security find-generic-password -a "newio-build" -s "APPLE_ID" -w)
export APPLE_APP_SPECIFIC_PASSWORD=$(security find-generic-password -a "newio-build" -s "APPLE_APP_SPECIFIC_PASSWORD" -w)
export APPLE_TEAM_ID=$(security find-generic-password -a "newio-build" -s "APPLE_TEAM_ID" -w)

rm -rf dist

npx electron-vite build

npx electron-builder --mac --arm64

echo "✓ Build complete: dist/mac-arm64/ACP Inspector.app"
