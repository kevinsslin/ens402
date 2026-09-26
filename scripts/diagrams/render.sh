#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# The pinned CLI renders the public Mermaid source once, without a browser bundle.
# Optionally set PUPPETEER_EXECUTABLE_PATH to an installed Chromium executable.
pnpm dlx @mermaid-js/mermaid-cli@11.15.0 \
  -i apps/web/public/diagrams/ens402-contracts.mmd \
  -o apps/web/public/diagrams/ens402-contracts.svg \
  -b transparent --width 1200
