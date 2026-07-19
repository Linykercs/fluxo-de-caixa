# Deploy no Mac mini (self-hosted)

Documentação de como o app está rodando fora da Railway, direto no Mac mini de casa, desde 2026-07-12.

## Visão geral da arquitetura

```
Internet ──▶ Cloudflare Tunnel (cloudflared) ──▶ localhost:3333 ──▶ Fastify (server + web/dist)
                                                                          │
                                                                          ▼
                                                              SQLite (server/prisma/prod.db)
```

- O **server** Fastify serve a API e o build estático do **web** (`SERVE_WEB=true`), tudo na mesma origem/porta.
- O banco é SQLite em arquivo, sem serviço de banco separado.
- O acesso público passa por um **Cloudflare Tunnel**, que não exige porta aberta no roteador nem IP fixo.
- O Mac mini também é acessível **diretamente pela rede Tailscale** (sem passar pelo túnel), útil para administração.

## Onde as coisas estão

| O quê | Caminho/local |
|---|---|
| Projeto | `/Users/Servidor/servidor-apps/fluxo-de-caixa` (no Mac mini) |
| Banco de produção | `server/prisma/prod.db` |
| Backups do banco | `server/prisma/prod.db.backup-*` (criados manualmente antes de operações arriscadas) |
| Build do frontend | `web/dist` |
| Logs do app | `~/Library/Logs/fluxo-de-caixa/out.log` e `err.log` |
| Logs do túnel | `~/Library/Logs/cloudflared/tunnel.log` |

Repo remoto: `https://github.com/Linykercs/fluxo-de-caixa.git` (mesmo repo do Railway).

✅ Resolvido em 2026-07-13: o diff não commitado do Mac mini (`server/src/app.ts`, ajuste de helmet pra acesso HTTP via Tailscale) foi commitado no repo e o working tree do servidor está limpo. Os backups `prod.db.backup-*` continuam soltos na pasta `server/prisma/` (ignorados pelo git).

## Webhook do Telegram

O webhook do bot aponta pra URL pública do túnel. **Se o túnel reiniciar e a URL mudar, o bot para de receber mensagens** até reapontar. Em 2026-07-13 ele ainda apontava pro Railway morto; foi reapontado com:

```bash
cd ~/servidor-apps/fluxo-de-caixa/server
tok=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:TELEGRAM_BOT_TOKEN" ~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist)
sec=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:TELEGRAM_WEBHOOK_SECRET" ~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist)
TELEGRAM_BOT_TOKEN=$tok TELEGRAM_WEBHOOK_SECRET=$sec npx tsx scripts/set-telegram-webhook.ts <url-publica-atual>
```

## Como acessar o Mac mini

- **Tailscale (rede privada)**: IP `100.65.77.118`. App acessível direto em `http://100.65.77.118:3333` sem precisar do túnel público.
- **SSH**: usuário `Servidor`. Chave pública deste notebook Windows já está em `~/.ssh/authorized_keys` no Mac mini — `ssh Servidor@100.65.77.118` não pede senha.
- **VNC (TigerVNC)**: mesmo IP, porta 5900. Atalho salvo em `Desktop\TigerVNC - Mac Mini 3.lnk` neste notebook.
- Senha da conta `Servidor` (usada para `sudo` e configuração inicial): ver `docs/credentials.local.md` (não commitado).

## Serviços (rodam sozinhos, reiniciam se caírem)

### 1. App (`com.servidor.fluxo-de-caixa`)

- Tipo: **LaunchAgent** de usuário (roda dentro da sessão do usuário `Servidor` — precisa da sessão logada, o que já é o caso via VNC/auto-login).
- Arquivo: `~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist`
- Executa `tsx src/server.ts` com `WorkingDirectory` em `server/`.
- Variáveis de ambiente ficam **dentro do plist** (não usa `.env` — o `npm run start -w server` não muda o `cwd` para a pasta `server/`, então o `dotenv` não acha o `.env`; por isso o plist chama `tsx` direto com `WorkingDirectory` correto e as env vars explícitas).
- `KeepAlive: true` — se o processo cair, o macOS sobe de novo sozinho.
- `RunAtLoad: true` — sobe automaticamente quando a sessão do usuário inicia (boot/login).

Comandos úteis:

```bash
# reiniciar o app (ex: depois de mudar o plist ou fazer deploy de código novo)
launchctl unload ~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist
launchctl load ~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist

# ver se está rodando
launchctl list | grep servidor.fluxo

# logs em tempo real
tail -f ~/Library/Logs/fluxo-de-caixa/out.log
```

### 2. Túnel público (`com.fluxocaixa.tunnel`)

- Tipo: **LaunchDaemon** de sistema (roda mesmo sem sessão de usuário logada).
- Arquivo: `/Library/LaunchDaemons/com.fluxocaixa.tunnel.plist`
- Executa `cloudflared tunnel --url http://localhost:3333` — modo **Quick Tunnel** (sem conta/domínio associado).
- ⚠️ **A URL pública muda toda vez que esse serviço reinicia** (reboot do Mac, crash, etc). É o modo gratuito sem domínio fixo — ver seção "Domínio fixo" abaixo. Como o app é um PWA, o navegador pode continuar mostrando a tela de login em cache mesmo com a URL antiga morta (o service worker serve o HTML do cache); a chamada de login então falha com "Não foi possível entrar". Solução: pegar a URL atual (comando abaixo) e abrir ela de novo / limpar dados do site da URL antiga.

Comandos úteis (precisam de `sudo`, é LaunchDaemon de sistema):

