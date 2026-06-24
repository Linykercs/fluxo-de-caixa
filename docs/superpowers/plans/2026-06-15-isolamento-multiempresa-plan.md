# Plano: Isolamento multiempresa e onboarding de nova organização

Spec: `docs/superpowers/specs/2026-06-15-isolamento-multiempresa-design.md`

Ordem: Fase A (isolamento) primeiro, dividida em 3 fases do plano (1-3) por
domínio, cada uma terminando com `npm test -w server` verde e adicionando sua
fatia da matriz de isolamento (spec §3.3) ao mesmo arquivo
`server/test/http/org-isolation.test.ts`. Depois Fase C (plano: fase 4) e
Fase B (plano: fase 5), conforme spec §6.

## Phase 1: Entries & Recurrences — isolamento de organização + infra de teste

Goal: `entries.ts` e `recurrences.ts` (services + rotas) filtram por
`organizationId`; infraestrutura para testes com 2 organizações criada;
primeira fatia da matriz de isolamento passa.

Tasks:
- [ ] **`server/src/services/entries.ts`** — `getEntryOrThrow(db, entryId)` →
  `getEntryOrThrow(db, organizationId, entryId)`; `assertCategoryMatches(db,
  categoryId, direction)` → `assertCategoryMatches(db, organizationId,
  categoryId, direction)`; `updateEntry(db, entryId, changes)` →
  `updateEntry(db, organizationId, entryId, changes)`; `deleteEntry(db,
  entryId)` → `deleteEntry(db, organizationId, entryId)`. Todas trocam
  `findUnique`/`findFirst` sem filtro por `findFirst` com `organizationId` (404
  via `NotFoundError` se não achar). `createSingleEntry`/`createInstallments`
  passam `input.organizationId` para `assertCategoryMatches`.
  Done quando: compila e os testes de service que chamam essas funções
  (`server/test/entry-edit.test.ts`, `server/test/installments.test.ts`,
  `server/test/entry-derived.test.ts`, `server/test/period-close.test.ts`)
  atualizados para passar `organizationId` (de `fx.org.id`) continuam
  passando.

- [ ] **`server/src/services/recurrences.ts`** — `createRecurrence` passa
  `input.organizationId` para `assertCategoryMatches`. `updateRecurrenceFromEntry`
  (3 assinaturas sobrecarregadas + implementação) ganha `organizationId:
  string` no `input`; o `tx.entry.findFirst({ where: { id: input.entryId,
  deletedAt: null }, ... })` ganha `organizationId: input.organizationId`; a
  chamada a `assertCategoryMatches` (quando `changes.categoryId` definido)
  passa `entry.organizationId`. `cancelRecurrence(prisma, recurrenceId,
  today)` → `cancelRecurrence(prisma, organizationId, recurrenceId, today)`;
  `tx.recurrence.findUnique({ where: { id: recurrenceId } })` → `findFirst`
  com `organizationId` (sem rota chamando — corrigido por consistência, ver
  spec §3.2).
  Done quando: `server/test/recurrences.test.ts` atualizado para passar
  `organizationId` (de `fx.org.id`) em `updateRecurrenceFromEntry` e
  `cancelRecurrence`, e passa.

- [ ] **`server/src/routes/entries.ts`** — `GET /entries/:id`, `PATCH
  /entries/:id`, `DELETE /entries/:id` e `PATCH
  /entries/:id/recurrence-scope` extraem `const organizationId =
  request.user.organizationId` e repassam para `getEntryOrThrow`,
  `updateEntry`, `deleteEntry`, `updateRecurrenceFromEntry`.
  Done quando: `server/test/http/entries.test.ts` continua passando.

- [ ] **Fixture de 2ª organização** — em `server/test/helpers/db.ts`, nova
  função `makeFullFixture(prisma, name)`: chama `makeFixture(prisma)` (renomeando
  a org criada para `name`) e adiciona 1 `CostCenter`, 1 `Entry` em aberto
  (PAYABLE, sem baixa), 1 `Entry` (RECEIVABLE) com 1 `Settlement` ativa, e 1
  `Recurrence` com sua entry materializada (mês corrente). Retorna tudo (campos
  de `makeFixture` + `costCenter`, `openEntry`, `settledEntry`, `settlement`,
  `recurrence`, `recurrenceEntry`). Não altera `makeFixture` — testes
  existentes inalterados.
  Done quando: tipado e chamável; `npm run typecheck -w server` passa.

