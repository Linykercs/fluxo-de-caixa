# Isolamento multiempresa e onboarding de nova organização

## 1. Contexto e objetivo

A auditoria completa (ver conversa) identificou que o app está pronto para
**uma** organização ("Oficina Criativa Ltda", dados demo + um usuário real),
mas tem lacunas que bloqueiam onboardar uma
**segunda organização real** (a empresa do sogro do usuário, 5 funcionários)
no mesmo banco de produção:

1. Nenhuma operação por ID (`/entries/:id`, `/bank-accounts/:id`, etc.) verifica
   que o registro pertence à organização de quem chama — todas fazem
   `findUnique({ where: { id } })`. Hoje, com 1 org, não há nada para "vazar".
   No momento em que existir uma 2ª org no mesmo banco, esse é o **único**
   limite entre os dados das duas empresas — e ele não existe.
2. `POST /users` sempre usa `request.user.organizationId` de quem cria — não
   há nenhum caminho para provisionar uma organização nova.
3. `server/prisma/seed.ts` (`wipe()`) e `server/scripts/reset-db.ts` apagam
   **todas** as organizações / o arquivo SQLite inteiro, sem nenhuma proteção
   contra rodar isso em produção.
4. `/auth/login` não tem rate limit e a senha mínima é de 6 caracteres.

**Objetivo**: corrigir os 4 pontos acima para que seja seguro criar e operar
uma segunda organização real em produção, e documentar como criá-la.

## 2. Escopo

**Dentro:**
- Isolamento de organização em todas as operações por ID dos services/rotas
  listados na Fase A.
- Script `server/scripts/create-organization.ts` (Fase B).
- Rate limit em `/auth/login`, senha mínima 8, guard contra wipe em produção
  (Fase C).

**Fora de escopo (decisão consciente, ver auditoria):**
- **Roles/admin**: aceitável para 5 pessoas de confiança por organização;
  necessário antes de virar SaaS com várias organizações por cliente.
- **Backup do volume Railway**: ação operacional/infra, não é mudança de
  código deste repo.
- **"Esqueci minha senha"**: feature nova, não bloqueia o uso inicial.
- **`CORS_ORIGIN` em produção**: setar a variável no Railway é ação
  operacional, não código.
- **3 vulnerabilidades npm residuais** (`prisma` → `@prisma/dev` →
  `@hono/node-server`): já avaliadas, exigem downgrade major do Prisma.
- **Validação de `costCenterId` pertencer à organização** em
  `createSingleEntry`/`createInstallments`/`createRecurrence`: hoje não existe
  *nenhuma* validação (nem sem org-check) — é uma lacuna diferente da
  encontrada na auditoria (que era "lookup existe mas sem filtro de org").
  Like `categoryId` via `assertCategoryMatches`, mas para `costCenterId` não
  há função equivalente. Anotado aqui para uma rodada futura; não bloqueia o
  onboarding porque exige uma chamada de API forjada com um ID de outra
  organização (a UI nunca oferece isso).
- **Nota operacional** (não-código): trocar a senha das contas demo
  `ana@empresa.com.br` / `bruno@empresa.com.br` e da conta do usuário real
  em produção (ou orientar o novo usuário a usar senha forte) antes de
  divulgar a URL para terceiros.

## 3. Fase A — Isolamento de organização nas operações por ID

### 3.1 Padrão

Para cada função de service que hoje faz `findUnique({ where: { id } })` (ou
`findFirst` sem `organizationId`) sobre um registro tenant-scoped:

1. A função passa a receber `organizationId` (novo parâmetro posicional antes
   do `id`, ou novo campo no `input`, seguindo o que já for usado por aquela
   função — convenção já existente em `listUsers(db, organizationId)`,
   `listCategories(db, organizationId, kind?)`, etc.).
2. A query troca `findUnique({ where: { id } })` por
   `findFirst({ where: { id, organizationId } })`.
3. Se não encontrar, o erro continua sendo `NotFoundError` (o mesmo retorno de
   "não existe" — um ID de outra organização não é distinguível de um ID
   inexistente).
4. A rota correspondente passa a extrair `request.user.organizationId` e
   repassar para o service.

