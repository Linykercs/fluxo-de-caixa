#!/bin/bash
# Backup diario do banco do FluxoCaixa.
# Usa "sqlite3 .backup" (copia consistente mesmo com o app rodando), comprime
# e grava em dois destinos: disco local e iCloud Drive. Retencao de 30 dias.
set -euo pipefail

DB="$HOME/servidor-apps/fluxo-de-caixa/server/prisma/prod.db"
LOCAL_DIR="$HOME/Backups/fluxo-de-caixa"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/fluxo-de-caixa"
RETENTION_DAYS=30

STAMP=$(date +%Y%m%d%H%M%S)
FILE="prod-$STAMP.db"

mkdir -p "$LOCAL_DIR"
/usr/bin/sqlite3 "$DB" ".backup '$LOCAL_DIR/$FILE'"
gzip "$LOCAL_DIR/$FILE"

if mkdir -p "$ICLOUD_DIR" 2>/dev/null; then
  cp "$LOCAL_DIR/$FILE.gz" "$ICLOUD_DIR/"
else
  echo "$(date '+%F %T') aviso: iCloud indisponivel, backup so no disco local"
fi

find "$LOCAL_DIR" -name 'prod-*.db.gz' -mtime +$RETENTION_DAYS -delete
find "$ICLOUD_DIR" -name 'prod-*.db.gz' -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

echo "$(date '+%F %T') backup ok: $FILE.gz"
