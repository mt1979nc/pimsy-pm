#!/usr/bin/env bash
# Backup PATH Postgres with pg_dump. Documented for an operator to run.
# Do not run this from CI, from a deploy, or from an agent task.
#
# Usage (DATABASE_URL already in the environment — App Service configuration
# or a local shell; do not paste the URL into the command line):
#
#   bash scripts/backup-path-db.sh
#   bash scripts/backup-path-db.sh /tmp/path-backup.dump
#
# Writes a custom-format dump (pg_restore). Prints the output path only.
# Refuses pglite URLs. Does not drop, truncate, or delete any database object.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Export it in the shell, then re-run this script." >&2
  exit 1
fi

case "${DATABASE_URL}" in
  pglite:*)
    echo "DATABASE_URL is a pglite path. pg_dump needs the Postgres connection string." >&2
    exit 1
    ;;
esac

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not on PATH. Install the PostgreSQL client tools, then re-run." >&2
  exit 1
fi

out="${1:-/tmp/path-backup-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$out")"

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$out"

echo "Wrote ${out}"
echo "Restore with: pg_restore --clean --if-exists --no-owner --dbname=\"\$DATABASE_URL\" ${out}"
