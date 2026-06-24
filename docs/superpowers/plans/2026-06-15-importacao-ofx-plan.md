# Plano: Importação de extrato OFX

Spec: `docs/superpowers/specs/2026-06-15-importacao-ofx-design.md`

Nota sobre o pré-requisito da spec (§9): ainda não há um arquivo `.ofx` real
do Itaú. A Fase 1 cria uma fixture sintética, mas fiel ao formato OFX 1.x
SGML do Itaú (cabeçalho `OFXHEADER:100`/`DATA:OFXSGML`, tags sem fechamento).
Se o usuário conseguir um export real durante a Fase 1, ele substitui a
fixture e o parser/matching são revalidados contra ele — sem mudar a
estrutura do plano.

## Fase 1: Modelo de dados + parsing OFX + matching (sem API)

Goal: dado um arquivo OFX e os lançamentos da organização, calcular as linhas
de preview com status `duplicate`/`matched`/`ambiguous`/`unmatched` — tudo
testável via testes unitários, sem nenhuma rota nova.

Tasks:
- [x] **Migration `Settlement.importFitid`** — em `server/prisma/schema.prisma`,
  adicionar ao model `Settlement`:
  ```prisma
  importFitid String?

  @@unique([bankAccountId, importFitid])
  ```
  Criar `server/prisma/migrations/<timestamp>_add_settlement_import_fitid/migration.sql`:
  ```sql
  -- AlterTable
  ALTER TABLE "Settlement" ADD COLUMN "importFitid" TEXT;

  -- CreateIndex
  CREATE UNIQUE INDEX "Settlement_bankAccountId_importFitid_key" ON "Settlement"("bankAccountId", "importFitid");
  ```
  Rodar `prisma generate` para o client tipar `importFitid`.
  Done quando: `npm test -w server` continua verde (◦ `createTestDb()` aplica a
  nova migration sem erro) e `prisma.settlement.create({ data: { ..., importFitid: "x" } })` compila.

- [x] **Fixture OFX** — `server/test/fixtures/itau-extrato.ofx`: OFX 1.x SGML
  estilo Itaú com ~6 `<STMTTRN>`, cobrindo os 4 status do matching:
  - 1 transação que casa exatamente (valor+direção+data) com um `Entry` aberto
    a ser criado no teste (→ `matched`).
  - 1 transação cujo `FITID` já está em `Settlement.importFitid` (seed do
    teste) → `duplicate`.
  - 1 transação sem nenhum `Entry` correspondente → `unmatched`.
  - 1 transação que casa com 2 `Entry` abertos (mesmo valor/direção, datas
    dentro da janela) → `ambiguous`.
  Done quando: arquivo existe e é OFX 1.x SGML válido (header + `<OFX>` /
  `<BANKMSGSRSV1>` / `<STMTTRNRS>` / `<STMTRS>` / `<BANKTRANLIST>` /
  `<STMTTRN>`...).

- [x] **Parser OFX** — `server/src/services/ofx-parser.ts`:
  ```ts
  export interface OfxTransaction { fitid: string; date: string; amountCents: number; description: string; }
  export function parseOfx(content: string): OfxTransaction[]
  ```
  Extração por regex de cada bloco `<STMTTRN>...</STMTTRN>` (OFX SGML 1.x não
  exige tags de fechamento em campos folha): `FITID`, `DTPOSTED`
  (`YYYYMMDDHHMMSS[...]` → `YYYY-MM-DD`, via `toDate`/`calendarDate` de
  `lib/dates.ts`), `TRNAMT` (string decimal com sinal → `amountCents` inteiro),
  `NAME` ou `MEMO` (o que existir, `NAME` primeiro) → `description`.
  Teste `server/test/ofx-parser.test.ts`: parseia a fixture e confere
  fitid/date/amountCents/description de cada transação esperada.
  Done quando: teste passa.
  Nota: se a lib `node-ofx-parser` (ou similar) tratar bem a fixture, pode
  substituir o parser próprio — decidir durante a implementação; o teste acima
  é o critério de aceite independente da escolha.

