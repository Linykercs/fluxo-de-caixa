# Codex Handoff

Este arquivo registra as alteracoes feitas pelo Codex para que outro agente ou desenvolvedor consiga continuar sem depender do historico do chat.

## Contexto

- Repositorio: `Linykercs/fluxo-de-caixa`
- Branch local: `main`
- Commit base inspecionado: `aea6fecb956774f699844123da3d7879a86fdc9d`
- GitHub: repositorio privado, acesso confirmado via `gh` com permissao `ADMIN`

## Alteracoes feitas

### 1. Scripts de banco sem `prisma migrate`

O comando oficial do Prisma estava falhando neste ambiente:

```text
prisma migrate dev
prisma migrate deploy
prisma migrate status
```

Erro observado:

```text
Error: Schema engine error:
```

Como `npx prisma validate`, `npx prisma generate` e as migrations SQL estavam validas, adicionei scripts locais para aplicar as migrations SQL diretamente no SQLite:

- `server/scripts/apply-migrations.ts`
  - Le `server/prisma/migrations/*/migration.sql`
  - Aplica migrations ainda nao registradas
  - Registra execucao em `_fluxo_migrations`
  - Pode ser reexecutado; se nao houver pendencias, imprime `No pending migrations.`

- `server/scripts/reset-db.ts`
  - Remove o banco SQLite local e arquivos auxiliares (`-journal`, `-wal`, `-shm`)
  - Reaplica as migrations via `applyMigrations`

Scripts alterados em `server/package.json`:

```json
{
  "db:migrate": "tsx scripts/apply-migrations.ts",
  "db:reset": "tsx scripts/reset-db.ts && prisma db seed"
}
```

### 2. Flakiness nos testes SQLite temporarios

O helper `server/test/helpers/db.ts` apagava todos os arquivos de `.tmp-test` no inicio de cada `createTestDb()`.

Isso causava falha intermitente em execucao paralela do Vitest, porque uma suite podia apagar o banco temporario de outra suite que ainda estava inicializando.

Alteracao feita:

- `createTestDb()` agora cria um arquivo unico por suite e nao limpa a pasta inteira no inicio.
- `cleanup()` remove apenas o proprio banco e seus arquivos auxiliares (`-journal`, `-wal`, `-shm`).

## Validacoes executadas

Passaram:

```text
npm ci
npm run db:reset -w server
npm run db:migrate -w server
npx tsx scripts/check-seed.ts
npm test
npm run typecheck
npm run build -w web
npx prisma validate
npx prisma generate
git diff --check
```

Resultados importantes:

- Testes: 13 arquivos, 116 testes passando
- Typecheck: `shared`, `server`, `web` OK
- Build web: OK
- Seed: 42 entries, 17 settlements, 19 movements, 2 recorrencias, 1 transferencia
- `db:migrate` apos reset: `No pending migrations.`

## Pendencias conhecidas

### Contexto recebido do Claude (`43FD-D420`)

O usuario informou que a ultima conversa com o Claude terminou com estes pontos:

- Pelo plano/spec, o projeto estava considerado completo: 10 fases, verificacao final, typecheck, reset e 116/116 testes no `main`.
- Claude identificou um detalhe cosmetico no seed/demo:
  - `server/prisma/seed.ts` cria `Movement.createdAt` com `toDate(data)`, que representa meia-noite UTC.
  - Ao converter para dia em Sao Paulo, uma data como `2026-06-15T00:00:00Z` vira `2026-06-14` em SP.
  - Isso pode afetar bordas de filtro do extrato em dados de demonstracao.
  - Painel e relatorios nao sao afetados porque usam `dueDate`, `settledAt` e `competenceMonth`.
  - Dados reais criados pela API usam `now()` e nao sofrem esse problema.
- Claude sugeriu trocar o seed para usar `spDayStart(data)` no `createdAt` dos movements, caso o usuario queira deixar os dados demo 100% consistentes.
- Resolvido pelo Codex: `server/prisma/seed.ts` agora usa `movementDay()`/`spDayStart()` para `Movement.createdAt` das baixas, estornos e transferencias demo.
- O usuario perguntou sobre hospedagem e uso usual do projeto.
- Decisao do usuario:
  - Agora sera usado por uma empresa.
  - No futuro pretende escalar para varias empresas/clientes.

Implicacao para proximas decisoes:

