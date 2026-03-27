#!/usr/bin/env bash
# Run Playwright tests/scripts via the Playwright test runner.
# Usage: ./run-playwright.sh [playwright-args...]
# Examples:
#   ./run-playwright.sh
#   ./run-playwright.sh tests/example.spec.ts
#   ./run-playwright.sh --project=chromium tests/example.spec.ts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

npx playwright test "$@"