```bash
# reiniciar o túnel (gera URL nova)
sudo launchctl bootout system/com.fluxocaixa.tunnel
sudo launchctl bootstrap system /Library/LaunchDaemons/com.fluxocaixa.tunnel.plist

# pegar a URL pública atual
grep -o 'https://[a-z-]*\.trycloudflare\.com' ~/Library/Logs/cloudflared/tunnel.log | tail -1
```

### 3. Healthcheck + auto-reaponte do webhook (`com.fluxocaixa.healthcheck`)

- Tipo: **LaunchAgent** de usuário, roda `deploy/healthcheck-fluxo.sh` a cada 10 minutos (`StartInterval: 600`).
- Faz duas coisas:
  1. Checa `http://localhost:3333/health`; se o estado mudar (subiu/caiu), avisa via Telegram (usando o `telegramChatId` das organizações no banco).
  2. Detecta se a URL do Quick Tunnel mudou desde a última checagem e, se mudou, **reaponta o webhook do bot sozinho** (`setWebhook`) e avisa no Telegram com a URL nova.
- Estado salvo em `~/.fluxocaixa-health/` (`app-state`, `tunnel-url`).
- Logs: `~/Library/Logs/fluxo-de-caixa/healthcheck.log`.
- Isso significa que o bot do Telegram não quebra mais quando a URL muda — só o link salvo no navegador/atalho é que fica desatualizado (ver aviso acima).

### 4. Backup diário do banco (`com.fluxocaixa.backup`)

- Tipo: **LaunchAgent** de usuário, roda `deploy/backup-fluxo-db.sh` todo dia às 3h30 (`StartCalendarInterval`).
- Usa `sqlite3 .backup` (cópia consistente mesmo com o app rodando), comprime com gzip e grava em dois lugares: `~/Backups/fluxo-de-caixa/` e iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/Backups/fluxo-de-caixa/`).
- Retenção de 30 dias (apaga backups mais antigos automaticamente).
- Logs: `~/Library/Logs/fluxo-de-caixa/backup.log`.

## Domínio fixo (pendente)

A URL pública atual (`*.trycloudflare.com`) é temporária. O plano é:

1. Zona `fluxocaixa.eu.org` já criada na Cloudflare (conta `linykermc@unipam.edu.br`), com nameservers `owen.ns.cloudflare.com` e `tessa.ns.cloudflare.com`.
2. Falta registrar esse subdomínio no **eu.org** apontando pra esses nameservers (o site do eu.org estava fora do ar em 2026-07-12 — tentar de novo mais tarde, ou ver alternativa sugerida por outra ferramenta).
3. Quando aprovado: criar um **túnel nomeado** (não mais Quick Tunnel) via `cloudflared tunnel create`, rodar `cloudflared tunnel route dns` apontando `fluxocaixa.eu.org` pro túnel, e trocar o `ProgramArguments` do `com.fluxocaixa.tunnel.plist` de `--url http://localhost:3333` para `--config <arquivo-de-config-do-tunnel-nomeado>`. Isso dá uma URL **fixa**, que não muda mais.

## Deploy de código novo

Não existe pipeline automático — é manual:

```bash
ssh Servidor@100.65.77.118
cd ~/servidor-apps/fluxo-de-caixa
git pull                          # revisar mudanças locais nao commitadas antes!
npm ci
npm run build                     # rebuilda o web/dist
npm run db:migrate                # aplica migrations pendentes (idempotente)
launchctl unload ~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist
launchctl load ~/Library/LaunchAgents/com.servidor.fluxo-de-caixa.plist
```

## Backup do banco

O banco é um arquivo único (`server/prisma/prod.db`). Antes de qualquer operação arriscada (migration grande, troca de dados), copiar:

```bash
cp server/prisma/prod.db server/prisma/prod.db.backup-$(date +%Y%m%d%H%M%S)
```

Não há backup automático agendado ainda — considerar um `cron`/`launchd` periódico copiando o arquivo pra outro lugar (ex: iCloud Drive, outro disco) se os dados forem importantes.

## Histórico: migração da Railway (2026-07-12)

- O deploy na Railway (`docs/deploy-railway.md`) tinha expirado o trial e ficado com status `Failed`, sem deployment ativo.
- Foi necessário reativar temporariamente o plano Hobby (~US$5) para acessar o volume persistente e baixar o `fluxo.db` de lá (Railway não permite acesso a arquivos do volume sem um deployment ativo rodando).
- Dados migrados: 6 usuários, 2 organizações, 248 lançamentos, 196 baixas, 4 contas bancárias.
- Configuração do bot do Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`) também foi copiada da Railway pro plist do Mac mini.
- Assinatura da Railway cancelada e reembolso solicitado no mesmo dia (prazo deles: 5-7 dias úteis).
- O projeto `zooming-presence` na Railway pode ser deletado quando o usuário quiser — já não representa custo.

## Usuários existentes no banco

| E-mail | Organização | Role |
|---|---|---|
| `ana@empresa.com.br` | (demo original) | ADMIN |
| `bruno@empresa.com.br` | (demo original) | ADMIN |
| `fabricio@gandour.com.br` | (demo original) | ADMIN |
| `linyker02@gmail.com` | — | ADMIN |
| `fabricio@triari.com.br` | Triari | ADMIN |
| `triariengenharia@gmail.com` | Triari | ADMIN |

Senhas não ficam documentadas aqui (hash argon2 no banco). Ver `docs/credentials.local.md` para as que são conhecidas.