- Para curto prazo, manter simplicidade operacional para uma empresa.
- Para medio prazo, evitar escolhas que bloqueiem multiempresa/SaaS.
- A hospedagem recomendada deve considerar caminho incremental: app unico primeiro, depois evolucao para banco gerenciado e isolamento por organizacao.

### `npm audit`

Ainda existem 9 vulnerabilidades reportadas pelo `npm audit`:

- 3 moderadas
- 6 altas

Pacotes envolvidos principalmente:

- `vite`
- `vitest`
- `@vitejs/plugin-react`
- `esbuild`
- `prisma`

O `npm audit fix --force` sugere mudancas major (`vite@8`, `vitest@4`, `@vitejs/plugin-react@6`) e downgrade/mudanca de linha para `prisma@6.19.3`. Nao apliquei automaticamente porque isso merece uma rodada propria de upgrade com validacao.

## Estado Git esperado apos estas alteracoes

```text
M  server/package.json
M  server/test/helpers/db.ts
?? server/scripts/apply-migrations.ts
?? server/scripts/reset-db.ts
?? docs/codex-handoff.md
```

## Combinado operacional

A partir deste ponto, o Codex deve comentar no chat toda acao relevante antes de executa-la e atualizar este arquivo quando fizer alteracoes que outro agente precise conhecer.

## Proximo passo iniciado pelo Codex

O usuario autorizou comecar pela ordem sugerida:

1. Commitar as correcoes ja verdes.
2. Preparar o projeto para deploy.
3. Tratar `npm audit` em rodada separada.
4. Criar gestao minima de usuarios.

Primeira acao em andamento: criar um commit separado com:

- `server/package.json`
- `server/scripts/apply-migrations.ts`
- `server/scripts/reset-db.ts`
- `server/test/helpers/db.ts`
- `server/prisma/seed.ts`
- `docs/codex-handoff.md`

Ultima validacao antes desta etapa:

- `npm run db:reset -w server`: OK
- `npx tsx scripts/check-seed.ts`: OK
- `npm test`: 116/116 OK
- `npm run typecheck`: OK

Status:

- Commit local criado: `afd7943 fix: stabilize local db setup`
- Commit publicado no GitHub em `origin/main`

## Etapa deploy-ready iniciada

Proxima frente do Codex:

- Permitir que o `server` Fastify sirva o build estatico do `web` em producao.
- Adicionar configuracao de ambiente para producao.
- Documentar o fluxo de deploy/execucao.
- Validar com build, seed, testes e typecheck.

Alteracoes em andamento nesta etapa:

- Instalado `@fastify/static` no workspace `server`.
- `server/src/app.ts` passou a servir `web/dist` quando `SERVE_WEB=true` ou `NODE_ENV=production`.
- `web/src/api/client.ts` agora usa:
  - `VITE_API_URL`, se definido;
  - `http://127.0.0.1:3333` em dev;
  - mesma origem em production.
- `package.json` raiz ganhou scripts `build`, `start`, `db:migrate` e `db:reset`.
- Criado `server/.env.production.example`.
- README recebeu secao de build/execucao em producao e orientacao de banco persistente.

Validacoes da etapa deploy-ready:

- `npm run db:reset -w server`: OK
- `npx tsx scripts/check-seed.ts` em `server`: OK
- `npm run typecheck`: OK
- `npm run build`: OK
- `npm test`: 13 arquivos, 116 testes OK
- Smoke production local:
  - `NODE_ENV=production`
  - `SERVE_WEB` implicito por production
  - `GET /health`: `ok`
  - `GET /`: HTML do Vite servido com `<div id="root"></div>` e assets em `/assets/`

Observacao:

- `.gitignore` foi ajustado para permitir versionar `server/.env.production.example`, mantendo arquivos reais `.env.*` ignorados.
- `npm audit --json` continua reportando 9 vulnerabilidades:
  - 3 moderadas
  - 6 altas
  - principais pacotes: `vite`, `vitest`, `@vitejs/plugin-react`, `esbuild`, `prisma`
  - nao foi aplicado `npm audit fix --force` porque exige upgrades major/downgrade de linha do Prisma e deve virar uma rodada propria.

Status:

- Commit criado e publicado no GitHub: `8a5b6f6 feat: prepare production deployment`
- `origin/main` contem os commits `afd7943` e `8a5b6f6`.

## Etapa gestao minima de usuarios implementada

Objetivo:

