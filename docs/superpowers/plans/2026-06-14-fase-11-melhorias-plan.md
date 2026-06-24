# Plano: Fase 11 — painel, centro de custo, relatórios por mês e DRE

Spec: `docs/superpowers/specs/2026-06-14-fase-11-melhorias-design.md`

Ordem (Seção 12 da spec): F4 → F1 → F3 → F5 → F6. F3 e F6 são divididos em
backend/frontend para manter as fases pequenas (≤ ~5 tarefas cada). F2 (conta
"Caixa") é ação de dados fora deste plano.

## Fase 1: F4 — Rótulo "Contraparte" → Fornecedor/Cliente (frontend-only)

Goal: o rótulo do campo `counterparty` passa a ser "Fornecedor" (PAYABLE) ou
"Cliente" (RECEIVABLE) em toda a UI, sem mudar dados/API.

Tasks:
- [ ] Criar `web/src/lib/counterparty.ts` exportando
      `counterpartyLabel(direction: EntryDirection): "Fornecedor" | "Cliente"`
      — done quando a função existe, tipada com `EntryDirection` de
      `api/types.ts`.
- [ ] Aplicar em `SingleEntryForm.tsx`, `InstallmentsEntryForm.tsx` e
      `RecurrenceEntryForm.tsx` (label do campo contraparte usa
      `counterpartyLabel(direction)`, já que `direction` é prop desses
      componentes) — done quando o label muda conforme a direção.
- [ ] Aplicar em `EntryDetailModal.tsx`, `EditEntryModal.tsx` e
      `RecurrenceScopeModal.tsx` (usar `entry.direction`) — done quando os
      três mostram "Fornecedor"/"Cliente" corretamente para entries de cada
      direção.
- [ ] Aplicar em `EntriesPage.tsx` (cabeçalho de coluna da tabela) — done
      quando a página `/a-pagar` mostra "Fornecedor" e `/a-receber` mostra
      "Cliente" no cabeçalho.
- [ ] Revisar `web/src/api/types.ts` por labels/comentários residuais
      "Contraparte" — done quando não há mais ocorrências do texto fixo
      "Contraparte" nesses 8 arquivos (exceto o nome do campo `counterparty`
      em si, que não muda).

Verify: `npm run typecheck`; `npm run dev` e abrir um formulário em
"A pagar" (deve mostrar "Fornecedor") e em "A receber" (deve mostrar
"Cliente"), além do `EntryDetailModal` de um lançamento existente de cada
direção.

## Fase 2: F1 — Painel: Projeção de saldo com A pagar / A receber

Goal: o card "Projeção de saldo" mostra 2 barras por mês (A pagar / A
receber) em vez da barra de saldo líquido.

Tasks:
- [ ] `server/src/services/reports.ts`: `ProjectionMonth` ganha
      `payableCents`/`receivableCents` (mantendo `balanceCents`).
      `projectionReport` passa a acumular dois `Map<month, number>`
      (`payableDeltas`/`receivableDeltas`, sempre ≥ 0) em vez do `deltas`
      único com sinal — mesma lógica de bucket (`dueMonth < startMonth ?
      startMonth : dueMonth`). `balanceCents[i] = balanceCents[i-1] +
      receivableCents[i] - payableCents[i]` — done quando o tipo e a função
      compilam e preservam o valor de `balanceCents` de antes.
- [ ] `server/test/reports.test.ts`: novos casos para `projectionReport`
      cobrindo `payableCents`/`receivableCents` por mês (só payable, só
      receivable, ambos no mesmo mês, mês sem nenhum) — done quando os testes
      passam.
- [ ] `web/src/api/types.ts`: `ProjectionMonth` ganha
      `payableCents`/`receivableCents` — done quando bate com o tipo do
      backend.
- [ ] `web/src/pages/DashboardPage.tsx`: card "Projeção de saldo" renderiza 2
      `bar-row` por mês (Pagar = vermelho/`.bar.n`, Receber =
      verde/`.bar`); `maxAbs` calculado sobre todos os
      `payableCents`/`receivableCents` de `data.projection`; remove a barra
      de saldo líquido — done quando o card mostra as duas barras e o
      `saldo-strip` ("Saldo previsto") continua correto (via
      `data.projection[...].balanceCents`, inalterado).
- [ ] `web/src/styles/layout.css`: ajustar/adicionar classes para o novo
      layout de 2 linhas por mês (agrupamento visual + rótulos curtos
      "Pagar"/"Receber" no lugar do mês em cada linha, com o mês como
      cabeçalho do grupo) — done quando o layout fica legível sem overflow.

