#!/usr/bin/env bash
set -euo pipefail
# Standard credentials of the isolated local Supabase stack, never the hosted project.
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for test_file in "$task_dir"/tests/*.sql; do
  echo "Running $(basename "$test_file")"
  PGPASSWORD=postgres psql -X -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    --set ON_ERROR_STOP=1 --file "$test_file"
done
