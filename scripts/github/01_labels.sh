#!/usr/bin/env bash
# Create missing labels.
# Idempotent: safe to re-run. Add --dry-run to preview without writing.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/github/board_setup.py labels "$@"