Verify: `npm test -w server -- reports.test.ts`; `npm run typecheck`;
`npm run dev` → Painel mostra 2 barras por mês em "Projeção de saldo" e
"Saldo previsto" no topo continua exibindo o valor correto.

## Fase 3: F3a — Centro de custo (backend)

Goal: novo modelo `CostCenter` com CRUD via API e suporte a `costCenterId`
opcional em `Entry`/`Recurrence`.

Tasks:
- [ ] `server/prisma/schema.prisma`: novo modelo `CostCenter` (mirror
      `Category` sem `kind`: id, organizationId, name, archivedAt,
      timestamps, índice por organizationId) + `costCenterId String?` e
      relation opcional em `Entry` e `Recurrence`. Gerar migration com
      `npx prisma migrate dev --name add_cost_center` (em `server/`) e
      aplicar via `npm run db:migrate -w server` — done quando
      `npx prisma validate` passa e a migration está em
      `server/prisma/migrations/`.
- [ ] `shared/src/schemas/cost-centers.ts`: `createCostCenterSchema`
      (`name`), `updateCostCenterSchema` (`name?`, `archived?`) — mirror
      `categories.ts`. Exportar em `shared/src/index.ts`. Em
      `shared/src/schemas/entries.ts`: `costCenterId:
      z.string().min(1).optional().nullable()` em `baseFields` (cobre single
      e installments) e em `createRecurrenceEntrySchema`,
      `updateEntrySchema` e `recurrenceScopeSchema`; `entryListQuerySchema`
      ganha `costCenterId` opcional — done quando `npm run typecheck -w
      shared` passa.
- [ ] `server/src/services/cost-centers.ts` (mirror
      `services/categories.ts`: `listCostCenters`, `createCostCenter`,
      `updateCostCenter`) + `server/src/routes/cost-centers.ts` (`GET
      /cost-centers`, `POST /cost-centers`, `PATCH /cost-centers/:id`,
      mirror `routes/categories.ts`); registrar `costCentersRoutes` em
      `server/src/app.ts` (import + `protectedApp.register` + prefixo
      `/cost-centers` em `apiPrefixes`) — done quando as 3 rotas respondem.
- [ ] `server/src/services/entries.ts` e `recurrences.ts`: aceitar
      `costCenterId` (opcional/nullable) em `CreateSingleEntryInput`,
      `CreateInstallmentsInput`, `UpdateEntryChanges`,
      `CreateRecurrenceInput` e `RecurrenceChanges`, persistindo no
      `db.entry.create`/`update` e `db.recurrence.create`/`update`;
      `materializeRange` copia `costCenterId` da recorrência para cada
      entry materializada; `listEntries`/`ListEntriesFilter` ganham filtro
      opcional `costCenterId` — done quando criar/atualizar/listar aceitam o
      campo sem quebrar os fluxos existentes (sem `costCenterId` continua
      funcionando, valor `null`).
- [ ] Testes: `server/test/http/cost-centers.test.ts` (mirror
      `http/users.test.ts`: autenticação, escopo por organização,
      criar/listar/renomear/arquivar) + caso em
      `server/test/entry-edit.test.ts` (ou novo) cobrindo criar/atualizar
      `Entry` com `costCenterId` definido, `null` e omitido — done quando os
      testes passam.

Verify: `npm run db:migrate -w server`; `npm test -w server`; `npm run
typecheck`.

## Fase 4: F3b — Centro de custo (frontend)

Goal: tela de cadastro de centros de custo + seleção/exibição nos
lançamentos.

Tasks:
- [ ] `web/src/api/cost-centers.ts` (hooks `useCostCenters`,
      `useCreateCostCenter`, `useUpdateCostCenter`, mirror
      `api/categories.ts`); `web/src/api/types.ts` ganha `CostCenter` e
      `Entry.costCenterId: string | null` — done quando os hooks compilam e
      batem com a API da Fase 3a.
- [ ] `web/src/pages/CostCentersPage.tsx` (mirror `CategoriesPage.tsx`, sem a
      separação Despesas/Receitas — uma lista única) + componentes
      `NewCostCenterModal`/`EditCostCenterModal` (mirror
      `components/categories/*`); rota `/centros-de-custo` em `App.tsx` +
      item "Centros de custo" em `Sidebar.tsx` — done quando a tela lista,
      cria, renomeia e arquiva centros de custo.
