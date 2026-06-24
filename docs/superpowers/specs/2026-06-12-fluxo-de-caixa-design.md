# Spec — App de Fluxo de Caixa para Pequena Empresa

**Data:** 2026-06-12
**Status:** Aprovado em brainstorming, aguardando revisão final do spec escrito

## 1. Objetivo

Aplicativo web de fluxo de caixa para controle financeiro de uma pequena empresa: contas a pagar e a receber, controle de saldo bancário derivado de movimentações, painel mensal com previsto x realizado e projeção de saldo, e relatórios.

## 2. Decisões de produto (definidas no brainstorming)

| Tema | Decisão |
|---|---|
| Usuários | 2–5 pessoas, todos com acesso total; auditoria registra quem fez cada baixa/estorno; sem papéis/permissões na v1; usuários criados via seed (sem tela de cadastro) |
| Categorias | Cadastráveis pelo usuário, cada uma tipada como `EXPENSE` ou `INCOME`, com arquivamento; seed traz conjunto inicial típico |
| Recorrência | Materializa ocorrências 12 meses à frente, horizonte rolante completado automaticamente no uso do sistema |
| Edição de série | "Só esta" ou "esta e futuras" (estilo agenda); ocorrências pagas nunca mudam |
| Transferências | Entre contas bancárias na v1; não aparecem como despesa/receita em relatórios |
| Fuso/moeda | `America/Sao_Paulo` e BRL, fixos como constantes de configuração do servidor |
| Multiempresa | `organizationId` em todas as tabelas de negócio desde a primeira migration, uma organização criada no seed, queries filtram por ela; **nenhuma UI ou seleção de empresa na v1** |
| Edição/exclusão | Conta em aberto: edição livre e exclusão (soft delete). Conta com baixa (total ou parcial): valor e datas travados — estornar primeiro para corrigir |
| Modelagem | Lançamento unificado (`Entry` com `direction`), regras implementadas uma única vez; API expõe `/payables` e `/receivables` separados |

## 3. Regras centrais (invariantes do sistema)

1. **Dinheiro nunca é float.** Todos os valores monetários são inteiros em centavos (`amountCents`).
2. **Saldo é derivado, nunca editado.** Saldo da conta = saldo inicial + Σ movimentações. Não existe coluna de saldo atual.
3. **Três datas, três significados.** Competência (`competenceMonth`, a que mês a conta pertence), vencimento (`dueDate`) e pagamento efetivo (`settledAt`, na baixa). Relatórios por competência e por caixa usam datas diferentes e nunca se confundem.
4. **Status é calculado, não armazenado.** `OPEN` / `SETTLED` / `OVERDUE` derivam de baixas + vencimento. "Vencida" = em aberto com `dueDate` < hoje em America/Sao_Paulo. "Pago"/"Recebido" é rótulo de exibição conforme a direção.
5. **Histórico nunca é apagado.** Estorno cria registros compensatórios (settlement negativa + movimentação oposta). Exclusão de lançamento é soft delete e só é permitida sem baixas.
6. **Toda mutação é auditável.** `createdAt`/`updatedAt` em tudo; baixas, estornos e transferências registram o usuário que executou.

## 4. Modelo de dados

Todas as tabelas de negócio têm `id` (cuid), `organizationId`, `createdAt`, `updatedAt`.

### Organization
- `name`

### User
- `name`, `email` (único), `passwordHash` (argon2)

### BankAccount
- `name` (ex: "Itaú PJ"), `initialBalanceCents`, `archivedAt?`

### Category
- `name`, `kind: EXPENSE | INCOME`, `archivedAt?`

