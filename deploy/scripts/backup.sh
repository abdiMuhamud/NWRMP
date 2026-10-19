#!/usr/bin/env bash
# Backs up the database (pg_dump custom format) and the inspection photos.
# Run nightly from cron, e.g. /etc/cron.d/nwrmp-backup:
#   30 1 * * * root /opt/nwrmp/deploy/scripts/backup.sh >> /var/log/nwrmp-backup.log 2>&1
# Copy BACKUP_DIR to another machine or storage as well: a backup on the same disk is not a backup.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nwrmp}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date -Is)] Backing up database..."
docker compose exec -T db pg_dump -U nwrmp -d nwrmp -Fc > "$BACKUP_DIR/db-$STAMP.dump"

echo "[$(date -Is)] Backing up photos..."
docker compose exec -T api tar czf - -C /var/lib/nwrmp/uploads . > "$BACKUP_DIR/uploads-$STAMP.tar.gz"

# Sanity check: the dump must list its contents without error.
docker compose exec -T db pg_restore --list < "$BACKUP_DIR/db-$STAMP.dump" > /dev/null

find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Is)] Done: $BACKUP_DIR/db-$STAMP.dump, $BACKUP_DIR/uploads-$STAMP.tar.gz"
ls -lh "$BACKUP_DIR/db-$STAMP.dump" "$BACKUP_DIR/uploads-$STAMP.tar.gz"