- [ ] `SingleEntryForm`, `InstallmentsEntryForm`, `RecurrenceEntryForm`:
      select opcional "Centro de custo" (`useCostCenters()`, com opção
      "Nenhum" → `undefined`/`null`) — done quando o valor selecionado é
      enviado como `costCenterId` no `POST`.
- [ ] `EntriesPage.tsx`, `EntryDetailModal.tsx`, `EditEntryModal.tsx`: exibir
      (e, no Edit, permitir alterar) o centro de custo do lançamento — done
      quando a coluna/linha mostra o nome do centro de custo (ou "—" se
      nenhum) e a edição persiste a mudança.

Verify: `npm run typecheck`; `npm run build`; `npm run dev` → criar um centro
de custo em "Centros de custo", criar um lançamento selecionando esse centro
de custo, confirmar que aparece em `EntriesPage` e no detalhe.

## Fase 5: F5 — Relatórios: detalhe do mês (popup) por categoria e
fornecedor/cliente

Goal: clicar num mês em "Fluxo de caixa mensal" abre um popup com o
detalhamento por categoria e por fornecedor/cliente daquele mês; o card
"Resumo por categoria" é removido.

Tasks:
- [ ] `server/src/services/reports.ts`: novo `byCounterpartyReport(db,
      organizationId, month)` → `CounterpartySummaryRow[]`
      (`{counterparty, direction, previstoCents, realizadoCents}`),
      agrupando `Entry`/`Settlement` do mês por `(counterparty, direction)`
      — mirror `byCategoryReport`, mas sem pré-seed (só aparecem
      combinações com algum valor no mês), ordenado por `counterparty` —
      done quando `server/test/reports.test.ts` cobre previsto e realizado
      por contraparte/direção e passa.
- [ ] `shared/src/schemas/reports.ts`: `byCounterpartyQuerySchema` (mirror
      `byCategoryQuerySchema`); `server/src/routes/reports.ts`: `GET
      /reports/by-counterparty?month=` — done quando a rota responde com os
      dados do service acima.
- [ ] `web/src/api/types.ts` (`CounterpartySummaryRow`) + `web/src/api/
      reports.ts` (`useByCounterpartyReport(month)`) — done quando tipam e
      batem com a resposta da rota.
- [ ] `web/src/pages/ReportsPage.tsx`: linhas de "Fluxo de caixa mensal"
      ficam clicáveis; clique define `detailMonth` (estado local) e monta um
      componente `MonthDetailModal` (novo, em
      `web/src/components/reports/`) só quando `detailMonth !== null`. O
      modal (`width="lg"`) usa `useByCategoryReport(detailMonth)` e
      `useByCounterpartyReport(detailMonth)` e mostra 3 seções: "Por
      categoria" (Despesas/Receitas, como o card antigo), "Fornecedores"
      (`direction === "PAYABLE"`) e "Clientes" (`direction ===
      "RECEIVABLE"`, rótulos via `counterpartyLabel` da Fase 1). Remove o
      card "Resumo por categoria" e o estado `month`/seletor que só ele
      usava — done quando o popup mostra as 3 seções para um mês com dados e
      o card antigo não existe mais.
- [ ] `web/src/styles/layout.css`: estilo de linha clicável (cursor
      pointer + hover) para as linhas de "Fluxo de caixa mensal" — done
      quando visualmente indica que a linha é clicável.

Verify: `npm test -w server -- reports.test.ts`; `npm run typecheck`;
`npm run dev` → clicar num mês com lançamentos abre o popup com categoria +
fornecedores + clientes corretos; "Resumo por categoria" não aparece mais na
página.

## Fase 6: F6a — DRE e fechamento de mês (backend)

Goal: relatório DRE por mês + ação que define `closedThroughMonth` e bloqueia
criação/edição de `Entry` com competência em meses fechados.

Tasks:
- [x] `server/prisma/schema.prisma`: `Organization.closedThroughMonth
      String?` (nullable "YYYY-MM"). Gerar migration
      (`npx prisma migrate dev --name add_closed_through_month`) e aplicar
      via `npm run db:migrate -w server` — done quando `npx prisma validate`
      passa e a migration existe.
- [x] `server/src/services/reports.ts`: `dreReport(db, organizationId,
      month)` → `DreReport` (`receitas`/`despesas`: `DreRow[]` por
      categoria com `amountCents` = previsto do mês; `totalReceitasCents`,
      `totalDespesasCents`, `resultadoCents`, `closedThroughMonth`,
      `isClosed`) — reaproveita a base de `byCategoryReport` (previsto por
      categoria) — done quando testado isoladamente.
