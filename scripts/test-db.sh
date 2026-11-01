#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres (Supabase-compatible stub for auth/storage/vault)
# and runs supabase/tests/phase1.sql. Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=saut_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/supabase_stub.sql
apply() { # fails the run on any SQL error; hides NOTICE chatter
  local out; if ! out=$(psql -q -v ON_ERROR_STOP=1 --single-transaction -d "$DB" -f "$1" 2>&1); then echo "$out" | grep -v NOTICE; exit 1; fi
  echo "$out" | grep -v NOTICE || true
}
for f in supabase/migrations/*.sql; do echo "== migrate $f"; apply "$f"; done
echo "== re-run Phase 1+ migrations (idempotency)"
for f in supabase/migrations/000[89]*.sql supabase/migrations/001*.sql; do [ -f "$f" ] && apply "$f"; done
for t in supabase/tests/phase*.sql; do
  echo "== tests $t"
  psql -q -t -A -o /dev/null -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1: /'
done