- [ ] **`server/test/http/org-isolation.test.ts` (novo)** — setup: `const ctx
  = await setupHttpTest()` (org A autenticada) + `const orgB = await
  makeFullFixture(ctx.db.prisma, "Org B")`. Casos (autenticado como org A,
  usando IDs de `orgB`):
  - `GET /entries/:id` (orgB.openEntry.id) → 404
  - `PATCH /entries/:id` (orgB.openEntry.id) → 404
  - `DELETE /entries/:id` (orgB.openEntry.id) → 404
  - `PATCH /entries/:id/recurrence-scope` (orgB.recurrenceEntry.id) → 404
  Done quando: os 4 casos passam.

Verify: `npm test -w server` verde (suíte completa).

## Phase 2: Settlements, Transfers & Bank Accounts — isolamento de organização

Goal: `settlements.ts`, `transfers.ts` e `bank-accounts.ts` (services + rotas)
filtram por `organizationId`; matriz de isolamento ganha baixa/estorno/
transferência/conta.

Tasks:
- [ ] **`server/src/services/settlements.ts`** — `SettleEntryInput` e
  `ReverseSettlementInput` ganham `organizationId: string`. `settleEntryTx`
  usa `input.organizationId` em `getEntryOrThrow(tx, input.organizationId,
  input.entryId)` e troca `tx.bankAccount.findUnique({ where: { id:
  input.bankAccountId } })` por `findFirst` com `organizationId:
  input.organizationId`. `reverseSettlement` troca `tx.settlement.findUnique({
  where: { id: input.settlementId }, include: { entry: true } })` por
  `findFirst` com `organizationId: input.organizationId`.
  Done quando: `server/test/settle-reverse.test.ts` atualizado para passar
  `organizationId` (de `fx.org.id`) e passa.

- [ ] **`server/src/routes/settlements.ts`** — `POST /entries/:id/settle` e
  `POST /settlements/:id/reverse` passam `organizationId:
  request.user.organizationId` no input de `settleEntry`/`reverseSettlement`.
  Done quando: `server/test/http/settlements-transfers.test.ts` continua
  passando.

- [ ] **`server/src/services/transfers.ts`** — `createTransfer` já recebe
  `input.organizationId`; as duas chamadas `tx.bankAccount.findUnique({ where:
  { id: input.fromAccountId/toAccountId } })` → `findFirst` com
  `organizationId: input.organizationId` (404 se a conta não pertence à org).
  Done quando: `server/test/transfers.test.ts` continua passando.

- [ ] **`server/src/services/bank-accounts.ts`** — `getAccountBalanceCents(db,
  bankAccountId)` → `getAccountBalanceCents(db, organizationId,
  bankAccountId)`; `updateBankAccount(db, bankAccountId, changes)` →
  `updateBankAccount(db, organizationId, bankAccountId, changes)`;
  `getStatement(db, bankAccountId, opts)` → `getStatement(db, organizationId,
  bankAccountId, opts)`. As 3: `findUnique` → `findFirst` com
  `organizationId`. `listAccountsWithBalances` repassa seu `organizationId`
  para `getAccountBalanceCents`.
  Done quando: `npm run typecheck -w server` passa (sem teste de service
  dedicado a bank-accounts hoje).

- [ ] **`server/src/routes/bank-accounts.ts`** — `PATCH /bank-accounts/:id` e
  `GET /bank-accounts/:id/statement` passam `request.user.organizationId`
  como novo argumento para `updateBankAccount`/`getStatement`.
  Done quando: `npm run typecheck -w server` passa.

- [ ] **`org-isolation.test.ts`** — adiciona, autenticado como org A com IDs de
  `orgB`:
  - `POST /entries/:id/settle` em `orgB.openEntry.id` → 404
  - `POST /settlements/:id/reverse` em `orgB.settlement.id` → 404
  - `POST /transfers` com `fromAccountId`/`toAccountId` = contas de `orgB` →
    não-2xx (404/422, nunca cria a transferência)
  - `PATCH /bank-accounts/:id` em `orgB.account.id` → 404
  - `GET /bank-accounts/:id/statement` em `orgB.account.id` → 404
  Done quando: os 5 casos passam.

