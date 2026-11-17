#!/usr/bin/env bash
set -euo pipefail
# Standard credentials of the isolated local Supabase stack, never the hosted project.
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PGPASSWORD=postgres psql -X -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  --set ON_ERROR_STOP=1 --file "$task_dir/tests/authorization.sql"