### Entry (lançamento — unifica a pagar e a receber)
- `direction: PAYABLE | RECEIVABLE`
- `description`, `counterparty` (fornecedor/cliente), `notes?`
- `categoryId` → Category (kind coerente com direction: PAYABLE→EXPENSE, RECEIVABLE→INCOME)
- `amountCents` (> 0)
- `competenceMonth` (string `"YYYY-MM"`)
- `dueDate` (date)
- `recurrenceId?` → Recurrence (se gerada por recorrência)
- `installmentGroupId?` (cuid de grupo) + `installmentNumber?` / `installmentTotal?` (se parcela)
- `deletedAt?` (soft delete)
- **Derivados (nunca colunas):** `settledCents` = Σ settlements não estornadas; `remainingCents` = `amountCents − settledCents`; `status` = SETTLED se remaining = 0, OVERDUE se remaining > 0 e dueDate < hoje (America/Sao_Paulo), senão OPEN.

### Settlement (baixa)
- `entryId` → Entry
- `amountCents` (> 0 na baixa; negativa quando é estorno)
- `settledAt` (date — data real do pagamento/recebimento)
- `bankAccountId` → BankAccount
- `userId` → User (quem executou)
- `notes?`
- `reversalOfId?` → Settlement (preenchido na settlement compensatória do estorno)
- `reversedById?` → Settlement (preenchido na original quando estornada)

### Recurrence (regra de recorrência)
- `direction`, `description`, `counterparty`, `categoryId`, `amountCents`
- `dueDay` (dia do mês de vencimento, 1–31; meses curtos usam o último dia)
- `startMonth` (`"YYYY-MM"`), `endMonth?` (`"YYYY-MM"`, opcional)
- `canceledAt?`

### Movement (movimentação bancária)
- `bankAccountId` → BankAccount
- `amountCents` (com sinal: negativo sai, positivo entra)
- `type: SETTLEMENT | REVERSAL | TRANSFER_OUT | TRANSFER_IN`
- `settlementId?` → Settlement (para SETTLEMENT/REVERSAL)
- `transferId?` → Transfer (para TRANSFER_*)
- `userId`, `description`

### Transfer (transferência entre contas)
- `fromAccountId`, `toAccountId` (≠), `amountCents` (> 0), `date`, `userId`, `notes?`
- Gera exatamente 2 Movements (TRANSFER_OUT e TRANSFER_IN) na mesma transação.

## 5. Regras de negócio (services)

### Baixa — `settleEntry`
- Entrada: `entryId`, `amountCents`, `settledAt`, `bankAccountId`, `notes?`, `userId`.
- Validações: entry existe e não deletada; `amountCents > 0` e ≤ `remainingCents`; conta bancária existe e não arquivada.
- Transação atômica: cria Settlement + Movement (negativo para PAYABLE, positivo para RECEIVABLE).
- Baixa parcial: settlement menor que o restante; status permanece OPEN/OVERDUE até remaining = 0.

### Estorno — `reverseSettlement`
- Validações: settlement existe, não é estorno, não foi estornada.
- Transação atômica: cria Settlement negativa (`reversalOfId` → original; original ganha `reversedById`) + Movement oposto (type REVERSAL).
- Settlements estornadas e seus estornos não contam em `settledCents`.

### Parcelamento — `createInstallments`
- Entrada: dados da conta + `installmentTotal` (N), primeira `dueDate` e primeiro `competenceMonth`.
- Gera N Entries independentes, mesmo `installmentGroupId`, vencimentos e competências mensais consecutivos.
- **Arredondamento:** divide o total em centavos (`floor(total/N)`); o resto (`total − N*floor`) vai na última parcela. Invariante testada: Σ parcelas = total exato.

### Recorrência — `createRecurrence` / `ensureHorizon` / `updateRecurrence` / `cancelRecurrence`
- `createRecurrence`: materializa Entries de `startMonth` até `min(start+11, endMonth)`.
- `ensureHorizon`: chamado em requests de leitura relevantes (dashboard/listagens), gera ocorrências faltantes até manter 12 meses à frente. Idempotente.
- `updateRecurrence` com escopo: `only_this` (desvincula a entry da série e aplica a mudança só nela) ou `this_and_future` (atualiza a regra e regenera ocorrências em aberto com competência ≥ a da ocorrência base; pagas/parcialmente pagas não mudam).
- `cancelRecurrence`: marca `canceledAt`, soft delete das ocorrências em aberto futuras; pagas permanecem.

