# Deploy na Railway

Guia para hospedar o app (server Fastify + frontend `web/dist` + SQLite) na Railway.

## Status atual

✅ Em produção desde 2026-06-14:

- URL: gerada pela Railway (Settings → Networking → Generate Domain) — ver painel do
  projeto para o domínio atual.
- Projeto Railway: ambiente "production" → serviço único
  `@fluxo/server` (Root Directory = raiz do repo)
- Volume `@fluxo/server-volume` montado em `/data` (onde mora `fluxo.db`)
- Seed de demo executado uma vez (`npm run db:seed -w server` via aba Console)
- Login: usuários demo criados pelo seed (ver README) — usuários reais adicionais são
  criados via `/usuarios` com senha própria, não documentada aqui.

## Custo esperado

A Railway não tem mais um free tier permanente: contas novas recebem um crédito de teste
único (uso limitado), e depois disso o plano **Hobby (~US$5/mês, já inclui US$5 de uso)**
costuma cobrir tranquilamente um app deste tamanho (1 processo Fastify pequeno + SQLite +
pouco tráfego). Piso realista: **~US$5/mês**.

Alternativas "gratuitas" (Render free, Fly free) não encaixam bem aqui porque não oferecem
disco persistente no tier free, e esta app depende do arquivo SQLite persistir entre
deploys/restarts.

## Pré-requisitos

- Conta na Railway conectada ao GitHub, com acesso ao repo privado `Linykercs/fluxo-de-caixa`.

## Passo a passo

### 1. Criar o projeto

- Railway → **New Project** → **Deploy from GitHub repo**.
- Autorizar o Railway GitHub App e dar acesso ao repo `Linykercs/fluxo-de-caixa`.
- Branch `main`. **Não** configurar "Root Directory" — deixar a raiz do monorepo
  (`npm run build` / `npm start` da raiz já cuidam dos workspaces `shared`/`server`/`web`).

### 1b. Se a Railway criar dois serviços (`@fluxo/server` e `@fluxo/web`)

A Railway pode detectar os `package.json` dos workspaces e propor um serviço para
cada um. Esse repo está preparado para **um único serviço** (o `server` entrega o
build do `web` na mesma origem via `@fastify/static`) — dois serviços exigiriam CORS
cruzado e `VITE_API_URL`, o que não está configurado.

- Remova o serviço `@fluxo/web` antes de aplicar/deployar.
- No serviço restante (`@fluxo/server`), em **Settings → Source**, confirme que o
  **Root Directory está vazio/raiz do repo** (não `server`) — é de lá que vêm os
  scripts `build`/`start` que orquestram os três workspaces.

### 2. Variáveis de ambiente

Em **Variables**, definir:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `JWT_SECRET` | segredo longo e aleatório (gerar com o comando abaixo) |
| `DATABASE_URL` | `file:/data/fluxo.db` |

Gerar o `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Não é necessário setar `PORT` (a Railway injeta a sua própria e `server/src/lib/config.ts`
já lê `process.env.PORT`) nem `CORS_ORIGIN` (server e frontend ficam na mesma origem em
produção, via `@fastify/static`).

### 3. Volume persistente

- **Settings → Volumes** → criar volume montado em `/data`.
- É onde o `fluxo.db` vai morar — sem isso, os dados somem a cada redeploy.

### 4. Build/start command (via `railway.json`)

O repo já tem um `railway.json` na raiz:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run db:migrate && npm start"
  }
}
```

Com o Root Directory na raiz (passo 1b), a Railway aplica esse arquivo automaticamente —
em **Settings → Build** e **Settings → Deploy** os campos aparecem preenchidos e
marcados como "The value is set in `/railway.json`".

⚠️ **`railway.json` tem precedência sobre o dashboard.** Esses campos ficam read-only —
editar "Build Command"/"Start Command" diretamente no dashboard não tem efeito enquanto o
`railway.json` existir. Para mudar, edite o arquivo e faça push.

`npm run db:migrate` aplica migrations pendentes (idempotente — imprime
`No pending migrations.` quando não há nada novo) antes de cada boot.

### 5. Deploy

- Acompanhar os logs: deve aparecer `Migration applied: ...` ou `No pending migrations.`,
  seguido do log do Fastify indicando que o server está no ar.

### 6. Popular dados de teste (uma vez só)

Migrations já criaram o schema (parte do start command); o seed popula os dados de demo.

- **Aba "Console" do serviço** (mais simples, já dentro do container):

  ```
  npm run db:seed -w server
  ```

- Alternativa via CLI, de fora:

  ```bash
  npm i -g @railway/cli
  railway login
  railway link        # selecionar este projeto
  railway run npm run db:seed -w server
  ```

`db:seed` roda `prisma db seed`, que **apaga e recria** os dados de demo (42 lançamentos,
17 baixas, 2 recorrências, 1 transferência, usuários `ana@empresa.com.br` /
`bruno@empresa.com.br`). Rodar de novo é seguro enquanto só houver dados demo — não rodar
depois que existirem dados reais.

### 7. Gerar domínio e testar

- **Settings → Networking → Generate Domain** → gera uma URL `https://....up.railway.app`
  com TLS automático.
- Abrir a URL e logar com `ana@empresa.com.br` ou `bruno@empresa.com.br`, senha `senha123`.

### 8. Criar usuário real (opcional)

Depois do seed, qualquer usuário autenticado pode criar outros usuários na mesma
organização pela tela **/usuarios** (nome, e-mail, senha ≥ 8 caracteres) — ou via
`POST /users` direto. Ainda não existe papel/admin: todo usuário da organização pode
criar outros.

### 9. Criar uma nova organização

Para onboar uma empresa diferente no mesmo banco de dados, use o script
`create-organization` via **aba Console** do serviço na Railway:

```
npm run org:create -w server -- \
  --org "Nome da Empresa" \
  --name "Nome do Usuário" \
  --email "usuario@empresa.com" \
  --password "senhainicial123"
```

O script:
- Valida os argumentos (org: 2–120 chars; senha: mín. 8 chars; e-mail válido).
- Cria a organização e o usuário owner em uma única transação — se qualquer passo
  falhar, nada é persistido.
- Imprime o id da organização e o e-mail do usuário criado.
- Sai com código 1 e imprime a mensagem de erro se o e-mail já existir ou a validação
  falhar.

Após criar a organização, o usuário owner pode fazer login normalmente e criar outros
usuários da mesma organização via **/usuarios**.

## Troubleshooting

- **Build falha por versão do Node** (ex.: `Prisma only supports Node.js versions
  20.19+, 22.12+, 24.0+`, mas a imagem usa Node 18): o `package.json` da raiz já fixa
  `"engines": {"node": ">=22.12 <23.0.0"}` — o Nixpacks lê isso para escolher a versão.
- **`EBUSY: resource busy or locked, rmdir '.../node_modules/.cache'` no build**: o
  Nixpacks já roda `npm ci` na fase "install"; um Build Command customizado não deve
  repetir `npm ci` (por isso `railway.json` usa só `npm run build`).
- **Editei "Build/Start Command" no dashboard e não fez efeito**: ver nota no passo 4 —
  `railway.json` tem precedência sobre o dashboard.

## Próximos passos (opcional)

- Domínio próprio (Networking → Custom Domain).
- Avaliar papel/admin antes de deixar `/usuarios` aberto para usuários não confiáveis
  (hoje todo usuário da organização pode criar outros).
- Decidir o que fazer com os usuários demo `ana@empresa.com.br` / `bruno@empresa.com.br`
  (continuam existindo — os lançamentos demo referenciam o `userId` deles).