Onde o registro pai já foi validado contra `organizationId` (ex.: uma
`Settlement` cujo `entryId` já foi confirmado pertencer à org, ou uma
`Recurrence` acessada via uma `Entry` já validada), **não** é necessário
repetir o filtro nas relações — a integridade referencial garante que
`entry.organizationId === recurrence.organizationId === settlement.organizationId`.

### 3.2 Inventário de mudanças

#### `entries.ts` (service `server/src/services/entries.ts` + rota `server/src/routes/entries.ts`)

- `getEntryOrThrow(db, entryId)` → `getEntryOrThrow(db, organizationId, entryId)`;
  `findFirst({ where: { id: entryId, deletedAt: null } })` ganha `organizationId`.
- `assertCategoryMatches(db, categoryId, direction)` →
  `assertCategoryMatches(db, organizationId, categoryId, direction)`;
  `findUnique({ where: { id: categoryId } })` → `findFirst` com `organizationId`.
- `updateEntry(db, entryId, changes)` → `updateEntry(db, organizationId, entryId, changes)`.
- `deleteEntry(db, entryId)` → `deleteEntry(db, organizationId, entryId)`.
- `createSingleEntry`/`createInstallments`: passam `input.organizationId` para
  `assertCategoryMatches` (ambos já o têm em `input`).
- Rota: `GET /entries/:id`, `PATCH /entries/:id`, `DELETE /entries/:id` e
  `PATCH /entries/:id/recurrence-scope` passam a extrair
  `const organizationId = request.user.organizationId` e repassá-lo a todas as
  chamadas de service acima.

#### `recurrences.ts` (`server/src/services/recurrences.ts`)

- `createRecurrence`: passa `input.organizationId` para `assertCategoryMatches`.
- `updateRecurrenceFromEntry`: novo campo `organizationId` no `input`;
  `tx.entry.findFirst({ where: { id: input.entryId, deletedAt: null } })` ganha
  `organizationId`; `assertCategoryMatches` (quando `changes.categoryId` está
  definido) recebe `entry.organizationId`. A atualização de
  `tx.recurrence.update({ where: { id: entry.recurrence.id } })` não precisa de
  filtro adicional — `entry` já foi validado.
  - Rota (`PATCH /entries/:id/recurrence-scope`) passa
    `organizationId: request.user.organizationId` no `input`.
- `cancelRecurrence(prisma, recurrenceId, today)` →
  `cancelRecurrence(prisma, organizationId, recurrenceId, today)`;
  `tx.recurrence.findUnique({ where: { id: recurrenceId } })` → `findFirst` com
  `organizationId`. **Nota**: esta função não tem nenhuma rota chamando-a hoje
  (export não usado) — corrigir por consistência, sem criar rota nova.

#### `bank-accounts.ts` (service `server/src/services/bank-accounts.ts` + rota `server/src/routes/bank-accounts.ts`)

- `getAccountBalanceCents(db, bankAccountId)` →
  `getAccountBalanceCents(db, organizationId, bankAccountId)`.
- `updateBankAccount(db, bankAccountId, changes)` →
  `updateBankAccount(db, organizationId, bankAccountId, changes)`.
- `getStatement(db, bankAccountId, opts)` →
  `getStatement(db, organizationId, bankAccountId, opts)`.
- Todas as 3: `findUnique({ where: { id: bankAccountId } })` → `findFirst` com
  `organizationId`.
- `listAccountsWithBalances` (já recebe `organizationId`) passa a repassar para
  `getAccountBalanceCents`.
- Rota: `PATCH /bank-accounts/:id` e `GET /bank-accounts/:id/statement` passam
  `request.user.organizationId`.

#### `settlements.ts` (service `server/src/services/settlements.ts` + rota `server/src/routes/settlements.ts`)

- `SettleEntryInput` ganha campo `organizationId: string`.
- `settleEntryTx`: usa `input.organizationId` em `getEntryOrThrow(tx,
  input.organizationId, input.entryId)`; `tx.bankAccount.findUnique({ where: {
  id: input.bankAccountId } })` → `findFirst` com `organizationId: input.organizationId`.