### Transferência — `createTransfer`
- Validações: contas distintas, ambas ativas, valor > 0.
- Transação atômica: Transfer + 2 Movements.

### Edição/exclusão de Entry
- Sem baixas: todos os campos editáveis; DELETE faz soft delete.
- Com baixa (ativa, não estornada): apenas `description`, `counterparty`, `notes`, `categoryId` editáveis; `amountCents`, `dueDate`, `competenceMonth` travados (422 `ENTRY_HAS_SETTLEMENTS`); DELETE bloqueado.

### Relatórios
- **Previsto do mês** = Σ Entries (não deletadas) por `competenceMonth`, separado por direção.
- **Realizado do mês** = Σ Settlements líquidas (descontando estornos) por `settledAt`, separado por direção.
- **Saldo previsto do fim do mês** = saldo atual + Σ `remainingCents` das contas em aberto com `dueDate` dentro do mês corrente (recebíveis somam, pagáveis subtraem).
- **Projeção (N meses)** = saldo atual acumulando `remainingCents` das contas em aberto mês a mês pelo `dueDate`. Contas vencidas e não pagas entram no primeiro mês da projeção.
- **Por categoria** = Σ por categoria no mês, eixo de competência (previsto) e de caixa (realizado), lado a lado.

## 6. API

Fastify + zod na borda. Sessão via cookie httpOnly com JWT; tudo protegido exceto `/auth/login`. Erros de negócio: **422** `{ code, message }` (ex: `ENTRY_ALREADY_SETTLED`, `ENTRY_HAS_SETTLEMENTS`, `SETTLEMENT_ALREADY_REVERSED`, `AMOUNT_EXCEEDS_REMAINING`). Validação de formato: **400** com campo apontado.

```
POST   /auth/login                     { email, password } → cookie de sessão
POST   /auth/logout
GET    /auth/me

GET    /payables                       ?month=YYYY-MM&status=&categoryId=&bankAccountId=
GET    /receivables                    (mesmos filtros; ambos retornam Entries da direção com derivados)
POST   /payables | /receivables        body com discriminador: { kind: "single" | "installments" | "recurrence", ... }
GET    /entries/:id                    detalhe com baixas
PATCH  /entries/:id                    campos permitidos conforme status
DELETE /entries/:id                    soft delete (só sem baixas)
PATCH  /entries/:id/recurrence-scope   edição de série: { scope: "only_this" | "this_and_future", ... }

POST   /entries/:id/settle             { amountCents, settledAt, bankAccountId, notes? }
POST   /settlements/:id/reverse

GET    /bank-accounts                  com saldo derivado
POST   /bank-accounts                  { name, initialBalanceCents }
PATCH  /bank-accounts/:id              renomear / arquivar
GET    /bank-accounts/:id/statement    ?from=&to= — extrato com saldo corrente

GET    /categories                     ?kind=
POST   /categories | PATCH /categories/:id

POST   /transfers                      { fromAccountId, toAccountId, amountCents, date, notes? }

GET    /dashboard?month=YYYY-MM        payload único: saldos por conta, totais do mês,
                                       alertas (vencidas, hoje, próximos 7 dias), projeção 6 meses
GET    /reports/cash-flow?year=YYYY    previsto x realizado, 12 meses
GET    /reports/by-category?month=YYYY-MM
GET    /reports/projection?months=N
```

## 7. Frontend

**Stack:** React 18 + TypeScript + Vite, React Router, TanStack Query (cache e invalidação após mutações), react-hook-form + zod (schemas compartilhados via `/shared`), CSS próprio com design tokens (sem framework pesado).

**Layout aprovado (mockup Opção B):** sidebar fixa à esquerda com navegação e saldos por conta sempre visíveis; conteúdo à direita. Referência visual: `docs/superpowers/mockups/painel-opcoes.html`.