Verify: `npm test -w server` verde.

## Phase 3: Categories, Cost Centers & Bank Import — completa a Fase A

Goal: `categories.ts`, `cost-centers.ts` e `bank-import.ts` filtram por
`organizationId`; matriz completa de isolamento (12 cenários, spec §3.3)
passa.

Tasks:
- [ ] **`server/src/services/categories.ts`** — `updateCategory(db,
  categoryId, changes)` → `updateCategory(db, organizationId, categoryId,
  changes)`; `findUnique` → `findFirst` com `organizationId`.
  Done quando: `npm run typecheck -w server` passa.

- [ ] **`server/src/routes/categories.ts`** — `PATCH /categories/:id` passa
  `request.user.organizationId`.
  Done quando: `npm run typecheck -w server` passa.

- [ ] **`server/src/services/cost-centers.ts`** — `updateCostCenter(db,
  costCenterId, changes)` → `updateCostCenter(db, organizationId,
  costCenterId, changes)`; `findUnique` → `findFirst` com `organizationId`.
  **`server/src/routes/cost-centers.ts`** — `PATCH /cost-centers/:id` passa
  `request.user.organizationId`.
  Done quando: `server/test/http/cost-centers.test.ts` continua passando.

- [ ] **`server/src/routes/bank-import.ts`** — `getActiveBankAccount(app, id)`
  → `getActiveBankAccount(app, organizationId, id)`; `findUnique` →
  `findFirst` com `organizationId`. `POST /bank-accounts/:id/import/preview` e
  `/import/confirm` passam `request.user.organizationId`.
  **`server/src/services/bank-import.ts`** — em `confirmImportRow`, as 2
  chamadas a `settleEntry`/`settleEntryTx` passam `organizationId:
  params.organizationId` (campo novo de `SettleEntryInput`, da Fase 2).
  Done quando: `server/test/bank-import.test.ts` e
  `server/test/http/bank-import.test.ts` continuam passando.

- [ ] **`org-isolation.test.ts`** — completa a matriz, autenticado como org A
  com IDs/conta de `orgB`:
  - `PATCH /categories/:id` em `orgB.expenseCat.id` → 404
  - `PATCH /cost-centers/:id` em `orgB.costCenter.id` → 404
  - `POST /bank-accounts/:id/import/preview` em `orgB.account.id` (multipart
    com `server/test/fixtures/itau-extrato.ofx`) → 404
  - `POST /bank-accounts/:id/import/confirm` em `orgB.account.id` → 404
  Done quando: os 4 casos passam — matriz completa (12 cenários) verde.

Verify: `npm test -w server` verde (suíte completa, incluindo os 12 cenários
de `org-isolation.test.ts`); `npm run typecheck`.

## Phase 4: Endurecimento — rate limit, senha mínima, guard de wipe

Goal: Fase C completa — `/auth/login` com rate limit, senha mínima 8, scripts
de wipe protegidos em produção.

Tasks:
- [ ] **`@fastify/rate-limit`** — adicionar em `server/package.json`
  (dependencies). Em `server/src/app.ts`, `app.register(rateLimit, { max:
  100, timeWindow: "1 minute" })` como default global (registrado junto dos
  outros plugins, antes do sub-app protegido).
  Done quando: `npm install` resolve e `npm test -w server` continua verde.

- [ ] **`server/src/routes/auth.ts`** — `POST /auth/login` ganha `{ config: {
  rateLimit: { max: 5, timeWindow: "1 minute" } } }`.
  Done quando: novo teste em `server/test/http/auth.test.ts` — 6 requisições
  `POST /auth/login` seguidas (credenciais inválidas) → a 6ª retorna `429`.

- [ ] **`shared/src/schemas/users.ts`** — `password: z.string().min(6).max(120)`
  → `.min(8).max(120)`.
  Done quando: teste em `server/test/http/users.test.ts` — senha de 7
  caracteres em `POST /users` → `400`; senha `"senha123"` (8) continua
  aceita.