- Remover a dependencia de editar seed/Prisma Studio para criar novos usuarios.
- Manter escopo conservador para uma empresa: usuario logado cria/lista usuarios da propria organizacao.
- Nao abrir signup publico e nao introduzir multiempresa/SaaS nesta etapa.

Alteracoes:

- `shared/src/schemas/users.ts` com `createUserSchema`.
- `shared/src/schemas/auth.ts` agora normaliza e-mail de login com trim/lowercase.
- `server/src/services/users.ts` lista/cria usuarios sem expor `passwordHash`.
- `server/src/routes/users.ts` adiciona `GET /users` e `POST /users`, ambos protegidos pela sessao existente.
- `server/src/app.ts` registra `usersRoutes` e inclui `/users` nos prefixos de API.
- `server/test/http/users.test.ts` cobre autenticacao, isolamento por organizacao, criacao, login do novo usuario, duplicidade e senha minima.
- `web/src/api/users.ts`, `web/src/pages/UsersPage.tsx`, `web/src/App.tsx` e `web/src/components/Sidebar.tsx` adicionam a tela `/usuarios`.

Limite conhecido:

- Ainda nao existe papel/admin no modelo. Enquanto isso, qualquer usuario autenticado da organizacao consegue criar outro usuario. Para o uso inicial de uma empresa pequena isso resolve operacao; antes de virar SaaS, adicionar roles/permissoes.

Validacoes:

- `npm test -w server -- users.test.ts auth.test.ts`: 2 arquivos, 14 testes OK
- `npm run typecheck`: OK
- `npm run build`: OK
- `npm test`: 14 arquivos, 121 testes OK

## Etapa audit parcial implementada

Objetivo:

- Reduzir vulnerabilidades sem aplicar `npm audit fix --force` cegamente.
- Evitar downgrade de Prisma 7 para Prisma 6 enquanto o projeto usa recursos da linha 7 (`prisma/config`, generator `prisma-client`, adapter libSQL v7).

Alteracoes:

- `web/package.json` atualizado para:
  - `vite@^8.0.16`
  - `@vitejs/plugin-react@^6.0.2`
- `server/package.json` atualizado para:
  - `vitest@^4.1.8`
- `package-lock.json` recalculado.

Resultado do audit:

- Antes: 9 vulnerabilidades
  - 3 moderadas
  - 6 altas
- Depois: 3 vulnerabilidades
  - 3 moderadas
  - 0 altas
- Restante:
  - `prisma@7.8.0` -> `@prisma/dev@0.24.3` -> `@hono/node-server@1.19.11`
  - O `npm audit` sugere `prisma@6.19.3` como fix, tratado como breaking/downgrade de linha.

Tentativa descartada:

- Foi testado `overrides` para forcar `@hono/node-server@2.0.4`, mas `npm ls @hono/node-server --all` continuou mostrando `@hono/node-server@1.19.11` sob `@prisma/dev`. O override foi removido para nao deixar configuracao inefetiva.

Validacoes:

- `npx prisma validate`: OK
- `npx prisma generate`: OK
- `npm run typecheck`: OK
- `npm run build`: OK
- `npm test`: 14 arquivos, 121 testes OK

Proximo passo recomendado:

- Manter Prisma 7 por enquanto e acompanhar uma versao Prisma 7 corrigida.
- Se for exigencia zerar audit imediatamente, fazer uma branch propria de downgrade para Prisma 6.19.3 e validar especialmente generator, adapter libSQL, `prisma.config.ts`, seed, migrations e testes.

## Etapa deploy Railway (Claude) - app em producao

Objetivo:

- Hospedar o app na Railway: 1 servico Fastify servindo API + `web/dist` + SQLite em
  volume persistente.

Arquivos novos/alterados (no repo):

- `railway.json` (novo, raiz) - config-as-code:

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

- `package.json` (raiz) - adicionado `"engines": {"node": ">=22.12 <23.0.0"}` (Prisma 7
  exige Node >=20.19/22.12/24; Nixpacks le `engines.node` para escolher a versao do Node
  na imagem de build).
- `docs/deploy-railway.md` (novo) - guia passo a passo completo, com secao de
  troubleshooting cobrindo os problemas abaixo.

Descobertas importantes (relevantes para qualquer agente que for tocar config Railway):

