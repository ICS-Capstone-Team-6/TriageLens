#!/usr/bin/env bash
# Run every setup step in order, then verify. Idempotent and resumable.
# Usage: scripts/github/00_run_all.sh [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/../.."
gh auth status 2>&1 | grep -q "'project'" || { echo "Token lacks the project scope. Run: gh auth refresh -s project -s repo"; exit 1; }
python3 scripts/github/board_setup.py validate
for s in 01_labels 02_milestones 03_fields 04_issues 05_project_items; do
  echo "== $s"
  "scripts/github/$s.sh" "$@"
done
python3 scripts/github/board_setup.py verify