- [ ] **Guard contra wipe em produção** — novo `server/src/lib/db-guard.ts`
  exportando `assertDbWipeAllowed()`: lança `Error` com a mensagem da spec
  §5.3 se `process.env.NODE_ENV === "production" &&
  process.env.ALLOW_DB_WIPE !== "true"`. `server/prisma/seed.ts`: chama no
  início de `main()`, antes de `wipe()`. `server/scripts/reset-db.ts`: chama
  no início do módulo, antes de `removeSqliteFiles(databaseUrl)`.
  Done quando: novo `server/test/db-guard.test.ts` — com
  `NODE_ENV=production` e sem `ALLOW_DB_WIPE`, `assertDbWipeAllowed()` lança;
  com `ALLOW_DB_WIPE=true` ou `NODE_ENV` diferente de `"production"`, não
  lança.

Verify: `npm test -w server` verde; `npm run typecheck`.

## Phase 5: Script de provisionamento de organização

Goal: `create-organization.ts` cria uma 2ª organização + primeiro usuário em
transação; documentado para uso via Railway.

Tasks:
- [ ] **`shared/src/schemas/organizations.ts`** (novo) —
  ```ts
  export const createOrganizationSchema = z.object({
    name: z.string().trim().min(2).max(120),
  });
  export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
  ```
  Exportar em `shared/src/index.ts` (`export * from "./schemas/organizations.js"`).
  Done quando: `npm run typecheck -w shared` passa.

- [ ] **`server/src/services/organizations.ts`** (novo) —
  `createOrganizationWithOwner(prisma, input: { organizationName: string;
  name: string; email: string; password: string })`: verifica que `email` não
  está em uso (mesmo padrão/erro de `createUser` em
  `server/src/services/users.ts` para e-mail duplicado);
  `prisma.$transaction`: cria `Organization { name: organizationName }`, depois
  `User { organizationId, name, email, passwordHash: await argon2.hash(password)
  }`; retorna `{ organization, user }`.
  Done quando: novo `server/test/organizations.test.ts` — cria org+user com
  sucesso (organização e usuário persistidos, `passwordHash` ≠ `password`);
  e-mail já existente → mesmo erro de `createUser`.

- [ ] **`server/scripts/create-organization.ts`** (novo) — segue o padrão de
  `server/prisma/seed.ts` (`createPrisma()`, `.finally(() =>
  prisma.$disconnect())`). Usa `node:util` `parseArgs` para `--org`, `--name`,
  `--email`, `--password` (todos obrigatórios). Valida com
  `parse(createOrganizationSchema, { name: org })` e `parse(createUserSchema,
  { name, email, password })`. Chama `createOrganizationWithOwner`. Em
  sucesso, imprime id da organização criada e nome/email do usuário (nunca a
  senha). Em erro (validação ou e-mail duplicado), imprime `error.message` e
  define `process.exitCode = 1`.
  Done quando: `npx tsx scripts/create-organization.ts --org "Empresa Teste"
  --name "Usuário Teste" --email "teste@empresateste.com.br" --password
  "senhaforte1"` (de `server/`, contra `dev.db`) imprime confirmação e cria os
  registros; repetir com o mesmo `--email` imprime erro e sai com código 1.

- [ ] **npm scripts** — `server/package.json`: `"org:create": "tsx
  scripts/create-organization.ts"`. `package.json` (raiz): `"org:create":
  "npm run org:create -w server"`, seguindo o padrão de `db:migrate`/`db:reset`.
  Done quando: `npm run org:create -w server -- --org ... --name ... --email
  ... --password ...` funciona a partir da raiz do repo.

- [ ] **`docs/deploy-railway.md`** — nova seção "9. Criar uma nova
  organização" (após a seção 8 atual), com o comando de uso e instrução de
  rodar pela aba "Console" do serviço no Railway (mesmo fluxo já documentado
  para `db:seed` na seção 6).
  Done quando: seção escrita.

Verify: smoke test manual — rodar `create-organization.ts` localmente contra
`dev.db`, depois logar com o usuário criado (`POST /auth/login` ou UI) e
confirmar que `organizationId` retornado é o da nova organização e que não há
acesso aos dados da "Oficina Criativa Ltda". `npm run typecheck` e `npm run
build` (raiz) sem erros.

---

Verificação final (após as 5 fases): `npm test -w server`, `npm run
typecheck`, `npm run build` — todos verdes.