- `ReverseSettlementInput` ganha campo `organizationId: string`.
- `reverseSettlement`: `tx.settlement.findUnique({ where: { id:
  input.settlementId }, include: { entry: true } })` → `findFirst` com
  `organizationId: input.organizationId`.
- Rota: `POST /entries/:id/settle` e `POST /settlements/:id/reverse` passam
  `organizationId: request.user.organizationId` no input.

#### `transfers.ts` (`server/src/services/transfers.ts`)

- `createTransfer` já recebe `input.organizationId`. As duas chamadas
  `tx.bankAccount.findUnique({ where: { id: input.fromAccountId/toAccountId } })`
  → `findFirst` com `organizationId: input.organizationId`. Nenhuma mudança na
  rota (`server/src/routes/transfers.ts` já passa `organizationId`).

#### `categories.ts` (service `server/src/services/categories.ts` + rota `server/src/routes/categories.ts`)

- `updateCategory(db, categoryId, changes)` →
  `updateCategory(db, organizationId, categoryId, changes)`;
  `findUnique` → `findFirst` com `organizationId`.
- Rota: `PATCH /categories/:id` passa `request.user.organizationId`.

#### `cost-centers.ts` (service `server/src/services/cost-centers.ts` + rota `server/src/routes/cost-centers.ts`)

- `updateCostCenter(db, costCenterId, changes)` →
  `updateCostCenter(db, organizationId, costCenterId, changes)`;
  `findUnique` → `findFirst` com `organizationId`.
- Rota: `PATCH /cost-centers/:id` passa `request.user.organizationId`.

#### `bank-import.ts` (rota `server/src/routes/bank-import.ts` + service `server/src/services/bank-import.ts`)

- Rota: `getActiveBankAccount(app, id)` →
  `getActiveBankAccount(app, organizationId, id)`; `findUnique` → `findFirst`
  com `organizationId`. Ambas as rotas (`/import/preview`, `/import/confirm`)
  já têm `request.user.organizationId` disponível.
- Service `confirmImportRow`: as duas chamadas a `settleEntry`/`settleEntryTx`
  passam a incluir `organizationId: params.organizationId` (campo novo de
  `SettleEntryInput`). `previewImport`/`confirmImportRow` não precisam de mais
  nenhuma mudança — uma vez que `bankAccountId` está garantido pertencer à org
  (verificado na rota), os `prisma.settlement.findFirst({ where: { bankAccountId,
  importFitid } })` já são seguros por integridade referencial.

### 3.3 Testes de isolamento (critério de aceite da Fase A)

Novo arquivo `server/test/http/org-isolation.test.ts`. Estende o helper de
teste para semear **duas** organizações (A e B), cada uma com 1 usuário, 1
conta bancária, 1 categoria, 1 centro de custo, 1 lançamento (com 1 baixa) e 1
recorrência.

Para cada rota abaixo, autenticado como usuário da org B usando um ID que
pertence à org A, a resposta deve ser **404** (`NotFoundError`), nunca 200 nem
os dados da org A:

- `GET /entries/:id`, `PATCH /entries/:id`, `DELETE /entries/:id`,
  `PATCH /entries/:id/recurrence-scope`
- `POST /entries/:id/settle`, `POST /settlements/:id/reverse`
- `PATCH /bank-accounts/:id`, `GET /bank-accounts/:id/statement`
- `PATCH /categories/:id`, `PATCH /cost-centers/:id`
- `POST /transfers` com `fromAccountId`/`toAccountId` da org A
- `POST /bank-accounts/:id/import/preview` e `/import/confirm` com o `:id` da
  org A

Os testes existentes (que usam só a org A) continuam passando inalterados —
a mudança é estritamente um filtro adicional no `where`.

## 4. Fase B — Script de provisionamento de organização

### 4.1 `createOrganizationSchema`

Novo, em `shared/src/schemas/organizations.ts`:

```ts
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
```

Exportar em `shared/src/index.ts`.

### 4.2 `server/scripts/create-organization.ts`

Segue o padrão de `seed.ts`/`reset-db.ts` (roda via `tsx`, usa `createPrisma()`
de `server/src/lib/prisma`). Argumentos via `node:util` `parseArgs` (sem nova
dependência):

