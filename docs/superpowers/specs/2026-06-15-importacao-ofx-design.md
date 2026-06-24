# Importação de extrato OFX

## 1. Contexto e objetivo

Hoje, dar baixa em um lançamento (marcar como pago/recebido) é uma ação manual,
lançamento por lançamento. O objetivo desta feature é permitir importar um
arquivo OFX exportado do banco (ex.: Itaú) e, a partir dele:

- **Reconciliar**: dar baixa automaticamente nos lançamentos existentes que
  correspondem a transações do extrato.
- **Criar**: para transações sem correspondência, permitir criar um lançamento
  novo (com baixa imediata) direto da revisão.

Nada é persistido sem o usuário revisar e confirmar.

## 2. Escopo

**Dentro:**
- Importação de arquivo **OFX** por conta bancária.
- Matching automático determinístico (direção + valor + data), com revisão
  obrigatória antes de aplicar qualquer coisa.
- Criação de lançamento novo (único, com baixa imediata) para transações sem
  correspondência.
- Dedup por `FITID` entre reimportações do mesmo arquivo/período.

**Fora de escopo (trabalho futuro):**
- CSV ou outros formatos de extrato.
- Open Finance / conexão direta com banco (ex. Pluggy) — avaliado e descartado
  por ora a favor de OFX manual.
- Matching "fuzzy" por texto ou com tolerância de valor (ex. taxas bancárias).
- Importação de múltiplos arquivos/contas em uma única operação.
- Edição de lançamento existente a partir da importação — só baixa lançamento
  existente ou cria um novo.
- Persistência de transações marcadas como "Ignorar": se o mesmo arquivo for
  reimportado, elas aparecem novamente para revisão (mantém o modelo de dados
  simples, sem tabela extra só para isso).

## 3. Modelo de dados

Um campo novo em `Settlement`:

```prisma
model Settlement {
  // ...campos existentes
  importFitid String?

  @@unique([bankAccountId, importFitid])
}
```

- `importFitid` guarda o `FITID` da transação OFX que originou esta baixa.
  `null` para baixas manuais (não afetadas pelo unique — SQLite trata múltiplos
  `NULL` como distintos).
- O unique `(bankAccountId, importFitid)` é a base do dedup: se o mesmo FITID
  já foi importado para aquela conta, a transação é tratada como `duplicate`.

Nova migration em `server/prisma/migrations/`.

## 4. Parsing OFX

- Nova dependência: lib npm de parsing de OFX 1.x/2.x (a escolher na
  implementação — ex. `ofx-js` ou `node-ofx-parser`), com parser próprio como
  fallback se a lib escolhida não lidar bem com as particularidades do Itaú.
- **Pré-requisito**: um arquivo `.ofx` real exportado do Itaú, usado como
  fixture de teste — sem ele não dá para validar o parser nem o matching.
- Campos extraídos de cada `<STMTTRN>`:
  - `FITID` → id único da transação.
  - `DTPOSTED` → data (`YYYY-MM-DD`, timezone America/Sao_Paulo).
  - `TRNAMT` → `amountCents` (Int, com sinal — cuidado ao converter decimal
    para centavos).
  - `NAME` / `MEMO` → descrição.

## 5. Matching

Algoritmo determinístico, executado no preview (nada é escrito):

1. Se `FITID` já existe em `Settlement.importFitid` para essa `bankAccountId`
   → status `duplicate` (informativo, sem ação possível).
2. Direção: `TRNAMT < 0` → `PAYABLE`, `TRNAMT > 0` → `RECEIVABLE`.
3. Candidatos = `Entry` da organização, mesma direção, não soft-deletada,
   `status != "SETTLED"` (reaproveita helper `remainingCents`/status já
   existente em `entries.ts`), `remainingCents === abs(TRNAMT)`, e
   `|dueDate - DTPOSTED| <= 5 dias`.
4. Candidatos ordenados por proximidade de data.
5. Resultado:
   - **1 candidato** → status `matched`, pré-selecionado.
   - **2+ candidatos** → status `ambiguous`, usuário escolhe.
   - **0 candidatos** → status `unmatched`, usuário cria novo ou ignora.

## 6. API

Novo arquivo de rotas (ex. `server/src/routes/bank-import.ts`).

### `POST /bank-accounts/:id/import/preview`

- `multipart/form-data`, campo `file` (`.ofx`). Nova dependência:
  `@fastify/multipart` (não instalado hoje).
- Não persiste nada. Resposta:

```ts
interface ImportPreviewRow {
  fitid: string;
  date: string;        // YYYY-MM-DD
  amountCents: number; // com sinal
  description: string;
  status: "duplicate" | "matched" | "ambiguous" | "unmatched";
  candidates: Array<{
    entryId: string;
    description: string;
    counterparty: string;
    dueDate: string;
    remainingCents: number;
  }>;
}
```

