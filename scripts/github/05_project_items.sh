#!/usr/bin/env bash
# Add issues to the project, set field values, and create missing views.
# Idempotent: safe to re-run. Add --dry-run to preview without writing.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/github/board_setup.py items views "$@"