```
npx tsx scripts/create-organization.ts \
  --org "Nome da Empresa do Sogro" \
  --name "Nome do Primeiro Usuário" \
  --email "email@empresadosogro.com.br" \
  --password "senha-forte-aqui"
```

Comportamento:

1. Parseia os 4 argumentos obrigatórios.
2. Valida `--org` com `createOrganizationSchema` e
   `{ name, email, password }` com `createUserSchema` (já existente em
   `shared/src/schemas/users.ts`).
3. Verifica que `--email` não está em uso (`prisma.user.findUnique({ where: {
   email } })`) — mesma regra de `createUser`.
4. `prisma.$transaction`: cria `Organization { name: --org }`, depois
   `User { organizationId, name, email, passwordHash: argon2.hash(--password) }`.
5. Imprime no stdout: id da organização criada, nome, email do usuário criado
   (nunca a senha). Em erro de validação ou e-mail duplicado, imprime a
   mensagem e termina com código de saída 1.

O primeiro usuário criado usa a tela `/usuarios` (já existente, `POST /users`)
para cadastrar os outros 4 funcionários — sem mudança nessa tela.

### 4.3 Documentação

- `server/package.json`: novo script `"org:create": "tsx scripts/create-organization.ts"`.
- `package.json` (raiz): script equivalente, seguindo o padrão usado para
  `db:migrate`/`db:reset`.
- `docs/deploy-railway.md`: nova seção "Criar uma nova organização" com o
  comando acima e como rodá-lo pela aba "Console" do serviço no Railway (mesmo
  fluxo já documentado para `db:seed`).

## 5. Fase C — Endurecimento

### 5.1 Rate limit no login

- Nova dependência: `@fastify/rate-limit` (workspace `server`).
- `server/src/app.ts`: `app.register(rateLimit, { max: 100, timeWindow: "1 minute" })`
  como default global (não incomoda 5-10 usuários reais).
- `server/src/routes/auth.ts`: `POST /auth/login` ganha
  `{ config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }` — 5 tentativas
  por minuto por IP. Resposta padrão do plugin ao exceder: `429`.

### 5.2 Senha mínima

- `shared/src/schemas/users.ts`: `password: z.string().min(6).max(120)` →
  `.min(8).max(120)`.
- `"senha123"` (8 caracteres, usada por `ana`/`bruno` no seed e pelo usuário real)
  continua válida — sem necessidade de migração de dados.

### 5.3 Guard contra wipe em produção

Ambos os scripts abaixo recebem a mesma checagem, logo no início:

```ts
if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_WIPE !== "true") {
  throw new Error(
    "Recusando apagar dados em produção sem ALLOW_DB_WIPE=true (isso apagaria TODAS as organizações).",
  );
}
```

- `server/prisma/seed.ts`: no início de `main()`, antes de `wipe()`.
- `server/scripts/reset-db.ts`: no início do módulo, antes de
  `removeSqliteFiles(databaseUrl)` (que em produção apagaria
  `/data/fluxo.db` diretamente).

`ALLOW_DB_WIPE` é uma variável de "escape hatch": não entra em
`.env.production.example` (não deve ficar configurada permanentemente) — é
setada manualmente e de forma pontual no Railway só se um reset completo em
produção for mesmo necessário. `NODE_ENV=test` (usado pelos testes) e o
ambiente de dev local (sem `NODE_ENV=production`) não são afetados.

## 6. Ordem de implementação sugerida

1. **Fase A** — isolamento de organização (services + rotas + testes de
   isolamento). É a mudança mais extensa, mas mecânica e bem delimitada;
   `npm test -w server` deve continuar 100% verde com os novos testes
   adicionados.
2. **Fase C** — endurecimento (rate limit, senha mínima, guard de wipe).
   Pequena e independente da Fase A.
3. **Fase B** — script de provisionamento + documentação. Depende
   conceitualmente da Fase A estar pronta (só faz sentido ter uma 2ª
   organização real depois que o isolamento existe), mas não tem dependência
   técnica — pode ser feita em paralelo se conveniente.

Verificação final: `npm test -w server` (incluindo `org-isolation.test.ts`),
`npm run typecheck`, `npm run build`, e smoke test manual de
`create-organization.ts` criando uma organização de teste local + login do
usuário criado.
