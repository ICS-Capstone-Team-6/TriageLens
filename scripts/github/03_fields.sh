#!/usr/bin/env bash
# Set project title, description, README and repo link; create missing project fields and options.
# Idempotent: safe to re-run. Add --dry-run to preview without writing.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/github/board_setup.py project fields "$@"
