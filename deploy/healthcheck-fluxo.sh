#!/bin/bash
# Healthcheck do FluxoCaixa (roda a cada 10 min via LaunchAgent):
#  1. Confere o /health local; avisa no Telegram nas transicoes (caiu/voltou).
#  2. Detecta mudanca da URL do Quick Tunnel e reaponta o webhook do bot sozinho.
# Token/secret vem do plist do app (fonte unica); destinatarios sao os
# telegramChatId vinculados na tabela Organization.
set -uo pipefail

APP_DIR="$HOME/servidor-apps/fluxo-de-caixa"
DB="$APP_DIR/server/prisma/prod.db"
APP_PLIST="$HOME/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist"
TUNNEL_LOG="$HOME/Library/Logs/cloudflared/tunnel.log"
STATE_DIR="$HOME/.fluxocaixa-health"
mkdir -p "$STATE_DIR"

TOKEN=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:TELEGRAM_BOT_TOKEN" "$APP_PLIST" 2>/dev/null || true)
SECRET=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:TELEGRAM_WEBHOOK_SECRET" "$APP_PLIST" 2>/dev/null || true)

notify() {
  local msg="$1"
  [ -z "$TOKEN" ] && return 0
  /usr/bin/sqlite3 "$DB" "SELECT telegramChatId FROM Organization WHERE telegramChatId IS NOT NULL;" |
    while read -r chat; do
      [ -z "$chat" ] && continue
      curl -s -m 15 -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        -d "chat_id=${chat}" --data-urlencode "text=${msg}" > /dev/null || true
    done
}

# ── 1. Health do app ────────────────────────────────────────────────────────
if curl -s -m 10 http://localhost:3333/health | grep -q '"ok"'; then
  NOW="up"
else
  NOW="down"
fi
PREV=$(cat "$STATE_DIR/app-state" 2>/dev/null || echo "up")
echo "$NOW" > "$STATE_DIR/app-state"
if [ "$NOW" != "$PREV" ]; then
  if [ "$NOW" = "down" ]; then
    notify "🔴 FluxoCaixa fora do ar (health falhou no Mac mini). O launchd deve reerguer sozinho; se persistir, ver ~/Library/Logs/fluxo-de-caixa/err.log"
    echo "$(date '+%F %T') app DOWN"
  else
    notify "🟢 FluxoCaixa voltou ao ar."
    echo "$(date '+%F %T') app UP novamente"
  fi
fi

# ── 2. URL do tunel mudou? Reaponta o webhook do bot ───────────────────────
URL=$(grep -o 'https://[a-z-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1)
if [ -n "$URL" ] && [ -n "$TOKEN" ] && [ -n "$SECRET" ]; then
  LAST=$(cat "$STATE_DIR/tunnel-url" 2>/dev/null || echo "")
  if [ "$URL" != "$LAST" ]; then
    RESP=$(curl -s -m 15 -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
      -H "Content-Type: application/json" \
      -d "{\"url\":\"${URL}/telegram/webhook/${SECRET}\"}")
    if echo "$RESP" | grep -q '"ok":true'; then
      echo "$URL" > "$STATE_DIR/tunnel-url"
      echo "$(date '+%F %T') webhook reapontado para $URL"
      if [ -n "$LAST" ]; then
        notify "ℹ️ A URL publica do FluxoCaixa mudou (o tunel reiniciou): ${URL} — atualize o atalho/favorito. O bot ja foi reapontado sozinho."
      fi
    else
      echo "$(date '+%F %T') falha ao reapontar webhook: $RESP"
    fi
  fi
fi
