# API — Fluxo de Caixa

Referência da API Fastify do `server`. Para instalação, variáveis de ambiente e como rodar o servidor, veja o [README raiz](../README.md).

## Visão geral

- **Base URL (dev):** `http://127.0.0.1:3333` (configurável via `PORT`/`HOST`)
- **Formato:** JSON (`Content-Type: application/json`)
- **Fuso horário:** `America/Sao_Paulo` — datas-calendário (`dueDate`, `settledAt`, `date`, `competenceMonth`, `startMonth`, `endMonth`, `month`) são strings `"YYYY-MM-DD"` ou `"YYYY-MM"`, sem horário/fuso embutido
- **Moeda:** BRL, sempre como inteiro em centavos (`amountCents`, `balanceCents`, `totalBalanceCents`, etc.)
- **Multiempresa:** todo dado é isolado por `organizationId`, derivado da sessão — nunca enviado pelo cliente

## Autenticação

Sessão via cookie httpOnly `fluxo_session` (JWT, `sameSite=lax`, expira em 7 dias). Sem cookie válido, qualquer rota protegida responde **401** `{ code: "UNAUTHENTICATED", message: "Sessão inválida ou ausente" }`.

Rotas públicas (não exigem cookie): `GET /health`, `POST /auth/login`, `POST /auth/logout`. Todas as demais — incluindo `GET /auth/me` — exigem sessão válida.

### `POST /auth/login`

Body:

```ts
{ email: string; password: string }
```

- **200** — define o cookie de sessão e retorna:
  ```ts
  { id: string; name: string; email: string; organizationId: string }
  ```
- **422** `INVALID_CREDENTIALS` — e-mail ou senha inválidos.

### `POST /auth/logout`

Sem body. Limpa o cookie de sessão.

- **200** — `{ ok: true }`

### `GET /auth/me`

- **200** — `{ id: string; organizationId: string; name: string; email: string }`
- **401** se não houver sessão válida.

## Formato de erros

| Situação | Status | Corpo |
|---|---|---|
| Payload fora do formato esperado (zod) | **400** | `{ field: string; message: string }` — `field` é o caminho do primeiro campo inválido (ou `"(root)"`) |
| Regra de negócio violada | **422** | `{ code: string; message: string }` |
| Recurso não encontrado | **404** | `{ code: string; message: string }` |
| Sem sessão válida | **401** | `{ code: "UNAUTHENTICATED", message: "Sessão inválida ou ausente" }` |
| Erro inesperado | **500** | `{ code: "INTERNAL_ERROR", message: "Erro interno do servidor" }` |

### Catálogo de códigos — 422 (regra de negócio)

| Código | Mensagem | Onde ocorre |
|---|---|---|
| `INVALID_CREDENTIALS` | E-mail ou senha inválidos | `POST /auth/login` |
| `AMOUNT_MUST_BE_POSITIVE` | Valor (da baixa) deve ser maior que zero | criação/edição de lançamentos e recorrências, baixas, transferências |
| `AMOUNT_TOO_SMALL` | Valor total menor que 1 centavo por parcela | `POST /payables`/`/receivables` (kind: `installments`) |
| `INVALID_INSTALLMENT_COUNT` | Parcelamento exige 2 ou mais parcelas | idem |
| `CATEGORY_KIND_MISMATCH` | Categoria `EXPENSE`/`INCOME` não pode ser usada em lançamento `PAYABLE`/`RECEIVABLE` | criação/edição de lançamentos e recorrências |
| `ENTRY_ALREADY_SETTLED` | Lançamento já está totalmente baixado | `POST /entries/:id/settle` |
| `AMOUNT_EXCEEDS_REMAINING` | Valor excede o restante em aberto (N centavos) | `POST /entries/:id/settle` |
| `ENTRY_HAS_SETTLEMENTS` | Lançamento com baixa ativa: estorne antes de alterar \<campos\> / não pode ser excluído: estorne primeiro | `PATCH /entries/:id`, `DELETE /entries/:id`, `PATCH /entries/:id/recurrence-scope` |
| `BANK_ACCOUNT_ARCHIVED` | Conta bancária arquivada não recebe baixas / não transfere | `POST /entries/:id/settle`, `POST /transfers` |
| `CANNOT_REVERSE_REVERSAL` | Um estorno não pode ser estornado | `POST /settlements/:id/reverse` |
| `SETTLEMENT_ALREADY_REVERSED` | Baixa já foi estornada | `POST /settlements/:id/reverse` |
| `TRANSFER_SAME_ACCOUNT` | Contas de origem e destino devem ser diferentes | `POST /transfers` |
| `ENTRY_NOT_RECURRENT` | Lançamento não pertence a uma recorrência | `PATCH /entries/:id/recurrence-scope` |
| `INVALID_MONTH` | endMonth anterior a startMonth | `POST /payables`/`/receivables` (kind: `recurrence`) |