- [x] `server/src/services/organizations.ts` (novo, pequeno):
      `getClosedThroughMonth(db, organizationId)` e
      `setClosedThroughMonth(db, organizationId, month)`.
      `shared/src/schemas/reports.ts`: `dreQuerySchema` (mirror
      `byCategoryQuerySchema`) e `closePeriodSchema` (`{ month:
      competenceMonthSchema }`). `server/src/routes/reports.ts`: `GET
      /reports/dre?month=` (retorna `dreReport`) e `POST
      /reports/close-period` (chama `setClosedThroughMonth`, retorna
      `{closedThroughMonth}`) — done quando ambas as rotas respondem.
- [x] `server/src/services/entries.ts`: nova função exportada
      `assertPeriodOpen(db, organizationId, competenceMonth)` — busca
      `organization.closedThroughMonth`; se não-`null` e `competenceMonth <=
      closedThroughMonth`, lança `BusinessError("PERIOD_CLOSED", "O mês
      <competenceMonth> está fechado para lançamentos.")`. Chamar em:
      `createSingleEntry` (competenceMonth resolvido), `createInstallments`
      (cada parcela — `addMonths(firstCompetenceMonth, i)`), `updateEntry`
      (competenceMonth atual da entry e, se enviado, o novo) e, em
      `recurrences.ts`, `createRecurrence` (`startMonth`). Settlements,
      reversals e transfers **não** chamam `assertPeriodOpen` — done quando
      cada caminho rejeita com 422 `PERIOD_CLOSED` quando aplicável e os
      demais fluxos (settlement/transfer, `closedThroughMonth === null`)
      seguem funcionando.
- [x] Testes (`server/test/reports.test.ts` + `entry-edit.test.ts`/novo
      arquivo): `dreReport` (receitas, despesas, resultado);
      `close-period` define e "reabre" (mês anterior) corretamente;
      `PERIOD_CLOSED` em create/update/installments/recurrence quando
      `competenceMonth <= closedThroughMonth`; settlement/reversal/transfer
      em mês fechado continuam OK — done quando todos passam.

Verify: `npm run db:migrate -w server`; `npm test -w server`; `npm run
typecheck`.

## Fase 7: F6b — DRE e fechamento de mês (frontend)

Goal: nova seção "DRE" em Relatórios com o resultado do mês e ação "Fechar
mês".

Tasks:
- [x] `web/src/api/types.ts` (`DreRow`, `DreReport`) + `web/src/api/
      reports.ts` (`useDreReport(month)`, `useClosePeriod()` — mutation
      `POST /reports/close-period`, invalidando `["reports", "dre"]`) — done
      quando tipam e batem com a API da Fase 6a.
- [x] `web/src/pages/ReportsPage.tsx`: nova seção/card "DRE" com seletor de
      mês (mesmo padrão `addMonths`/`formatMonthLong` já usado), tabela
      Receitas/Despesas por categoria + "Resultado do mês"
      (`resultadoCents`, verde se ≥ 0 / vermelho se < 0), indicador "Lançamentos
      fechados até <mês>" (ou "Nenhum mês fechado"), e botão "Fechar mês" com
      confirmação (ex.: `window.confirm`) que chama `useClosePeriod()` com o
      mês selecionado — desabilitado se o mês selecionado já estiver
      `<= closedThroughMonth` — done quando a seção renderiza e "Fechar mês"
      atualiza o indicador.
- [x] Verificar que o erro 422 `PERIOD_CLOSED` ao criar/editar um lançamento
      num mês fechado aparece como mensagem de erro no formulário (mesmo
      caminho `ApiError`/`formError` já usado pelos outros `BusinessError`)
      — done quando, após fechar um mês, tentar criar um lançamento com
      competência nesse mês mostra a mensagem do erro em vez de falhar
      silenciosamente.

Verify: `npm run typecheck`; `npm run build`; `npm run dev` → na aba
Relatórios, abrir "DRE", clicar "Fechar mês" no mês atual, confirmar o
indicador muda, e tentar criar um lançamento com competência nesse mês
mostra o erro `PERIOD_CLOSED`.

---

Ao final da Fase 7: `npm test -w server` (suíte completa), `npm run
typecheck` e `npm run build` verdes — equivalente à verificação final do
plano v1.
