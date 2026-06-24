# Spec — Fase 11: painel, centro de custo, relatórios por mês e DRE

Complementa `docs/superpowers/specs/2026-06-12-fluxo-de-caixa-design.md` (v1, já
implementada, testada e em produção em
https://fluxoserver-production.up.railway.app). Esta spec cobre 6 pedidos do
usuário feitos em 2026-06-14, todos incrementais sobre o app existente.

## 1. Objetivo

1. **Painel — Projeção de saldo**: trocar a barra de "saldo líquido projetado"
   por duas barras por mês (A pagar / A receber).
2. **Contas bancárias — pagamento em dinheiro**: permitir registrar
   movimentações em espécie.
3. **Centro de custo**: novo campo em contas a pagar/receber para indicar a
   origem (Obra, Banco, etc.), com tela de cadastro própria.
4. **Contraparte → Fornecedor/Cliente**: o rótulo "Contraparte" passa a ser
   "Fornecedor" para contas a pagar e "Cliente" para contas a receber.
5. **Relatórios — detalhe do mês**: ao clicar num mês em "Fluxo de caixa
   mensal", abrir um popup com o detalhamento por categoria e por
   fornecedor/cliente daquele mês.
6. **DRE e fechamento de mês**: novo relatório de DRE (receitas − despesas) e
   uma ação "Fechar mês" que impede novos lançamentos (ou edições) de contas a
   pagar/receber com competência em meses já fechados.

## 2. Decisões de produto já validadas

Confirmadas com o usuário via perguntas de múltipla escolha (todas as opções
recomendadas foram escolhidas):

- **Projeção de saldo**: duas barras por mês — "A pagar" (vermelho) e "A
  receber" (verde) — substituindo a barra única de saldo líquido. O "Saldo
  previsto" que já existe na faixa de totais do Painel (`saldo-strip`)
  continua como está, pois usa o saldo acumulado (`balanceCents`), que
  permanece disponível.
- **Pagamento em dinheiro**: não cria um "tipo" de conta novo — basta cadastrar
  uma `BankAccount` chamada "Caixa" pela tela normal de Contas. Ação de dados,
  sem mudança de código (ver Seção 4).
- **Centro de custo**: lista gerenciável própria (igual a Categorias), com
  CRUD completo e seleção opcional nos lançamentos.
- **Fechamento de mês**: novo relatório DRE + ação "Fechar mês" que bloqueia
  criação/edição de lançamentos com competência nos meses fechados.

## 3. F1 — Painel: Projeção de saldo com A pagar / A receber

### Backend (`server/src/services/reports.ts`)

`ProjectionMonth` ganha dois campos novos, mantendo o existente:

```ts
export interface ProjectionMonth {
  month: string;
  payableCents: number;    // novo — soma de remainingCents (PAYABLE) com vencimento neste mês
  receivableCents: number; // novo — soma de remainingCents (RECEIVABLE) com vencimento neste mês
  balanceCents: number;    // existente — saldo acumulado até o fim deste mês
}
```

`projectionReport` hoje calcula um único `deltas: Map<month, number>` com
sinal (+1 para RECEIVABLE, -1 para PAYABLE) e acumula em `balanceCents`. Passa
a calcular dois mapas separados, `payableDeltas` e `receivableDeltas` (valores
sempre ≥ 0, soma de `remainingCents` por direção/mês), e:

```ts
balanceCents[i] = balanceCents[i-1] + receivableCents[i] - payableCents[i]
```

Os valores de `payableCents`/`receivableCents` retornados são os valores
**do mês** (não acumulados) — mesma semântica de "A pagar no mês"/"A receber
no mês" já usada no `saldo-strip` do Painel, mas projetados para os próximos
`PROJECTION_MONTHS` meses em vez de só o mês atual.

### Frontend (`web/src/pages/DashboardPage.tsx`)

O card "Projeção de saldo" (atualmente 1 `bar-row` por mês, usando
`balanceCents`) passa a renderizar **2 `bar-row` por mês**:

- "A pagar" (vermelho), valor `p.payableCents`.
- "A receber" (verde), valor `p.receivableCents`.

`maxAbs` passa a ser o maior valor entre todos os `payableCents` e
`receivableCents` de todos os meses (para as duas barras usarem a mesma
escala). A barra de saldo líquido acumulado é removida deste card. O
`saldo-strip` (que já mostra "Saldo previsto") não muda — continua lendo
`balanceCents` do mesmo `data.projection`.

## 4. F2 — Conta "Caixa" para pagamento em dinheiro

Sem mudança de schema, API ou frontend: `BankAccount` já é genérico
(`name`, `initialBalanceCents`). Ação operacional, fora do código desta fase:

- Criar uma conta chamada "Caixa" (ou "Dinheiro") pela tela **Contas → Nova
  conta**, com o saldo inicial em espécie atual.
- Lançamentos pagos/recebidos em dinheiro usam essa conta como
  `bankAccountId` na baixa (`Settlement`), igual a qualquer outra conta.

Registrado aqui apenas para rastreabilidade do pedido do usuário.

## 5. F3 — Centro de custo

### Modelo de dados (`server/prisma/schema.prisma`)

Novo modelo `CostCenter`, espelhando `Category` mas sem `kind` (um centro de
custo como "Obra X" pode ter tanto contas a pagar quanto a receber
associadas):

```prisma
model CostCenter {
  id             String    @id @default(cuid())
  organizationId String
  name           String
  archivedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  entries      Entry[]
  recurrences  Recurrence[]

  @@index([organizationId])
}
```

`Entry` e `Recurrence` ganham campo opcional:

```prisma
costCenterId String?
costCenter   CostCenter? @relation(fields: [costCenterId], references: [id])
```

Entries materializadas a partir de uma `Recurrence` herdam o
`costCenterId` da recorrência (mesmo padrão hoje usado para `categoryId`).

### API

Stack nova espelhando `Category`/`/categories` 1:1:

- `shared/src/schemas/cost-centers.ts`: `createCostCenterSchema` (`name`),
  `updateCostCenterSchema` (`name?`, `archived?`).
- `server/src/services/cost-centers.ts`: `listCostCenters`,
  `createCostCenter`, `updateCostCenter` (rename/archive) — mesmas regras de
  `Category` (escopo por `organizationId`, nome obrigatório não vazio).
- `server/src/routes/cost-centers.ts`:
  - `GET /cost-centers` — lista (não arquivados por padrão, igual a
    `/categories`).
  - `POST /cost-centers` — cria.
  - `PATCH /cost-centers/:id` — renomeia e/ou arquiva/desarquiva.

`shared/src/schemas/entries.ts` — `baseFields`, `createSingleEntrySchema`,
`createInstallmentsEntrySchema`, `createRecurrenceEntrySchema`,
`updateEntrySchema` e `recurrenceScopeSchema` ganham `costCenterId:
z.string().optional().nullable()`. `entryListQuerySchema` ganha
`costCenterId` opcional como filtro (mesmo padrão de `categoryId`).

### Frontend

- `web/src/api/cost-centers.ts`: hooks react-query espelhando
  `web/src/api/categories.ts` (`useCostCenters`, `useCreateCostCenter`,
  `useUpdateCostCenter`).
- `web/src/pages/CostCentersPage.tsx`: tela de cadastro espelhando a tela de
  Categorias (lista, criar, renomear, arquivar). Nova entrada no menu lateral
  ("Centros de custo").
- Formulários de lançamento (`SingleEntryForm`, `InstallmentsEntryForm`,
  `RecurrenceEntryForm`) ganham um select opcional "Centro de custo" (mesma UX
  do select de Categoria, com opção "Nenhum").
- `EntriesPage`: nova coluna/exibição do centro de custo na tabela e filtro
  opcional por centro de custo na barra de filtros (mesmo padrão do filtro de
  categoria).
- `EntryDetailModal`/`EditEntryModal`: mostram e permitem editar o centro de
  custo.

## 6. F4 — Rótulo "Contraparte" → Fornecedor / Cliente

Mudança **somente de apresentação** — o campo `Entry.counterparty` (string
livre) e toda a API continuam exatamente como estão, sem migration.

Novo helper em `web/src/lib/`:

```ts
export function counterpartyLabel(direction: "PAYABLE" | "RECEIVABLE"): string {
  return direction === "PAYABLE" ? "Fornecedor" : "Cliente";
}
```

Aplicar nos arquivos onde o texto "Contraparte"/"counterparty" aparece como
rótulo de UI (já identificados via busca): `SingleEntryForm.tsx`,
`InstallmentsEntryForm.tsx`, `RecurrenceEntryForm.tsx`,
`EntryDetailModal.tsx`, `EditEntryModal.tsx`, `RecurrenceScopeModal.tsx`,
`EntriesPage.tsx` e `web/src/api/types.ts` (se houver comentário/label ali). Em
cada caso, o rótulo passa a usar `counterpartyLabel(direction)` em vez do
texto fixo "Contraparte". Onde a tela mistura lançamentos das duas direções
(ex.: `EntriesPage` em modo "Todos"), usar o `direction` de cada linha
individualmente (cabeçalho de coluna pode permanecer genérico, ex. "Fornecedor
/ Cliente").

## 7. F5 — Relatórios: detalhe do mês por categoria e fornecedor/cliente

### Backend (`server/src/services/reports.ts`)

Novo relatório `byCounterpartyReport`:

```ts
export interface CounterpartySummaryRow {
  counterparty: string;
  direction: "PAYABLE" | "RECEIVABLE";
  previstoCents: number;
  realizadoCents: number;
}

export async function byCounterpartyReport(
  db: PrismaClient,
  organizationId: string,
  month: string,
): Promise<CounterpartySummaryRow[]>
```

Agrupa todos os `Entry` do mês (`competenceMonth = month`) por
`(counterparty, direction)`, somando previsto (`amountCents`) e realizado
(`Settlement` líquido), igual ao agrupamento por categoria em
`byCategoryReport` — mas a lista de "chaves" (contrapartes) é dinâmica, não
pré-cadastrada.

Nova rota `GET /reports/by-counterparty?month=YYYY-MM`.

### Frontend (`web/src/pages/ReportsPage.tsx`)

- As linhas da tabela "Fluxo de caixa mensal" passam a ser clicáveis (cursor
  pointer + hover). Ao clicar numa linha, abre um **Modal "Detalhes de
  <Mês/Ano>"** com três seções:
  - **Por categoria** — reaproveita `byCategoryReport`/`useByCategoryReport`
    para aquele mês, mesmo agrupamento Despesas/Receitas já existente hoje.
  - **Fornecedores** — linhas de `byCounterpartyReport` com
    `direction = "PAYABLE"` (rótulo via F4).
  - **Clientes** — linhas de `byCounterpartyReport` com
    `direction = "RECEIVABLE"`.
- O card standalone **"Resumo por categoria"** (com seu próprio seletor de
  mês) é **removido** — seu conteúdo passa a viver dentro do popup acima,
  acionado pelo clique na linha do mês correspondente em "Fluxo de caixa
  mensal". Isso evita duplicar a navegação por mês em dois lugares da mesma
  página.

  > Esta remoção é uma decisão tomada nesta spec (não foi perguntada
  > explicitamente ao usuário). Ao revisar a spec, confirmar se está de
  > acordo — caso contrário, o card "Resumo por categoria" pode ser mantido
  > em paralelo ao popup.

## 8. F6 — DRE e fechamento de mês

### Modelo de dados

`Organization` ganha campo opcional:

```prisma
closedThroughMonth String? // "YYYY-MM" — meses <= este valor estão fechados para novos lançamentos
```

### Backend — relatório DRE (`server/src/services/reports.ts`)

```ts
export interface DreRow {
  categoryId: string;
  categoryName: string;
  amountCents: number; // previsto (competência) do mês, somado por categoria
}

export interface DreReport {
  month: string;
  receitas: DreRow[];       // categorias kind = INCOME
  despesas: DreRow[];       // categorias kind = EXPENSE
  totalReceitasCents: number;
  totalDespesasCents: number;
  resultadoCents: number;   // totalReceitas - totalDespesas
  closedThroughMonth: string | null;
  isClosed: boolean;        // month <= closedThroughMonth
}

export async function dreReport(
  db: PrismaClient,
  organizationId: string,
  month: string,
): Promise<DreReport>
```

Reaproveita a mesma base de cálculo "previsto por categoria" de
`byCategoryReport`, mas separando em receitas/despesas com totais e resultado.

### Backend — regra de fechamento de mês

Nova rota `GET /reports/dre?month=YYYY-MM` (retorna `DreReport` acima).

Nova rota `POST /reports/close-period`, body `{ month: "YYYY-MM" }`:

- Define `organization.closedThroughMonth = month` (substitui o valor
  anterior — não precisa ser maior que o atual). Retorna
  `{ closedThroughMonth }`.
- Definir um mês **anterior** ao valor atual "reabre" os meses entre o novo
  valor e o antigo (não há um conceito de "mês fechado" individual, apenas um
  cursor). Não há tela dedicada de "reabrir" — é a mesma ação com um mês
  anterior.
- Sem checagem de papel/admin (consistente com o restante do app — qualquer
  usuário autenticado da organização pode chamar).

**Regra de validação em `server/src/services/entries.ts`**: ao criar
(`createSingleEntry`, `createInstallmentsEntry`, `createRecurrenceEntry`) ou
atualizar (`updateEntry`) um `Entry`, se o `competenceMonth` relevante — o
atual do registro (em updates) e/ou o novo valor enviado, e cada parcela no
caso de installments — for `<= organization.closedThroughMonth`, a operação
inteira é rejeitada com `BusinessError("PERIOD_CLOSED", "O mês <mês> está
fechado para lançamentos.")` → HTTP 422.

- Se `organization.closedThroughMonth` for `null` (estado padrão/inicial),
  nenhuma validação de período fechado é aplicada — a comparação `<=` só
  ocorre quando `closedThroughMonth` não é `null`.
- **Settlements (baixa/estorno) e Transfers NÃO são bloqueados** por mês
  fechado — fechar o mês trava apenas criação/edição de contas a
  pagar/receber com competência nos meses fechados, não a liquidação de
  pendências antigas nem transferências entre contas.
- `Recurrence`: valida o mês de competência da primeira ocorrência
  (`startMonth`/competência inicial) no momento da criação. Ocorrências
  futuras materializadas por uma recorrência já existente não passam por essa
  checagem (a recorrência foi criada quando o mês estava aberto).

### Frontend (`web/src/pages/ReportsPage.tsx`)

Nova seção "DRE":

- Seletor de mês (mesmo padrão do "Resumo por categoria" atual).
- Tabela com Receitas (por categoria) e Despesas (por categoria), totais e
  "Resultado do mês" (`resultadoCents`, destacado em verde/vermelho conforme
  positivo/negativo).
- Indicador do estado atual: "Lançamentos fechados até <closedThroughMonth>"
  (ou "Nenhum mês fechado" se `null`).
- Botão **"Fechar mês"** no mês selecionado, com diálogo de confirmação,
  chamando `POST /reports/close-period` com `{ month: <mês selecionado> }`.
  Desabilitado (ou com aviso) se o mês selecionado já estiver `<=
  closedThroughMonth` (já fechado).

## 9. Modelo de dados — resumo das mudanças

| Modelo | Mudança |
|---|---|
| `CostCenter` | novo modelo (id, organizationId, name, archivedAt, timestamps) |
| `Entry.costCenterId` | novo campo opcional (FK → CostCenter) |
| `Recurrence.costCenterId` | novo campo opcional (FK → CostCenter), herdado pelas entries materializadas |
| `Organization.closedThroughMonth` | novo campo opcional (string "YYYY-MM") |

Todas as mudanças são aditivas (campos opcionais / modelo novo) — não
quebram dados existentes, uma migration Prisma simples resolve.

## 10. Testes

- **F1**: teste de serviço para `projectionReport` cobrindo
  `payableCents`/`receivableCents` por mês além de `balanceCents` (casos com
  só payable, só receivable, e ambos no mesmo mês).
- **F3**: testes de serviço para `cost-centers.ts` (criar, listar, renomear,
  arquivar, escopo por organização — mirror dos testes de `categories`), e
  teste cobrindo criação/atualização de `Entry` com `costCenterId`
  (incluindo `null`/omitido).
- **F5**: teste de serviço para `byCounterpartyReport` (agrupamento por
  contraparte+direção, previsto vs. realizado).
- **F6**: testes de serviço para `dreReport` (receitas, despesas, resultado) e
  para a regra `PERIOD_CLOSED` — criar/atualizar entry em mês fechado retorna
  `BusinessError`; settlement em mês fechado funciona normalmente;
  `close-period` atualiza e "reabre" corretamente.
- **Rotas**: teste HTTP para `GET/POST /cost-centers`, `PATCH
  /cost-centers/:id`, `GET /reports/by-counterparty`, `GET /reports/dre`,
  `POST /reports/close-period` (incluindo caso de erro 422 por período
  fechado via API de entries).
- **Frontend**: sem testes automatizados novos (padrão do projeto); validar
  manualmente no dev server (`npm run dev`) os fluxos: Painel (duas barras),
  CRUD de centro de custo + seleção em lançamento, popup de detalhe do mês em
  Relatórios, aba DRE + "Fechar mês" + tentativa de lançamento em mês fechado.

## 11. Fora de escopo / pendências futuras

- Papel/admin para restringir quem pode criar usuários ou fechar meses —
  pendência já registrada em `docs/deploy-railway.md`, não tratada nesta fase.
- Bloqueio de `Settlement`/`Transfer` por mês fechado — decidido que fica fora
  de escopo.
- UI dedicada de "reabrir mês" — coberta pela mesma ação "Fechar mês" com um
  mês anterior (ver Seção 8).
- Conta "Caixa" (F2) é uma ação de dados, não uma migration — não entra no
  plano de implementação como fase de código.

## 12. Ordem de implementação sugerida

1. **F4** — rótulo Fornecedor/Cliente (frontend-only, baixo risco, ganho
   rápido).
2. **F1** — projeção de saldo com duas barras (back+front pequeno, isolado).
3. **F3** — centro de custo (modelo novo + CRUD completo, segue padrão
   conhecido de Categoria).
4. **F5** — relatório por contraparte + popup de detalhe do mês (depende do
   helper de F4 para os rótulos Fornecedor/Cliente no popup).
5. **F6** — DRE + fechamento de mês (maior escopo, toca validação em todos os
   caminhos de criação/edição de Entry).

F2 (conta "Caixa") é executada separadamente como ação de dados, em qualquer
momento, sem relação de dependência com as fases acima.
