# Plan: Grupo A — Relatório por Obra, Gráfico Dashboard, Exportar PDF/Excel
Spec: docs/superpowers/specs/2026-06-15-grupo-a-relatorios-dashboard-export-design.md

---

## Phase 1: Backend — novos serviços, schemas e rotas

**Goal:** dois novos endpoints funcionando (`GET /reports/cost-centers` e `GET /dashboard/chart`), com testes verdes.

Tasks:
- [x] 1.1 — Adicionar `costCenterReportQuerySchema` e `chartReportQuerySchema` em `shared/src/schemas/reports.ts`; exportar de `shared/src/index.ts` — done when: `npm run typecheck -w shared` passa sem erros
- [x] 1.2 — Adicionar interfaces `CostCenterDreRow` / `CostCenterReport` e função `byCostCenterReport(db, orgId, month)` em `server/src/services/reports.ts` — done when: tipagem compila e lógica cobre previsto (competenceMonth) + realizado (settledAt) por costCenterId (null → "Sem centro de custo")
- [x] 1.3 — Adicionar interface `ChartMonth` e função `chartReport(db, orgId, months, today?)` em `server/src/services/reports.ts` — done when: retorna array ordenado do mais antigo ao mais recente, cobrindo o boundary de virada de ano
- [x] 1.4 — Escrever `describe("byCostCenterReport", ...)` em `server/test/reports.test.ts` com 2 casos: entry com costCenter + entry sem costCenter — done when: `npm test -w server` passa
- [x] 1.5 — Escrever `describe("chartReport", ...)` com 2 casos: realizado recente + boundary virada de ano — done when: testes passam
- [x] 1.6 — Registrar `GET /reports/cost-centers` em `server/src/routes/reports.ts` — done when: rota responde com `CostCenterReport[]`
- [x] 1.7 — Registrar `GET /dashboard/chart` em `server/src/routes/dashboard.ts` — done when: rota responde com `ChartMonth[]`

Verify: `npm run typecheck && npm test -w server` — tudo verde

---

## Phase 2: Frontend — Aba "Por Obra" na ReportsPage

**Goal:** ReportsPage com duas abas; aba "Por Obra" mostra tabela expansível de centros de custo.

Tasks:
- [x] 2.1 — Adicionar interfaces `CostCenterDreRow` e `CostCenterReport` em `web/src/api/types.ts` — done when: arquivo compila
- [x] 2.2 — Adicionar `useCostCenterReport(month: string)` em `web/src/api/reports.ts` — done when: hook tipado e queryKey correto
- [x] 2.3 — Adicionar estado de aba (`tab: "categoria" | "obra"`) e header com duas abas na `ReportsPage.tsx` — done when: botões de aba renderizam e troca de tab funciona sem quebrar o conteúdo existente
- [x] 2.4 — Envolver conteúdo existente (fluxo mensal + DRE) em `{tab === "categoria" && ...}` — done when: aba "Por Categoria" exibe exatamente o que exibia antes
- [x] 2.5 — Implementar `{tab === "obra" && ...}` com tabela resumo (uma linha por obra) e expansão inline por clique mostrando categorias — done when: tabela mostra todas as obras do mês, linha clicável expande/colapsa categorias, "Sem centro de custo" aparece por último em itálico
- [x] 2.6 — Tratar loading/error/empty na aba "Por Obra" — done when: cada estado exibe mensagem correta

Verify: manual — `npm run dev -w web`, abrir Relatórios → aba "Por Obra" → mês com dados → expandir linha → verificar valores; mês vazio → ver estado vazio

---

## Phase 3: Frontend — Gráfico no Dashboard

**Goal:** DashboardPage com novo card exibindo ComposedChart Recharts (últimos 6 meses realizados).

Tasks:
- [x] 3.1 — Instalar `recharts` em `web/`: `npm install recharts -w web` — done when: package.json web contém recharts
- [x] 3.2 — Adicionar interface `ChartMonth` em `web/src/api/types.ts` — done when: arquivo compila
- [x] 3.3 — Adicionar `useChartReport(months?: number)` em `web/src/api/reports.ts` — done when: hook tipado chamando `GET /dashboard/chart?months=6`
- [x] 3.4 — Criar `web/src/components/CashFlowChart.tsx` com `ResponsiveContainer > ComposedChart`: barras verdes (receitas) e vermelhas (despesas) + linha azul (resultado líquido), eixo X com mês abreviado, tooltip e legenda — done when: componente renderiza sem erro com dados mock tipados
- [x] 3.5 — Adicionar `CashFlowChart` em `DashboardPage.tsx` abaixo dos cards existentes, consumindo `useChartReport()` — done when: Painel exibe novo card com gráfico

Verify: manual — abrir Painel, verificar gráfico com dados dos últimos 6 meses; resize da janela → gráfico se adapta

---

## Phase 4: Frontend — Exportar PDF e Excel

**Goal:** botão "Exportar ▾" com opções PDF/Excel nas duas abas da ReportsPage; download dispara no browser.

Tasks:
- [x] 4.1 — Instalar dependências: `npm install jspdf jspdf-autotable xlsx -w web` — done when: package.json web contém as três libs
- [x] 4.2 — Criar `web/src/lib/export.ts` com 4 funções puras (`exportDrePdf`, `exportDreExcel`, `exportObrasPdf`, `exportObrasExcel`) — done when: arquivo compila sem erros de tipo; cada função aceita os tipos corretos e dispara download com nome de arquivo correto (`dre-YYYY-MM.pdf`, etc.)
- [x] 4.3 — Adicionar botão "Exportar ▾" (dropdown PDF / Excel) no card-header da DRE na aba "Por Categoria" — done when: dropdown aparece, clique em PDF dispara download com tabela DRE; clique em Excel dispara download `.xlsx`
- [x] 4.4 — Adicionar botão "Exportar ▾" no card-header da aba "Por Obra" — done when: exporta resumo + detalhe de cada obra no mês selecionado
- [x] 4.5 — Botão desabilitado enquanto dados estiverem carregando ou em erro — done when: `disabled` no estado correto

Verify: manual — exportar DRE como PDF → verificar conteúdo; exportar obras como Excel → abrir arquivo e conferir dados; testar com mês vazio (nenhuma linha de categoria deve aparecer)

---

## Commit strategy

Cada fase recebe um commit próprio ao ficar verde:
- `feat(server): byCostCenterReport + chartReport services, routes and tests`
- `feat(web): relatorio por obra - aba na ReportsPage`
- `feat(web): grafico de fluxo de caixa no Dashboard (Recharts)`
- `feat(web): exportar DRE e obras em PDF e Excel`

Push para main após os 4 commits → Railway faz deploy automático.
