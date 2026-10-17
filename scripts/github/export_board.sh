#!/usr/bin/env bash
# Write docs/sprints/board-snapshot-YYYY-MM-DD.csv from the board (read-only).
# Idempotent: safe to re-run. Add --dry-run to preview without writing.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/github/board_setup.py export "$@"