### Catálogo de códigos — 404 (não encontrado)

| Código | Mensagem |
|---|---|
| `ENTRY_NOT_FOUND` | Lançamento não encontrado |
| `CATEGORY_NOT_FOUND` | Categoria não encontrada (ou arquivada) |
| `BANK_ACCOUNT_NOT_FOUND` | Conta bancária não encontrada |
| `SETTLEMENT_NOT_FOUND` | Baixa não encontrada |

## Lançamentos: `/payables` e `/receivables`

As duas rotas compartilham a mesma implementação, diferindo apenas pela `direction` (`PAYABLE` para `/payables`, `RECEIVABLE` para `/receivables`). Antes de listar, o horizonte de recorrências (12 meses rolantes) é materializado automaticamente.

### Shape `Entry`

```ts
{
  id: string;
  direction: "PAYABLE" | "RECEIVABLE";
  description: string;
  counterparty: string;
  notes: string | null;
  categoryId: string;
  amountCents: number;
  competenceMonth: string;       // "YYYY-MM"
  dueDate: string;                // "YYYY-MM-DD"
  recurrenceId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  createdAt: string;               // ISO datetime
  updatedAt: string;               // ISO datetime
  // derivados:
  settledCents: number;            // soma das baixas ativas (não estornadas)
  remainingCents: number;          // amountCents - settledCents
  status: "OPEN" | "SETTLED" | "OVERDUE";
}
```

`EntryDetail` é `Entry` mais `settlements: Settlement[]` (ver shape `Settlement` abaixo).

### `GET /payables` / `GET /receivables`

Query (todos opcionais):

```ts
{
  month?: string;          // "YYYY-MM" — filtra por competência
  status?: "OPEN" | "SETTLED" | "OVERDUE";
  categoryId?: string;
  bankAccountId?: string;  // entries com baixa ativa nessa conta
}
```

- **200** — `Entry[]`

### `POST /payables` / `POST /receivables`

Body discriminado por `kind`:

**`kind: "single"`** — lançamento único:

```ts
{
  kind: "single";
  description: string;
  counterparty: string;
  notes?: string;
  categoryId: string;
  amountCents: number;          // > 0
  dueDate: string;               // "YYYY-MM-DD"
  competenceMonth?: string;      // "YYYY-MM" — default: mês do dueDate
}
```

- **201** — `{ entry: Entry }`

**`kind: "installments"`** — parcelamento (N entries independentes, resto na última parcela):

```ts
{
  kind: "installments";
  description: string;
  counterparty: string;
  notes?: string;
  categoryId: string;
  totalCents: number;             // > 0
  installmentTotal: number;       // >= 2
  firstDueDate: string;           // "YYYY-MM-DD"
  firstCompetenceMonth: string;   // "YYYY-MM"
}
```

- **201** — `{ entries: Entry[] }` (length = `installmentTotal`)

**`kind: "recurrence"`** — cria a regra e materializa ocorrências 12 meses à frente:

```ts
{
  kind: "recurrence";
  description: string;
  counterparty: string;
  categoryId: string;
  amountCents: number;     // > 0
  dueDay: number;           // 1-31 (meses curtos usam o último dia)
  startMonth: string;       // "YYYY-MM"
  endMonth?: string;        // "YYYY-MM"
}
```