- [x] **Matching** — `server/src/services/bank-import.ts`:
  ```ts
  export interface ImportCandidate { entryId: string; description: string; counterparty: string; dueDate: string; remainingCents: number; }
  export interface ImportPreviewRow { fitid: string; date: string; amountCents: number; description: string; status: "duplicate" | "matched" | "ambiguous" | "unmatched"; candidates: ImportCandidate[]; }
  export function previewImport(prisma, params: { organizationId: string; bankAccountId: string; transactions: OfxTransaction[] }): Promise<ImportPreviewRow[]>
  ```
  Implementa spec §5: dedup por `Settlement.importFitid` (filtrando por
  `bankAccountId`), direção pelo sinal de `amountCents`, candidatos =
  `Entry` da org/direção, não soft-deletada, `deriveEntry(...).status !==
  "SETTLED"`, `remainingCents === abs(amountCents)`, `|dueDate - date| <= 5
  dias` (usar `addDays`/`calendarDate` de `lib/dates.ts`), ordenados por
  proximidade de data; 1→`matched`, 2+→`ambiguous`, 0→`unmatched`.
  Teste `server/test/bank-import.test.ts` (padrão `createTestDb`/`makeFixture`
  de `test/helpers/db.ts`): roda `previewImport` com a fixture parseada +
  entries/settlements semeados para os 4 cenários, confere status e
  candidatos de cada linha.
  Done quando: teste passa para os 4 status.

Verify: `npm test -w server` (toda a suíte, incluindo os novos arquivos).

## Fase 2: API preview/confirm

Goal: `POST /bank-accounts/:id/import/preview` (multipart) e
`POST /bank-accounts/:id/import/confirm` (JSON) funcionando ponta a ponta
contra banco de teste real, via testes HTTP.

Tasks:
- [x] **`@fastify/multipart`** — adicionar em `server/package.json`
  (dependencies) e registrar em `buildApp()` (`server/src/app.ts`), junto dos
  outros `app.register(...)` de plugins (cors/cookie/jwt).
  Done quando: `npm install` resolve e `app.register(multipart)` não quebra
  `npm test -w server`.

- [x] **Schema de confirmação** — `shared/src/schemas/bank-import.ts`:
  ```ts
  export const importConfirmRowSchema = z.object({
    fitid: z.string().min(1),
    date: isoDateSchema,
    amountCents: z.number().int(),
    description: z.string(),
    action: z.enum(["settle", "create", "ignore"]),
    entryId: z.string().min(1).optional(),
    newEntry: z.object({
      description: z.string().min(1),
      counterparty: z.string().min(1),
      categoryId: z.string().min(1),
      costCenterId: z.string().min(1).optional(),
    }).optional(),
  }).refine(/* entryId obrigatório se action==="settle"; newEntry obrigatório se action==="create" */);
  export const importConfirmSchema = z.array(importConfirmRowSchema);
  ```
  Exportar em `shared/src/index.ts` (`export * from "./schemas/bank-import.js"`).
  Done quando: typecheck do shared passa e os refinements rejeitam
  combinações inválidas (`action==="settle"` sem `entryId`, etc.).

- [x] **`settleEntry` aceita `importFitid`** — em
  `server/src/services/settlements.ts`, adicionar `importFitid?: string` a
  `SettleEntryInput` e em `tx.settlement.create({ data: { ..., importFitid:
  input.importFitid } })`.
  Done quando: teste em `server/test/settle-reverse.test.ts` (ou novo teste)
  confirma que passar `importFitid` grava o campo, e que repetir
  `settleEntry` com o mesmo `(bankAccountId, importFitid)` rejeita por
  violação do unique (capturada e mapeada — ver próxima task).

