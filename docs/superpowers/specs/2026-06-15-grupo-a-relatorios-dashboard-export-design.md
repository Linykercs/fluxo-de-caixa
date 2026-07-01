# Spec: Grupo A — Relatório por Obra, Gráfico no Dashboard, Exportar PDF/Excel

## Contexto

Sistema FluxoCaixa em produção (Railway + SQLite). Stack: Fastify + Prisma + React.
Duas organizações ativas: Oficina Criativa e Vértice Construções (construtora com 4 obras cadastradas).

Funcionalidades aprovadas neste grupo:
1. **Relatório por obra** — resumo comparativo de centros de custo + detalhe por categoria ao clicar
2. **Gráfico no Dashboard** — barras entradas/saídas + linha de resultado líquido, últimos 6 meses
3. **Exportar PDF e Excel** — DRE mensal e relatório por obra

---

## 1. Relatório por Obra

### Backend

**Novo serviço** `byCostCenterReport(db, organizationId, month)` em `server/src/services/reports.ts`:

- Para cada centro de custo da organização (não arquivado), calcula:
  - `previstoCents`: soma de `Entry.amountCents` com `competenceMonth = month` e `costCenterId = id`
  - `realizadoCents`: soma de `Settlement.amountCents` com `settledAt` dentro do mês e entry com `costCenterId = id`
  - Breakdown por categoria (receitas e despesas separadas), com previsto e realizado
- Inclui um grupo especial `costCenterId: null, costCenterName: "Sem centro de custo"` para entries sem obra
- Omite grupos sem nenhum movimento no mês (previsto = 0 e realizado = 0)
- Retorna array ordenado por nome do centro de custo (`"Sem centro de custo"` por último)

**Tipo de retorno:**
```ts
interface CostCenterDreRow {
  categoryId: string;
  categoryName: string;
  kind: "EXPENSE" | "INCOME";
  previstoCents: number;
  realizadoCents: number;
}

interface CostCenterReport {
  costCenterId: string | null;
  costCenterName: string;
  totalReceitasPrevistoCents: number;
  totalReceitasRealizadoCents: number;
  totalDespesasPrevistoCents: number;
  totalDespesasRealizadoCents: number;
  resultadoPrevistoCents: number;
  resultadoRealizadoCents: number;
  receitas: CostCenterDreRow[];
  despesas: CostCenterDreRow[];
}
```

**Novo schema** `costCenterReportQuerySchema` em `shared/src/schemas/reports.ts`:
```ts
z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
```

**Nova rota** em `server/src/routes/reports.ts`:
```
GET /reports/cost-centers?month=YYYY-MM
```
Retorna `CostCenterReport[]`. Protegida (requer sessão).

### Frontend

**ReportsPage.tsx** ganha sistema de abas:
- `"Por Categoria"` — conteúdo atual (fluxo mensal + DRE), sem mudança
- `"Por Obra"` — novo conteúdo descrito abaixo

O filtro de mês (navegação ◀ `dreMonth` ▶) é compartilhado entre as duas abas.

**Aba "Por Obra":**
- Tabela resumo: cada linha é uma obra, colunas = Receitas (previsto / realizado), Despesas (previsto / realizado), Resultado (previsto / realizado)
- Linha clicável → expande inline exibindo tabela de detalhes (categorias dentro daquela obra), com mesma estrutura de receitas/despesas
- "Sem centro de custo" aparece como última linha, em itálico
- Estado de carregamento, erro e vazio tratados

**Novo hook** `useCostCenterReport(month: string)` em `web/src/api/reports.ts`.

---

## 2. Gráfico no Dashboard

### Backend

**Novo serviço** `chartReport(db, organizationId, months)` em `server/src/services/reports.ts`:
- Retorna os últimos `months` meses (padrão 6) contados do mês atual
- Para cada mês: `realizadoReceitasCents` e `realizadoDespesasCents` (apenas settlements realizados)
- Resultado líquido `resultadoCents = realizadoReceitasCents - realizadoDespesasCents`
- Usa `settledAt` para determinar o mês da settlement (igual ao `cashFlowReport`)