- **201** — `{ recurrence: Recurrence }`, onde:
  ```ts
  Recurrence = {
    id: string;
    organizationId: string;
    direction: "PAYABLE" | "RECEIVABLE";
    description: string;
    counterparty: string;
    categoryId: string;
    amountCents: number;
    dueDay: number;
    startMonth: string;
    endMonth: string | null;
    materializedUntil: string | null;
    canceledAt: string | null;
    createdAt: string;
    updatedAt: string;
  }
  ```

Erros possíveis (todos os `kind`s): `404 CATEGORY_NOT_FOUND`, `422 CATEGORY_KIND_MISMATCH`. Específicos de `installments`: `422 INVALID_INSTALLMENT_COUNT`, `422 AMOUNT_TOO_SMALL`. Específico de `recurrence`: `422 INVALID_MONTH` (`endMonth` anterior a `startMonth`).

### `GET /entries/:id`

- **200** — `EntryDetail`
- **404** `ENTRY_NOT_FOUND`

### `PATCH /entries/:id`

Body (todos opcionais, ao menos um obrigatório):

```ts
{
  description?: string;
  counterparty?: string;
  notes?: string | null;
  categoryId?: string;
  amountCents?: number;        // > 0
  dueDate?: string;             // "YYYY-MM-DD"
  competenceMonth?: string;     // "YYYY-MM"
}
```

Se o lançamento tem baixa ativa (não estornada), `amountCents`, `dueDate` e `competenceMonth` ficam travados — estorne a baixa primeiro para alterá-los. `description`, `counterparty`, `notes` e `categoryId` podem ser editados livremente.

- **200** — `EntryDetail`
- **400** se nenhum campo for enviado
- **404** `ENTRY_NOT_FOUND` ou `CATEGORY_NOT_FOUND`
- **422** `CATEGORY_KIND_MISMATCH`, `AMOUNT_MUST_BE_POSITIVE`, `ENTRY_HAS_SETTLEMENTS` (ao tentar alterar campo travado)

### `DELETE /entries/:id`

Soft delete — só permitido sem baixas ativas.

- **200** — `{ ok: true }`
- **404** `ENTRY_NOT_FOUND`
- **422** `ENTRY_HAS_SETTLEMENTS`

### `PATCH /entries/:id/recurrence-scope`

Edição de série, estilo agenda. Body:

```ts
{
  scope: "only_this" | "this_and_future";
  description?: string;
  counterparty?: string;
  categoryId?: string;
  amountCents?: number;   // > 0
  dueDay?: number;         // 1-31
}
```

- `"only_this"`: desvincula esta ocorrência da recorrência (`recurrenceId` → `null`) e aplica as mudanças só a ela. Se houver baixa ativa, `amountCents` não pode ser alterado.
- `"this_and_future"`: atualiza a regra da `Recurrence` e todas as ocorrências futuras (a partir da competência desta, inclusive) que ainda não têm baixa ativa. Ocorrências pagas nunca mudam.

- **200** — `EntryDetail` (a entry referenciada por `:id`, já atualizada)
- **404** `ENTRY_NOT_FOUND` ou `CATEGORY_NOT_FOUND`
- **422** `ENTRY_NOT_RECURRENT`, `CATEGORY_KIND_MISMATCH`, `ENTRY_HAS_SETTLEMENTS` (`only_this` + `amountCents` com baixa ativa)

## Baixas e estornos

### Shape `Settlement`

```ts
{
  id: string;
  entryId: string;
  amountCents: number;        // positivo na baixa, negativo no estorno
  settledAt: string;           // "YYYY-MM-DD"
  bankAccountId: string;
  userId: string;
  notes: string | null;
  reversalOfId: string | null;  // preenchido na settlement compensatória
  reversedById: string | null;  // preenchido na settlement original, após estorno
  createdAt: string;            // ISO datetime
}
```

### `POST /entries/:id/settle`

Body:

```ts
{
  amountCents: number;       // > 0, <= remainingCents
  settledAt: string;          // "YYYY-MM-DD"
  bankAccountId: string;
  notes?: string;
}
```