**Telas:**
- **Login** — única tela fora do layout com sidebar.
- **Painel** — régua de saldos (atual, a receber no mês, a pagar no mês, previsto fim do mês), card de atenção (vencidas/hoje/7 dias), card de projeção de saldo 6 meses, navegação de mês (◀ mês ▶).
- **A pagar / A receber** — tabelas gêmeas filtráveis (mês, status, categoria, conta); "Novo lançamento" abre modal com abas Único / Parcelado / Recorrente; ações por linha: dar baixa (modal com valor restante pré-preenchido, data, conta — permite parcial), editar, excluir; detalhe mostra histórico de baixas com estorno.
- **Contas bancárias** — cards com saldo derivado; extrato de movimentações por conta; ação "Transferir entre contas".
- **Relatórios** — fluxo mensal previsto x realizado (ano), resumo por categoria do mês.
- **Categorias** — CRUD com tipo e arquivamento.

**Direção visual:** ferramenta financeira sóbria e profissional; números tabulares; verde para entradas e vermelho para saídas de forma consistente; hierarquia clara com saldo como elemento central; responsivo (sidebar colapsa em telas estreitas).

**Formato de exibição:** valores em `R$ 1.234,56` (pt-BR), entrada de valores com máscara de moeda convertendo para centavos.

## 8. Arquitetura e estrutura do repositório

```
/server               Fastify + Prisma + SQLite (preparado para PostgreSQL)
  /prisma             schema.prisma, migrations, seed.ts
  /src
    /routes           validação zod, chamam services, sem regra de negócio
    /services         todas as regras de negócio, puros e testáveis
    /repositories     acesso a dados (Prisma), sem regra de negócio
    /lib              config (timezone, moeda), datas, erros
  /test               unitários de services + integração dos fluxos críticos
/web                  React + Vite
  /src
    /pages /components /api /lib
/shared               schemas zod e tipos da API compartilhados
package.json          npm workspaces
```

- SQLite via Prisma com `provider` isolado em config; sem SQL cru nem features exclusivas de SQLite, para migração futura a PostgreSQL trocando o datasource + migrations.
- Migrations sempre via `prisma migrate`; nunca edição manual de schema.

## 9. Seed

- 1 Organization, 2 Users, 2 BankAccounts (saldos iniciais distintos), ~8 Categories típicas (Aluguel, Fornecedores, Impostos, Utilidades, Salários, Vendas, Serviços, Outros).
- ~6 meses de Entries (3 passados, atual, 2 futuros): pagas, recebidas, em aberto, vencidas, parciais, 1 estorno, 1 parcelamento 6x, 2 recorrências (1 despesa, 1 receita), 1 transferência.

## 10. Testes

Vitest no servidor. Unitários dos services (rodando contra SQLite em memória/arquivo temporário):
- Baixa total, parcial e múltiplas parciais (status e remaining).
- Estorno: saldo restaurado, conta reaberta, dupla reversão bloqueada.
- Arredondamento de parcelas: Σ parcelas = total exato (casos com resto).
- Vencida no fuso America/Sao_Paulo: conta que vence "hoje" não é vencida; edge de virada de dia UTC.
- Totais previsto x realizado: conta de competência junho paga em julho aparece no previsto de junho e realizado de julho.
- Recorrência: materialização de 12 meses, ensureHorizon idempotente, edição this_and_future preserva pagas.
- Transferência: dois movements, soma zero entre contas.

Integração (um por fluxo crítico):
- criar conta → baixar → conferir saldo → estornar → conferir saldo restaurado.
- criar parcelamento → baixar 1 parcela → relatório do mês reflete só a parcela.

## 11. Fora de escopo da v1

Multiempresa (UI/isolamento), papéis e permissões, cadastro de usuários pela interface, anexos/comprovantes, centro de custo, importação OFX, Open Finance, multi-moeda, fuso configurável, notificações por e-mail.

## 12. Ordem de implementação

1. Monorepo + tooling (workspaces, TypeScript, vitest, Prisma).
2. Schema + migrations + seed.
3. Services com testes unitários (regras antes de rotas).
4. Rotas com validação + testes de integração + auth.
5. Frontend: layout/sidebar + login → painel → a pagar/receber → contas/transferências → relatórios/categorias.
6. Documentação da API (README com endpoints, payloads e erros) e instruções de execução local.