- `railway.json` tem PRECEDENCIA sobre os campos do dashboard (Settings -> Build,
  Settings -> Deploy). Com Root Directory na raiz, a Railway aplica esse arquivo e os
  campos do dashboard ficam read-only ("The value is set in /railway.json"). Editar via
  dashboard nao tem efeito - tem que editar `railway.json` e dar push.
- Nixpacks ja roda `npm ci` na fase "install"; um Build Command customizado nao deve
  repetir `npm ci` (causa `EBUSY: resource busy or locked, rmdir
  '/app/node_modules/.cache'`).

Configuracao feita no dashboard Railway (fora do repo, nao versionada - registrado aqui
para referencia):

- Projeto "zooming-presence", ambiente "production", servico unico `@fluxo/server`
  (Root Directory vazio = raiz do repo).
- Variables: `NODE_ENV=production`, `HOST=0.0.0.0`, `JWT_SECRET=<gerado, nao
  documentado aqui por seguranca>`, `DATABASE_URL=file:/data/fluxo.db`.
- Volume `@fluxo/server-volume` montado em `/data`, anexado a `@fluxo/server`.
- Healthcheck Path: `/health`.
- Dominio publico: gerado pela Railway (Networking -> Generate Domain); ver painel do
  projeto para a URL atual.

Estado do banco em producao:

- Migrations aplicadas pelo start command (`npm run db:migrate && npm start`).
- Seed executado uma vez via aba "Console" do servico: `npm run db:seed -w server` ->
  42 entries, 17 settlements, 19 movements, 2 recorrencias, 1 transferencia. Usuarios
  demo: `ana@empresa.com.br` / `bruno@empresa.com.br`, senha `senha123`.
- Usuario adicional criado via `POST /users` (mesmo endpoint da tela `/usuarios`), para
  uso real do dono do projeto (e-mail e senha nao documentados aqui por seguranca), mesma
  organizacao "Oficina Criativa Ltda" dos dados demo. Login confirmado por curl.

Validacao final (build log Railway):

- `npm ci` (install): OK
- `npm run build`: "built in 2.35s", OK
- Imagem publicada (398.1MB)
- `Healthcheck succeeded` em `/health`

Status:

- App no ar e acessivel publicamente na URL acima.
- Commits no `origin/main` cobrindo: `railway.json`, `engines.node` em `package.json`,
  `docs/deploy-railway.md`.

Pendente / sugestoes para proxima etapa:

- Avaliar papel/admin antes de deixar `/usuarios` aberto (hoje qualquer usuario
  autenticado da org pode criar outro usuario - ver limite ja registrado na etapa
  "gestao minima de usuarios").
- Decidir o que fazer com os usuarios demo `ana`/`bruno` (settlements/movements/
  transfers demo referenciam o `userId` deles - remover exigiria ajustar o seed).
- Dominio proprio (Networking -> Custom Domain), opcional.
- `db:seed` apaga e recria os dados demo (`wipe()`); nao rodar de novo em producao real
  depois que existirem dados de verdade do usuario real.

## Etapa Fase 11 implementada (Claude)

Objetivo:

- Implementar as 5 melhorias da Fase 11 descritas em
  `docs/superpowers/specs/2026-06-14-fase-11-melhorias-design.md` e
  `docs/superpowers/plans/2026-06-14-fase-11-melhorias-plan.md` (F4, F1, F3,
  F5, F6 - rotulo Fornecedor/Cliente, projecao com 2 barras, centro de custo,
  popup de detalhe do mes + relatorio por contraparte, DRE e fechamento de
  mes).

Alteracoes (resumo por fase):

1. F4 - Rotulo Fornecedor/Cliente: `web/src/lib/counterparty.ts` (novo) com
   `counterpartyLabel(direction)`; usado nos formularios e modais de
   lancamento (`SingleEntryForm`, `InstallmentsEntryForm`,
   `RecurrenceEntryForm`, `EditEntryModal`, `EntryDetailModal`,
   `RecurrenceScopeModal`).
2. F1 - Projecao do painel com 2 barras: `web/src/pages/DashboardPage.tsx` e
   `web/src/styles/layout.css` passam a mostrar a pagar/a receber lado a lado
   por mes na projecao.