Cria a `Settlement` e o `Movement` correspondente (sinal negativo para `PAYABLE`, positivo para `RECEIVABLE`), atomicamente.

- **201** — `Settlement`
- **404** `ENTRY_NOT_FOUND` ou `BANK_ACCOUNT_NOT_FOUND`
- **422** `AMOUNT_MUST_BE_POSITIVE`, `ENTRY_ALREADY_SETTLED`, `AMOUNT_EXCEEDS_REMAINING`, `BANK_ACCOUNT_ARCHIVED`

### `POST /settlements/:id/reverse`

Sem body. Cria uma settlement compensatória (`amountCents` negado, `reversalOfId` apontando para a original) e o `Movement` oposto.

- **201** — `Settlement` (a settlement de estorno)
- **404** `SETTLEMENT_NOT_FOUND`
- **422** `CANNOT_REVERSE_REVERSAL`, `SETTLEMENT_ALREADY_REVERSED`

## `POST /transfers`

Transferência entre contas bancárias da organização — gera dois `Movement`s (`TRANSFER_OUT` na origem, `TRANSFER_IN` no destino) que somam zero. Não aparece em relatórios de despesa/receita.

Body:

```ts
{
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;   // > 0
  date: string;           // "YYYY-MM-DD"
  notes?: string;
}
```

- **201**:
  ```ts
  {
    id: string;
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    date: string;          // "YYYY-MM-DD"
    notes: string | null;
    createdAt: string;      // ISO datetime
  }
  ```
- **404** `BANK_ACCOUNT_NOT_FOUND` (origem ou destino)
- **422** `AMOUNT_MUST_BE_POSITIVE`, `TRANSFER_SAME_ACCOUNT`, `BANK_ACCOUNT_ARCHIVED`

## Contas bancárias

### `GET /bank-accounts`

Lista as contas ativas da organização com saldo derivado (`initialBalanceCents` + soma de todas as movimentações).

- **200**:
  ```ts
  Array<{
    id: string;
    organizationId: string;
    name: string;
    initialBalanceCents: number;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
    balanceCents: number;   // derivado
  }>
  ```

### `POST /bank-accounts`

Body:

```ts
{ name: string; initialBalanceCents: number }
```

- **201**:
  ```ts
  {
    id: string;
    organizationId: string;
    name: string;
    initialBalanceCents: number;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }
  ```

### `PATCH /bank-accounts/:id`

Renomear e/ou arquivar/desarquivar. Body (ao menos um campo):

```ts
{ name?: string; archived?: boolean }
```

- **200** — mesmo shape de `POST /bank-accounts` (sem `balanceCents`)
- **400** se nenhum campo for enviado
- **404** `BANK_ACCOUNT_NOT_FOUND`

> Contas arquivadas saem da listagem de `GET /bank-accounts` e não podem receber baixas (`BANK_ACCOUNT_ARCHIVED`) nem participar de transferências.

### `GET /bank-accounts/:id/statement`

Extrato com saldo corrente. Query (opcionais):

```ts
{ from?: string; to?: string }  // "YYYY-MM-DD"
```

- **200**:
  ```ts
  {
    accountId: string;
    accountName: string;
    openingBalanceCents: number;   // saldo no início do período (ou inicial da conta)
    closingBalanceCents: number;   // saldo no fim do período
    lines: Array<{
      id: string;
      date: string;                 // "YYYY-MM-DD"
      type: "SETTLEMENT" | "REVERSAL" | "TRANSFER_OUT" | "TRANSFER_IN";
      amountCents: number;          // com sinal
      description: string;
      balanceCents: number;         // saldo corrente após esta linha
    }>;
  }
  ```
- **404** `BANK_ACCOUNT_NOT_FOUND`

## Categorias

### `GET /categories`

Query opcional:

```ts
{ kind?: "EXPENSE" | "INCOME" }
```

- **200**:
  ```ts
  Array<{
    id: string;
    organizationId: string;
    name: string;
    kind: "EXPENSE" | "INCOME";
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>
  ```
  Ordenado por `kind` e depois `name`. Inclui categorias arquivadas (sem filtro de `archivedAt`).

