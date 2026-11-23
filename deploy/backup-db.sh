#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/chainroll/backups"
KEEP_DAYS=7
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/chainroll-${TS}.sql.gz"

umask 077
mkdir -p "$BACKUP_DIR"

docker exec chainroll-db pg_dump -U chainroll -d chainroll --clean --if-exists | gzip -9 > "$OUT"
chmod 600 "$OUT"

# Prune backups older than KEEP_DAYS
find "$BACKUP_DIR" -type f -name 'chainroll-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup OK: ${OUT} (${SIZE})"