- [x] **`confirmImportRow`** — em `server/src/services/bank-import.ts`:
  ```ts
  export interface ImportConfirmResult { fitid: string; status: "settled" | "created" | "ignored" | "duplicate" | "error"; error?: { code: string; message: string } }
  export function confirmImportRow(prisma, params: { organizationId: string; bankAccountId: string; userId: string; row: ImportConfirmRow }): Promise<ImportConfirmResult>
  ```
  Implementa spec §6 passos 1-4:
  1. `Settlement.findFirst({ where: { bankAccountId, importFitid: row.fitid } })`
     existente → `duplicate` (ignora `action`).
  2. `action === "ignore"` → `ignored`, sem escrita.
  3. `action === "settle"` → `settleEntry(prisma, { entryId: row.entryId!,
     amountCents: Math.abs(row.amountCents), settledAt: toDate(row.date),
     bankAccountId, userId, importFitid: row.fitid })`; captura
     `BusinessError`/`NotFoundError` → `{ status: "error", error: { code,
     message } }`.
  4. `action === "create"` → `prisma.$transaction`: `createSingleEntry` (com
     `direction` pelo sinal de `amountCents`, `amountCents: Math.abs(...)`,
     `dueDate: toDate(row.date)`, `competenceMonth: competenceOf(toDate(row.date))`,
     demais campos de `row.newEntry`) + `settleEntry` (mesmo padrão da task 3,
     `importFitid: row.fitid`) na mesma transação; qualquer erro (ex.
     `PERIOD_CLOSED`) → `{ status: "error", error }`, nada é criado.
  Done quando: cobertura de teste (próxima task) passa para os 5 status.

- [x] **Rotas** — `server/src/routes/bank-import.ts`:
  - `POST /bank-accounts/:id/import/preview`: lê `request.file()`
    (`@fastify/multipart`), valida que a conta existe e não está arquivada,
    `parseOfx` + `previewImport`, retorna `ImportPreviewRow[]`. Não persiste.
  - `POST /bank-accounts/:id/import/confirm`: `parse(importConfirmSchema,
    request.body)`, processa cada linha sequencialmente via
    `confirmImportRow`, retorna `ImportConfirmResult[]` (uma falha numa linha
    não interrompe as demais).
  Registrar `bankImportRoutes` em `server/src/app.ts` no sub-app protegido,
  junto de `bankAccountsRoutes` (sem mudar `apiPrefixes` — `/bank-accounts` já
  está listado).
  Done quando: rotas respondem 200/201 nos casos felizes (próxima task).

- [x] **Testes HTTP** — `server/test/http/bank-import.test.ts` (padrão
  `setupHttpTest`/`teardownHttpTest` de `test/http/helpers.ts`):
  - `preview` com a fixture retorna os 4 status esperados.
  - `confirm` com `action: "settle"` baixa o lançamento certo; com
    `action: "create"` cria `Entry`+`Settlement`; com `action: "ignore"` não
    grava nada.
  - Reenviar `confirm` para uma linha já processada com sucesso → `duplicate`.
  - Linha `create` cujo mês de competência está fechado (`closedThroughMonth`)
    → `{ status: "error", error: { code: "PERIOD_CLOSED", ... } }`, demais
    linhas do mesmo confirm processam normalmente.
  - `GET`/`POST` em `/bank-accounts/:id/import/*` sem sessão → 401.
  Done quando: todos os casos acima passam.

Verify: `npm test -w server` verde; smoke test manual (`npm run dev -w
server` + `curl -F file=@server/test/fixtures/itau-extrato.ofx ...`) retorna
o JSON de preview esperado.

## Fase 3: Frontend "Importar extrato"

Goal: fluxo completo upload → revisão → confirmação, rodando contra o
servidor de dev real com dados semeados.

Tasks:
- [x] **`apiFetch` aceita `FormData`** — em `web/src/api/client.ts`, não
  definir `Content-Type: application/json` quando `init.body instanceof
  FormData` (deixar o browser definir o boundary multipart).
  Done quando: chamada com `FormData` não seta `Content-Type` manual; chamadas
  existentes com JSON continuam funcionando (sem regressão nos testes/uso
  atual).

- [x] **Tipos** — `web/src/api/types.ts`: adicionar `ImportPreviewRow`,
  `ImportCandidate`, `ImportConfirmRow`, `ImportConfirmResult` (mesmas formas
  da Fase 2 / spec §6).