### `POST /categories`

Body:

```ts
{ name: string; kind: "EXPENSE" | "INCOME" }
```

- **201** — mesmo shape de um item de `GET /categories`

### `PATCH /categories/:id`

Renomear e/ou arquivar/desarquivar. Body (ao menos um campo):

```ts
{ name?: string; archived?: boolean }
```

- **200** — mesmo shape de um item de `GET /categories`
- **400** se nenhum campo for enviado
- **404** `CATEGORY_NOT_FOUND`

> Categorias arquivadas continuam aparecendo em `GET /categories` (para exibir lançamentos antigos), mas não podem ser usadas em novos lançamentos (`CATEGORY_NOT_FOUND` ao criar/editar entry com `categoryId` arquivado).

## `GET /dashboard`

Painel mensal: saldos por conta, totais previsto x realizado do mês, alertas de vencimento e projeção de saldo. Materializa o horizonte de recorrências antes de agregar.

Query:

```ts
{ month: string }  // "YYYY-MM"
```

- **200**:
  ```ts
  {
    month: string;
    accounts: Array<{ id: string; name: string; balanceCents: number }>;
    totalBalanceCents: number;
    totals: {
      payable: { previstoCents: number; realizadoCents: number };
      receivable: { previstoCents: number; realizadoCents: number };
    };
    alerts: {
      overdue: AlertEntry[];   // dueDate < hoje, em aberto
      dueToday: AlertEntry[];  // dueDate === hoje
      dueSoon: AlertEntry[];   // hoje < dueDate <= hoje + 7 dias
    };
    projection: ProjectionMonth[];  // 6 meses (PROJECTION_MONTHS), a partir do mês atual
  }
  ```
  onde:
  ```ts
  AlertEntry = {
    id: string;
    direction: "PAYABLE" | "RECEIVABLE";
    description: string;
    counterparty: string;
    categoryId: string;
    dueDate: string;          // "YYYY-MM-DD"
    remainingCents: number;
  }

  ProjectionMonth = { month: string; payableCents: number; receivableCents: number; balanceCents: number }
  ```

`totals.*.previstoCents` soma `amountCents` das entries com `competenceMonth === month`; `totals.*.realizadoCents` soma `amountCents` das settlements (ativas) com `settledAt` no mês.

## Relatórios

### `GET /reports/cash-flow`

Fluxo de caixa mensal — previsto (por competência) x realizado (por data de baixa), os 12 meses do ano informado.

Query:

```ts
{ year: number }   // ex: 2026
```

- **200**:
  ```ts
  Array<{
    month: string;  // "YYYY-01".."YYYY-12"
    previsto: { payableCents: number; receivableCents: number };
    realizado: { payableCents: number; receivableCents: number };
  }>
  ```

### `GET /reports/by-category`

Resumo do mês por categoria, previsto x realizado lado a lado. Inclui todas as categorias ativas (mesmo com valores zerados), ordenadas por `kind` (despesas antes de receitas) e depois `name`.

Query:

```ts
{ month: string }  // "YYYY-MM"
```

- **200**:
  ```ts
  Array<{
    categoryId: string;
    categoryName: string;
    kind: "EXPENSE" | "INCOME";
    previstoCents: number;
    realizadoCents: number;
  }>
  ```

### `GET /reports/projection`

Projeção de saldo acumulado por `dueDate` das entries em aberto (recebíveis somam, pagáveis subtraem). Vencidas e não pagas entram no primeiro mês.

Query opcional:

```ts
{ months?: number }  // default: PROJECTION_MONTHS (6)
```

- **200**:
  ```ts
  Array<{
    month: string;
    payableCents: number;     // total em aberto (PAYABLE) com bucket nesse mês, >= 0
    receivableCents: number;  // total em aberto (RECEIVABLE) com bucket nesse mês, >= 0
    balanceCents: number;     // acumulado: balanceCents[i-1] + receivableCents[i] - payableCents[i]
  }>  // length = months
  ```

## `GET /health`

Pública, sem autenticação.

- **200** — `{ status: "ok" }`