3. F3 - Centro de custo:
   - Backend: model `CostCenter` (migration
     `server/prisma/migrations/20260614214954_add_cost_center`), campo
     opcional `costCenterId` em `Entry`, `shared/src/schemas/cost-centers.ts`,
     `server/src/services/cost-centers.ts`,
     `server/src/routes/cost-centers.ts` (CRUD com archive/unarchive),
     `server/test/http/cost-centers.test.ts`.
   - Frontend: `web/src/api/cost-centers.ts`,
     `web/src/components/cost-centers/*` (New/Edit modal), nova pagina
     `web/src/pages/CostCentersPage.tsx`, entrada no menu
     (`web/src/components/Sidebar.tsx`), select de centro de custo nos
     formularios de lancamento.
4. F5 - Popup de detalhe do mes nos relatorios:
   - `server/src/services/reports.ts` ganhou `byCounterpartyReport`; rota
     `GET /reports/by-counterparty`.
   - `web/src/components/reports/MonthDetailModal.tsx` (novo): ao clicar numa
     linha do fluxo de caixa mensal, abre popup com totais por categoria e
     por contraparte (previsto/realizado). Removido o card "Resumo por
     categoria" antigo de `ReportsPage.tsx`.
5. F6 - DRE e fechamento de mes:
   - `Organization.closedThroughMonth` (migration
     `server/prisma/migrations/20260615010657_add_closed_through_month`,
     aplicada via `npm run db:migrate` - nao via `prisma migrate dev`, que
     detectou drift de indices e pediria reset do `dev.db`).
   - `server/src/services/organizations.ts` (novo):
     `getClosedThroughMonth`/`setClosedThroughMonth`.
   - `assertPeriodOpen` em `server/src/services/entries.ts`, chamado em
     `createSingleEntry`, `createInstallments`, `updateEntry` e em
     `createRecurrence` (`server/src/services/recurrences.ts`); lanca
     `BusinessError("PERIOD_CLOSED")` -> HTTP 422
     `{code: "PERIOD_CLOSED", message: "..."}`. Settlements, estornos e
     transfers nao sao afetados.
   - `dreReport` em `server/src/services/reports.ts`; rotas
     `GET /reports/dre` e `POST /reports/close-period`
     (`server/src/routes/reports.ts`).
   - `server/test/period-close.test.ts` (novo, 12 testes) +
     `describe("dreReport", ...)` em `server/test/reports.test.ts` (3
     testes).
   - Frontend: `useDreReport`/`useClosePeriod` em `web/src/api/reports.ts`;
     `web/src/pages/ReportsPage.tsx` ganhou secao "DRE" com seletor de mes,
     tabelas Receitas/Despesas, "Resultado do mes" (verde/vermelho) e botao
     "Fechar mes" (com `window.confirm`, desabilitado se o mes ja estiver
     fechado).

Validacoes:

- `npm run typecheck`: OK (shared, server, web)
- `npm run build`: OK
- `npm test -w server`: 16 arquivos, 148/148 testes OK
- Smoke test manual via curl no dev server: `GET /reports/dre`,
  `POST /reports/close-period` (fechar/reabrir), e confirmacao de que criar
  lancamento em mes fechado retorna 422 `PERIOD_CLOSED` com a mensagem
  exibida pelo `ApiError`/`formError` ja existente nos formularios.

Estado do `dev.db` local (nao versionado, fora do repo):

- `Organization.closedThroughMonth = "2026-06"` (definido durante o smoke
  test desta etapa, para a organizacao demo "Oficina Criativa Ltda").

Status:

- Commit unico cobrindo as 7 fases da Fase 11, publicado em `origin/main`.

## Etapa importacao de extrato OFX implementada (Claude)

Objetivo:

- Implementar a feature "Importacao de extrato OFX" descrita em
  `docs/superpowers/specs/2026-06-15-importacao-ofx-design.md` e
  `docs/superpowers/plans/2026-06-15-importacao-ofx-plan.md` (3 fases: modelo
  de dados + parsing + matching; API preview/confirm; frontend).

Alteracoes (resumo por fase):

