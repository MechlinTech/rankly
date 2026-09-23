#!/usr/bin/env bash
# Dumps the database at $DATABASE_URL to a timestamped, compressed pg_dump
# custom-format file. Requires the `pg_dump` client (matching or newer than
# the server's major version) to be installed and on PATH.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup-db.sh [output-dir]
#
# The custom format (-Fc) is required for scripts/restore-db.sh, and also
# supports selective/parallel restore via `pg_restore` directly if needed.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set." >&2
  exit 1
fi

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/rankly-$TIMESTAMP.dump"

echo "Backing up to $OUT_FILE ..."
pg_dump --format=custom --no-owner --no-privileges --file="$OUT_FILE" "$DATABASE_URL"

echo "Done: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
echo "Verify it before trusting it: pg_restore --list \"$OUT_FILE\" | head"
