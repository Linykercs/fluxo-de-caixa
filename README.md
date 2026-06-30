# Fluxo de Caixa

Aplicativo web de fluxo de caixa para controle financeiro de uma pequena empresa: contas a pagar e a receber, saldo bancário derivado de movimentações, painel mensal (previsto x realizado) e relatórios.

Monorepo com três workspaces npm:

- **`server`** — API Fastify + Prisma + SQLite (TypeScript). Documentação completa da API em [`server/README.md`](server/README.md).
- **`web`** — frontend React + Vite (TypeScript).
- **`shared`** — schemas zod e tipos compartilhados entre `server` e `web`.

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior (instalado junto com o Node)

## Instalação

Na raiz do projeto:

```bash
npm install
```

Isso resolve as dependências dos três workspaces e roda `prisma generate` automaticamente (script `postinstall` do workspace `server`).

## Configuração de ambiente

Copie o arquivo de exemplo (os valores padrão já funcionam em desenvolvimento):

```bash
cp server/.env.example server/.env
```

| Variável | Descrição | Padrão (dev) |
|---|---|---|
| `DATABASE_URL` | Caminho do banco SQLite | `file:./prisma/dev.db` |
| `JWT_SECRET` | Segredo de assinatura do cookie de sessão | `dev-secret-troque-em-producao` |
| `CORS_ORIGIN` | Origem permitida no CORS | `http://localhost:5173` |
| `PORT` | Porta da API | `3333` |
| `HOST` | Host da API | `127.0.0.1` |
| `SERVE_WEB` | Servir `web/dist` pelo backend | `false` em dev, `true` em production |
| `WEB_DIST_PATH` | Caminho do build web para o backend servir | `../web/dist` |
| `TELEGRAM_BOT_TOKEN` | Token do bot (ver seção [Notificações via Telegram](#notificações-via-telegram)) | desativado se vazio |
| `TELEGRAM_BOT_USERNAME` | Username do bot (sem `@`), só pra montar o link de convite | desativado se vazio |
| `TELEGRAM_WEBHOOK_SECRET` | Segredo na URL do webhook do bot | desativado se vazio |
| `WHATSAPP_ENABLED` | Liga a sessão do WhatsApp não oficial (ver [Notificações via WhatsApp](#notificações-via-whatsapp-não-oficial)) | `false` |
| `WHATSAPP_SESSION_PATH` | Onde salvar a sessão logada do WhatsApp | `./.whatsapp-session` |
| `PUPPETEER_EXECUTABLE_PATH` | Caminho de um Chromium específico do sistema (opcional) | vazio (puppeteer baixa o próprio) |

## Banco de dados: migrations e seed

Cria o banco SQLite, aplica as migrations e popula com dados de exemplo:

```bash
npm run db:migrate -w server
npm run db:seed -w server
```

Para recomeçar do zero (apaga e recria o banco, aplica migrations e roda o seed) em um único comando:

```bash
npm run db:reset -w server
```

O seed (`server/prisma/seed.ts`) cria 1 organização, 2 usuários, 2 contas bancárias, 8 categorias e cerca de 6 meses de lançamentos cobrindo pagos, em aberto, vencidos, baixa parcial, parcelamento (6x), recorrências, 1 estorno e 1 transferência entre contas. É idempotente: pode ser rodado várias vezes.

Para inspecionar os dados manualmente:

```bash
npm run db:studio -w server
```

## Rodando em desenvolvimento

Em dois terminais separados, a partir da raiz:

```bash
npm run dev:server   # API em http://127.0.0.1:3333
npm run dev:web      # Frontend em http://localhost:5173
```

Abra `http://localhost:5173` no navegador e faça login com um dos usuários de teste abaixo.

## Usuários de teste

Criados pelo seed (mesma senha para os dois):

| E-mail | Senha | Nome |
|---|---|---|
| `ana@empresa.com.br` | `senha123` | Ana Souza |
| `bruno@empresa.com.br` | `senha123` | Bruno Lima |

## Testes

A suíte de testes (Vitest) vive no workspace `server`:

```bash
npm test              # equivalente a: npm test -w server
```

Para rodar em modo watch durante o desenvolvimento:

```bash
npm run test:watch -w server
```

## Typecheck

Verifica os três workspaces em sequência (`shared` → `server` → `web`):

```bash
npm run typecheck
```

## Build e execucao em producao

O backend pode servir o build estatico do frontend. Assim, em producao o app roda em um unico dominio e o frontend chama a API pela mesma origem.

Fluxo minimo:

```bash
npm ci
npm run build
npm run db:migrate
NODE_ENV=production HOST=0.0.0.0 PORT=3333 npm start
```

Variaveis recomendadas estao em `server/.env.production.example`.

Para primeira carga de demonstracao:

```bash
npm run db:reset
```

Em producao real, prefira `npm run db:migrate` para preservar dados existentes.

### Banco em producao

Para uma empresa pequena, o caminho mais simples e SQLite/libSQL com arquivo em volume persistente, por exemplo:

```bash
DATABASE_URL="file:/data/fluxo.db"
```

O volume precisa ter backup/snapshot periodico. Se a operacao evoluir para varias empresas/clientes, considere migrar para um banco gerenciado compativel com libSQL/Turso ou reavaliar PostgreSQL.

## Notificações via Telegram

Cada organização pode vincular um chat do Telegram para receber lembretes automáticos de lançamentos vencendo amanhã e vencendo hoje (1x/dia, sem duplicar). Gratuito e funciona para várias organizações ao mesmo tempo, usando um único bot.

Configuração (uma vez só, feita pelo dono do servidor):

1. Crie um bot conversando com [@BotFather](https://t.me/BotFather) no Telegram (`/newbot`) e anote o token e o username.
2. Defina `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` e `TELEGRAM_WEBHOOK_SECRET` (qualquer string aleatória, ex: `openssl rand -hex 20`) nas variáveis de ambiente do servidor.
3. Registre o webhook apontando para a URL pública do servidor:
   ```bash
   npm run telegram:set-webhook -w server -- https://seu-dominio.com
   ```

A partir daí, cada organização vincula o próprio chat sozinha pela tela **Notificações** (menu Administração): basta abrir o link do bot mostrado na tela e tocar em "Iniciar". Sem nenhuma dessas variáveis configuradas, a feature fica simplesmente desativada (o resto do app funciona normal).

## Notificações via WhatsApp (não oficial)

Mesma ideia do Telegram (lembretes 1x/dia, sem duplicar), mas usando [whatsapp-web.js](https://wwebjs.dev) — não é a API oficial da Meta, então não exige verificação de negócio, mas roda como uma sessão real do WhatsApp Web (Chromium headless) e tem risco de banimento do número se usado para muito volume. Diferente do Telegram, é **uma sessão única e global**: um número (escaneado 1x via QR code) manda mensagem para o número que cada organização cadastrar.

Configuração:

1. Defina `WHATSAPP_ENABLED="true"` e `WHATSAPP_SESSION_PATH` apontando para um caminho persistente (ex: dentro do volume montado, `/data/whatsapp-session`) — sem isso a sessão se perde a cada deploy e pede pra escanear o QR de novo.
2. Garanta que o `puppeteer` consegue baixar o próprio Chromium no build (não setar `PUPPETEER_EXECUTABLE_PATH`). O `chromium` instalável via `apt`/Nix em imagens Ubuntu costuma ser só um stub que exige snap — não funciona em container — então o caminho mais confiável é deixar o puppeteer baixar o dele mesmo; ver [`nixpacks.toml`](nixpacks.toml) (`PUPPETEER_SKIP_DOWNLOAD="false"`).
3. Suba o servidor e abra a tela **Notificações** (menu Administração): enquanto a sessão não conecta, ela mostra o QR code ali mesmo. Escaneie com o WhatsApp do número que vai ser o remetente (Aparelhos conectados → Conectar um aparelho).
4. Cada organização cadastra, na mesma tela, o número (com DDD) que deve receber os avisos dela.

Sem `WHATSAPP_ENABLED="true"`, a feature fica desativada e o resto do app funciona normal — os lembretes por Telegram (se configurado) continuam funcionando independente disso.

## Estrutura do projeto

```
.
├── server/   # API Fastify + Prisma + SQLite (ver server/README.md)
├── web/      # Frontend React + Vite
├── shared/   # Schemas zod e tipos compartilhados
└── docs/     # Spec e plano de implementação (docs/superpowers)
```