- [x] **Hooks** — `web/src/api/bank-import.ts`:
  ```ts
  export function usePreviewImport() // mutation: (params: { bankAccountId: string; file: File }) => apiFetch<ImportPreviewRow[]>(`/bank-accounts/${bankAccountId}/import/preview`, { method: "POST", body: formData })
  export function useConfirmImport() // mutation: (params: { bankAccountId: string; rows: ImportConfirmRow[] }) => apiFetch<ImportConfirmResult[]>(`/bank-accounts/${bankAccountId}/import/confirm`, { method: "POST", body: JSON.stringify(rows) })
  ```
  `useConfirmImport` invalida queries afetadas (`bank-accounts`, `statement`,
  entries) no `onSuccess`, seguindo o padrão de `cost-centers.ts`.

- [x] **Página `ImportStatementPage.tsx`** (`web/src/pages/ImportStatementPage.tsx`),
  per spec §7:
  - **Passo 1**: select de conta bancária (não arquivada, via
    `useBankAccounts`), input `<input type="file" accept=".ofx">`, botão
    "Analisar arquivo" → `usePreviewImport`.
  - **Passo 2**: tabela Data | Descrição | Valor (`.money.pos`/`.neg`) |
    Destino — uma linha por `ImportPreviewRow`:
    - `duplicate`: linha acinzentada, texto "Já importado", sem controles.
    - `matched`: pré-selecionado "Baixar **{candidates[0].description}**
      (venc. {candidates[0].dueDate})"; dropdown para trocar para "Criar novo
      lançamento" ou "Ignorar".
    - `ambiguous`: dropdown aberto listando `candidates` (descrição,
      contraparte, vencimento) + "Criar novo" / "Ignorar".
    - `unmatched`: default "Criar novo lançamento" com campos inline
      Categoria* (obrigatório, select de `useCategories` filtrado por
      direção), Centro de custo (opcional, `useCostCenters`),
      Contraparte/Descrição (pré-preenchidos da transação, editáveis); ou
      "Ignorar". Direção/valor/data não editáveis (vêm do extrato).
    - Rodapé: contadores por destino + botão "Confirmar importação" →
      `useConfirmImport`.
  - **Passo 3**: resultado por linha pós-`confirm` — erros usam o padrão
    `ApiError`/`formError` (igual `NewCostCenterModal.tsx`): mensagem do erro
    exibida na própria linha; linhas com `status: "error"` continuam
    editáveis e reenviáveis (novo `confirm` só com essas linhas).

- [x] **Navegação** — `web/src/components/Sidebar.tsx`: adicionar `{ to:
  "/importar-extrato", label: "Importar extrato" }` em `NAV_ITEMS`.
  `web/src/App.tsx`: importar `ImportStatementPage` e adicionar `<Route
  path="/importar-extrato" element={<ImportStatementPage />} />` dentro do
  `Layout`/`RequireAuth`.

- [x] **Verificação manual** — `npm run dev` (server + web), login com usuário
  semeado, upload de `server/test/fixtures/itau-extrato.ofx` (ou um `.ofx`
  real, se disponível), percorrer preview → revisão (testar os 4 status) →
  confirmar, e checar em `/a-pagar`, `/a-receber` e `/contas` (extrato) que os
  lançamentos/baixas refletem o resultado.

  Feito via smoke test HTTP (curl) contra o `dev.db` real, login
  `ana@empresa.com.br`, conta "Itaú PJ" — sem navegador disponível no
  ambiente. Achado: `dev.db` estava sem a migration
  `20260615120000_add_settlement_import_fitid` (rodava `db push` solto, não
  `db:migrate`); aplicada via `npm run db:migrate`. Resultado: preview das 4
  transações do fixture → `unmatched` (sem candidatos); confirm com `action:
  "create"` → `status: "created"` nas 4; entries criados em `/payables` e
  `/receivables` com categorias corretas e `status: "SETTLED"`; saldo Itaú PJ
  atualizado (1.038.334 → 1.003.334, Δ -350,00 = líquido do extrato); reimport
  do mesmo arquivo → todas as 4 linhas `duplicate` ("Já importado"). Caminhos
  `matched`/`ambiguous`/`settle` já cobertos pelos testes automatizados das
  Fases 1-2; UI revisada via leitura de código + typecheck.

Verify: `npm run typecheck` (server e web) sem erros; passo manual acima sem
erros de console/rede.