1. Fase 1 - Modelo de dados + parsing + matching:
   - `Settlement.importFitid` (nullable, unique composto em
     `[bankAccountId, importFitid]`) via migration
     `server/prisma/migrations/20260615120000_add_settlement_import_fitid`.
   - `server/src/services/ofx-parser.ts` (novo): parser de extrato OFX
     (formato SGML).
   - `server/src/services/bank-import.ts` (novo): `previewImport` (matching
     por valor exato + janela de 5 dias de vencimento -> status
     `duplicate`/`matched`/`ambiguous`/`unmatched`) e `confirmImportRow`
     (acoes `settle`/`create`/`ignore`, dedup por `importFitid`).
   - `shared/src/schemas/bank-import.ts` (novo): `importConfirmRowSchema`
     (discriminated union `settle`/`create`/`ignore`) e
     `importConfirmSchema`.
   - `server/src/services/settlements.ts`: `settleEntry`/`settleEntryTx`
     passam a aceitar `importFitid` opcional; erro `P2002` nesse campo
     mapeado para `BusinessError("IMPORT_FITID_ALREADY_USED", ...)`.
   - Testes: `server/test/ofx-parser.test.ts`, `server/test/bank-import.test.ts`,
     fixture real `server/test/fixtures/itau-extrato.ofx`.

2. Fase 2 - API preview/confirm:
   - `@fastify/multipart` registrado em `server/src/app.ts`.
   - `server/src/routes/bank-import.ts` (novo):
     `POST /bank-accounts/:id/import/preview` (multipart, retorna
     `ImportPreviewRow[]`, nao persiste nada) e
     `POST /bank-accounts/:id/import/confirm` (JSON `ImportConfirmRow[]`,
     retorna `ImportConfirmResult[]`).
   - Testes HTTP: `server/test/http/bank-import.test.ts`.

3. Fase 3 - Frontend "Importar extrato":
   - `web/src/api/client.ts`: `apiFetch` aceita `FormData` (nao define
     `Content-Type` manualmente nesse caso, deixando o browser setar o
     boundary multipart).
   - `web/src/api/types.ts`: `ImportPreviewRow`, `ImportCandidate`,
     `ImportConfirmResult`, `ImportRowStatus`, `ImportConfirmStatus`
     (`ImportConfirmRow` e importado de `@fluxo/shared`).
   - `web/src/api/bank-import.ts` (novo): `usePreviewImport`/`useConfirmImport`
     (este ultimo invalida `bank-accounts`, `statement`, `entries`,
     `dashboard`).
   - `web/src/pages/ImportStatementPage.tsx` (novo): fluxo upload -> revisao
     (tabela Data/Descricao/Valor/Destino, controles por status) ->
     confirmacao, com resultado por linha e linhas com erro reenviaveis.
   - Navegacao: `/importar-extrato` em `Sidebar.tsx` e `App.tsx`.
   - `web/src/styles/layout.css`: novas classes `.import-*`.

Validacoes:

- `npm test -w server`: 157/157 testes OK (Fases 1-2).
- `npm run typecheck`: OK (shared, server, web).
- Smoke test manual via HTTP (curl) contra o `dev.db` real, sem navegador
  disponivel no ambiente:
  - `dev.db` estava desatualizado (faltava a migration
    `20260615120000_add_settlement_import_fitid`, porque o sync local usa
    `npm run db:migrate -w server` / `db:reset`, nao `prisma migrate`).
    Corrigido aplicando `npm run db:migrate -w server`.
  - `POST /bank-accounts/:id/import/preview` com
    `server/test/fixtures/itau-extrato.ofx` (conta "Itau PJ", usuario
    `ana@empresa.com.br`) -> 4 transacoes, todas `unmatched` (nenhum
    lancamento aberto bate com esses valores no seed).
  - `POST /bank-accounts/:id/import/confirm` com `action: "create"` nas 4
    linhas -> todas `status: "created"`; entries apareceram em `/payables` e
    `/receivables` com categorias corretas e `status: "SETTLED"`; saldo
    "Itau PJ" atualizado de 1.038.334 para 1.003.334 (delta -350,00 = liquido
    do extrato).
  - Reimport do mesmo arquivo -> as 4 linhas voltam como `duplicate`
    ("Ja importado"), confirmando o dedup por `importFitid`.
  - Caminhos `matched`/`ambiguous`/`settle` ja cobertos pelos testes
    automatizados das Fases 1-2; UI desses caminhos validada por leitura de
    codigo + typecheck (sem navegador).

Estado do `dev.db` local (nao versionado, fora do repo):

- Apos o smoke test, `dev.db` foi resetado e reseedado
  (`npm run db:reset -w server`), removendo os 4 lancamentos de teste
  criados durante a validacao manual. Estado atual = seed padrao (42
  entries, 17 settlements, 19 movements, 2 recorrencias, 1 transferencia).

Status:

- Commit unico publicado em `origin/main`:
  `c05906c feat: implementa importacao de extrato OFX (Fases 1-3)`.