Em `matched`, `candidates` tem exatamente 1 item (o pré-selecionado).

### `POST /bank-accounts/:id/import/confirm`

Body:

```ts
interface ImportConfirmRow {
  fitid: string;
  date: string;
  amountCents: number;
  description: string;
  action: "settle" | "create" | "ignore";
  entryId?: string;     // obrigatório se action === "settle"
  newEntry?: {          // obrigatório se action === "create"
    description: string;
    counterparty: string;
    categoryId: string;
    costCenterId?: string;
  };
}
```

Resposta:

```ts
interface ImportConfirmResult {
  fitid: string;
  status: "settled" | "created" | "ignored" | "duplicate" | "error";
  error?: { code: string; message: string };
}
```

Processamento **linha a linha, sequencial** (cada linha é sua própria
operação — uma falha não derruba as demais):

1. Se `FITID` já existe em `Settlement.importFitid` para essa conta →
   `duplicate`, ignora `action` (idempotente).
2. `action === "ignore"` → `ignored`, nenhuma escrita.
3. `action === "settle"` → reaproveita o service existente de dar baixa com
   `{entryId, amountCents: abs(...), settledAt: date, bankAccountId, userId,
   importFitid: fitid}`. Erros do service (ex. já totalmente baixado) voltam
   como `error` com o código/mensagem original.
4. `action === "create"` → cria `Entry` único (reaproveita o service de
   criação existente; `competenceMonth` = mês de `date`, `dueDate = date`,
   `direction`/`amountCents` da transação, demais campos de `newEntry`) +
   `Settlement` (igual ao passo 3), em uma transação. Falha em qualquer parte
   (ex. `PERIOD_CLOSED`) → `error`, nada é criado.

Reenviar `confirm` após corrigir algumas linhas é seguro: linhas já
bem-sucedidas voltam como `duplicate`.

## 7. Frontend

- Novo item de menu **"Importar extrato"** → página própria
  (`web/src/pages/ImportStatementPage.tsx`).
- **Passo 1**: seletor de conta bancária (contas não arquivadas) + input de
  arquivo `.ofx` + botão "Analisar arquivo" → chama `preview`.
- **Passo 2**: tabela de revisão — colunas Data | Descrição | Valor
  (`.money.pos/.neg`) | Destino:
  - `duplicate`: linha acinzentada, "Já importado", sem ação.
  - `matched`: pré-marcado "Baixar **[descrição do lançamento]** (venc.
    dd/mm)"; dropdown para trocar para outro candidato / "Criar novo
    lançamento" / "Ignorar".
  - `ambiguous`: dropdown já aberto com os candidatos (descrição, contraparte,
    vencimento) + "Criar novo" / "Ignorar".
  - `unmatched`: dropdown default "Criar novo lançamento" → expande Categoria*
    (obrigatório), Centro de custo (opcional), Contraparte/Descrição
    (pré-preenchido do extrato, editável); ou "Ignorar". Direção/valor/data
    vêm do extrato e não são editáveis.
  - Rodapé: contadores (ex. "12 vão ser baixados · 3 novos lançamentos · 1
    duplicado · 2 ignorados") + botão "Confirmar importação".
- **Passo 3**: após `confirm`, mostra resultado por linha — erros reaproveitam
  o padrão `ApiError`/`formError` (ex. `PERIOD_CLOSED` aparece na linha
  problemática). Linhas com erro continuam editáveis; "Confirmar" de novo
  reprocessa só essas.

Novidades técnicas no frontend:
- `web/src/api/client.ts`: variante de `apiFetch` que aceita `FormData` (sem
  `JSON.stringify`/`Content-Type` manual) para o upload.
- `shared/src/schemas/bank-import.ts`: zod schemas para `ImportConfirmInput` e
  as linhas.

## 8. Dependências novas

- `@fastify/multipart` (upload de arquivo) — backend.
- Lib de parsing OFX (a escolher na implementação) — backend.

Nenhuma das duas está instalada hoje.

## 9. Riscos / pré-requisitos

- O formato real do OFX do Itaú pode ter particularidades (encoding, SGML vs.
  XML) — só dá para validar o parser e o matching com um arquivo de exemplo
  real, que precisa ser fornecido para a implementação.
- A janela de `±5 dias` e a exigência de `remainingCents === abs(TRNAMT)` são
  heurísticas iniciais; podem precisar de ajuste após testar com extrato real.

## 10. Ordem de implementação sugerida

1. Modelo de dados (migration `importFitid`) + parsing OFX (com fixture real)
   + matching — tudo testável via testes unitários, sem API ainda.
2. API (`preview` + `confirm`), incluindo `@fastify/multipart` e reuso dos
   services de baixa/criação de lançamento.
3. Frontend: página "Importar extrato" completa (upload → revisão → confirmar
   → resultado).