**Tipo de retorno:**
```ts
interface ChartMonth {
  month: string;           // "YYYY-MM"
  receitasCents: number;
  despesasCents: number;
  resultadoCents: number;
}
```

**Nova rota:**
```
GET /dashboard/chart?months=6
```
Retorna `ChartMonth[]` ordenado do mais antigo ao mais recente.

### Frontend

**Dependência nova:** `recharts` adicionada ao `web/package.json`.

**Novo componente** `web/src/components/CashFlowChart.tsx`:
- `ComposedChart` do Recharts com dados dos últimos 6 meses
- `Bar` verde: `receitasCents` (entradas realizadas)
- `Bar` vermelha: `despesasCents` (saídas realizadas)
- `Line` azul: `resultadoCents` (resultado líquido do mês)
- Eixo X: mês abreviado ("Jan", "Fev"...)
- Eixo Y: valores em R$ (formatBRLNumber)
- `ResponsiveContainer` para adaptar ao tamanho da tela
- Tooltip com valores formatados em BRL
- Legenda

**DashboardPage.tsx**: novo card abaixo dos cards atuais com o `CashFlowChart`.

**Novo hook** `useChartReport()` em `web/src/api/reports.ts`.

---

## 3. Exportar PDF e Excel

### Dependências novas em `web/package.json`

```
jspdf            — geração de PDF
jspdf-autotable  — plugin de tabelas para jspdf
xlsx             — SheetJS para geração de .xlsx
```

### Onde aparece

Botão **"Exportar ▾"** dropdown com duas opções (PDF / Excel):
- Na aba "Por Categoria" da ReportsPage (exporta a DRE do mês selecionado)
- Na aba "Por Obra" da ReportsPage (exporta o relatório por obra do mês selecionado)

O botão fica no `card-header` ao lado da navegação de mês, habilitado apenas quando os dados estiverem carregados.

### Conteúdo dos arquivos

**DRE mensal (`dre-YYYY-MM.pdf` / `.xlsx`):**
- Cabeçalho: "DRE — [mês por extenso]"
- Tabela Receitas: Categoria | Previsto | Realizado
- Tabela Despesas: Categoria | Previsto | Realizado
- Linha de total: Resultado do mês (previsto e realizado)

**Por obra (`obras-YYYY-MM.pdf` / `.xlsx`):**
- Cabeçalho: "Relatório por Obra — [mês por extenso]"
- Tabela resumo: Obra | Receitas | Despesas | Resultado (colunas previsto e realizado)
- Para cada obra com detalhe: seção "Obra X" com tabela de categorias

**Formatação:**
- Valores monetários: `formatBRL()` (ex: R$ 11.500,00)
- PDF: fonte padrão jsPDF, tabelas com `jspdf-autotable`
- Excel: uma sheet por relatório, cabeçalhos em negrito

### Implementação

**`web/src/lib/export.ts`** — funções puras:
- `exportDrePdf(dre: DreReport, month: string): void`
- `exportDreExcel(dre: DreReport, month: string): void`
- `exportObrasPdf(obras: CostCenterReport[], month: string): void`
- `exportObrasExcel(obras: CostCenterReport[], month: string): void`

Cada função gera o arquivo e dispara o download diretamente no browser (`saveAs` / `blob URL`). Sem chamada ao servidor.

---

## Fases de implementação

1. **Backend** — `byCostCenterReport` + `chartReport` + rotas + schemas (typecheck + testes)
2. **Frontend — Relatório por obra** — tabs na ReportsPage + hook + tabela expansível
3. **Frontend — Gráfico** — dependência Recharts + `CashFlowChart` + hook + integração no Dashboard
4. **Frontend — Exportar** — dependências PDF/Excel + `lib/export.ts` + botões nas duas abas

Cada fase entrega verde (typecheck + testes passando) antes de iniciar a próxima.
