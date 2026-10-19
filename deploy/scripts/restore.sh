#!/usr/bin/env bash
# Restores a backup made by backup.sh. THIS REPLACES ALL CURRENT DATA.
#   ./scripts/restore.sh /var/backups/nwrmp/db-YYYYMMDD-HHMMSS.dump [/var/backups/nwrmp/uploads-YYYYMMDD-HHMMSS.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:-}"
UPLOADS="${2:-}"
if [[ ! -f "$DUMP" ]]; then
  echo "Usage: $0 <db-*.dump> [uploads-*.tar.gz]" >&2
  exit 1
fi

read -r -p "This replaces the NWRMP database${UPLOADS:+ and photos} with the backup. Type RESTORE to continue: " answer
[[ "$answer" == "RESTORE" ]] || { echo "Cancelled."; exit 1; }

echo "Stopping the API..."
docker compose stop api web

echo "Restoring database from $DUMP..."
docker compose exec -T db psql -U nwrmp -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS nwrmp WITH (FORCE);" -c "CREATE DATABASE nwrmp OWNER nwrmp;"
docker compose exec -T db pg_restore -U nwrmp -d nwrmp --no-owner --exit-on-error < "$DUMP"

if [[ -n "$UPLOADS" ]]; then
  echo "Restoring photos from $UPLOADS..."
  docker compose run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /var/lib/nwrmp/uploads/* && tar xzf - -C /var/lib/nwrmp/uploads' < "$UPLOADS"
fi

echo "Starting the API and web..."
docker compose up -d api web
echo "Restore complete. Run ./scripts/smoke-test.sh to check the service."
