# deploy/ — automações do Mac mini

Scripts e LaunchAgents de operação do servidor self-hosted. Os plists assumem o
usuário `Servidor` e o projeto em `/Users/Servidor/servidor-apps/fluxo-de-caixa`.

## O que existe

| Arquivo | Faz o quê |
|---|---|
| `backup-fluxo-db.sh` | Backup diário do `prod.db` (sqlite `.backup`, gzip) em `~/Backups/fluxo-de-caixa/` e no iCloud Drive, retenção 30 dias |
| `com.fluxocaixa.backup.plist` | Agenda o backup todo dia às 03:30 |
| `healthcheck-fluxo.sh` | A cada 10 min: avisa no Telegram se o app caiu/voltou e reaponta o webhook do bot sozinho quando a URL do túnel muda |
| `com.fluxocaixa.healthcheck.plist` | Agenda o healthcheck (600s, roda ao carregar) |

Os avisos vão pros chats vinculados na tela de Notificações (campo
`telegramChatId` da tabela `Organization`). Token e secret do bot são lidos do
plist do app, nada de segredo duplicado.

## Instalar (no Mac mini)

```bash
cd ~/servidor-apps/fluxo-de-caixa
chmod +x deploy/*.sh
cp deploy/com.fluxocaixa.backup.plist deploy/com.fluxocaixa.healthcheck.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.fluxocaixa.backup.plist
launchctl load ~/Library/LaunchAgents/com.fluxocaixa.healthcheck.plist
```

## Testar na mão

```bash
bash deploy/backup-fluxo-db.sh          # deve criar prod-<stamp>.db.gz nos dois destinos
bash deploy/healthcheck-fluxo.sh        # com o app de pé, não manda nada; só grava estado
cat ~/.fluxocaixa-health/app-state      # "up"
tail ~/Library/Logs/fluxo-de-caixa/backup.log ~/Library/Logs/fluxo-de-caixa/healthcheck.log
```

## Desinstalar

```bash
launchctl unload ~/Library/LaunchAgents/com.fluxocaixa.backup.plist
launchctl unload ~/Library/LaunchAgents/com.fluxocaixa.healthcheck.plist
rm ~/Library/LaunchAgents/com.fluxocaixa.{backup,healthcheck}.plist
```

## Nota sobre o healthcheck e deploys

Durante um deploy o app reinicia; se o healthcheck rodar exatamente nesse
momento, pode disparar um aviso de queda seguido de "voltou". Inofensivo. Se
incomodar, `launchctl unload` do healthcheck antes do deploy e `load` depois.
