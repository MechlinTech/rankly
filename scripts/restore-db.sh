#!/usr/bin/env bash
# Restores a pg_dump custom-format backup (as produced by scripts/backup-db.sh)
# into the database at $DATABASE_URL. The target database must already exist
# and should be empty (or you accept overwriting matching objects) - this does
# NOT drop the target database for you, on purpose: that's a decision a human
# should make explicitly, not a script.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/restore-db.sh path/to/backup.dump
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set." >&2
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Usage: DATABASE_URL=... ./scripts/restore-db.sh path/to/backup.dump" >&2
  exit 1
fi

echo "About to restore $DUMP_FILE into:"
echo "  $DATABASE_URL"
echo "This will create/overwrite objects in that database. It will NOT drop the database first."
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$DATABASE_URL" "$DUMP_FILE"

echo "Restore complete. Run 'npx prisma migrate status' next to confirm the schema matches prisma/migrations/."
