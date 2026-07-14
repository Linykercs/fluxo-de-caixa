import type { jsPDF } from "jspdf";
import type { CostCenterReport, DreReport } from "../api/types";
import { formatMonthLong } from "./dates";
import { formatBRL } from "./money";

// jspdf/jspdf-autotable e xlsx são pesados (centenas de KB) e só são necessários
// quando o usuário exporta; import() dinâmico os mantém fora do chunk inicial.
async function loadPdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
}

async function loadXlsx() {
  return import("xlsx");
}

// ─── PDF helpers ────────────────────────────────────────────────────────────

function makePdf(JsPdf: typeof jsPDF, title: string, orientation: "p" | "l" = "p"): jsPDF {
  const doc = new JsPdf({ orientation, unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return doc;
}

function downloadPdf(doc: jsPDF, filename: string): void {
  doc.save(filename);
}

// ─── Excel helpers ──────────────────────────────────────────────────────────

async function downloadXlsx(rows: (string | number)[][], filename: string, sheetName = "Dados"): Promise<void> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ─── Tabela genérica (lançamentos, extrato) ────────────────────────────────

export interface TableExport {
  title: string;
  /** Nome do arquivo sem extensão. */
  filename: string;
  head: string[];
  rows: (string | number)[][];
  /** Linhas de rodapé (ex.: total). */
  foot?: (string | number)[][];
  orientation?: "p" | "l";
  /** Índices de colunas alinhadas à direita (valores). */
  rightAlign?: number[];
}

export async function exportTablePdf(table: TableExport): Promise<void> {
  const { jsPDF: JsPdf, autoTable } = await loadPdf();
  const doc = makePdf(JsPdf, table.title, table.orientation ?? "p");

  const columnStyles: Record<number, { halign: "right" }> = {};
  for (const index of table.rightAlign ?? []) {
    columnStyles[index] = { halign: "right" };
  }

  autoTable(doc, {
    startY: 26,
    head: [table.head],
    body: table.rows,
    foot: table.foot,
    theme: "striped",
    headStyles: { fillColor: [26, 95, 180] },
    footStyles: { fontStyle: "bold" },
    columnStyles,
  });

  downloadPdf(doc, `${table.filename}.pdf`);
}

export async function exportTableExcel(table: TableExport, sheetName = "Dados"): Promise<void> {
  const rows: (string | number)[][] = [
    [table.title],
    [],
    table.head,
    ...table.rows,
    ...(table.foot ?? []),
  ];
  await downloadXlsx(rows, `${table.filename}.xlsx`, sheetName);
}

// ─── DRE ────────────────────────────────────────────────────────────────────

export async function exportDrePdf(dre: DreReport, month: string): Promise<void> {
  const { jsPDF: JsPdf, autoTable } = await loadPdf();
  const title = `DRE — ${formatMonthLong(month)}`;
  const doc = makePdf(JsPdf, title);
  let y = 26;

  autoTable(doc, {
    startY: y,
    head: [["Receitas", "Previsto"]],
    body: dre.receitas.map((r) => [r.categoryName, formatBRL(r.amountCents)]),
    foot: [[`Total receitas`, formatBRL(dre.totalReceitasCents)]],
    theme: "striped",
    headStyles: { fillColor: [22, 101, 52] },
    footStyles: { fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: y,
    head: [["Despesas", "Previsto"]],
    body: dre.despesas.map((r) => [r.categoryName, formatBRL(r.amountCents)]),
    foot: [[`Total despesas`, formatBRL(dre.totalDespesasCents)]],
    theme: "striped",
    headStyles: { fillColor: [233, 69, 96] },
    footStyles: { fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: y,
    body: [["Resultado do mês", formatBRL(dre.resultadoCents)]],
    theme: "plain",
    bodyStyles: { fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });

  downloadPdf(doc, `dre-${month}.pdf`);
}

export async function exportDreExcel(dre: DreReport, month: string): Promise<void> {
  const rows: (string | number)[][] = [
    [`DRE — ${formatMonthLong(month)}`],
    [],
    ["Receitas", "Previsto (R$)"],
    ...dre.receitas.map((r) => [r.categoryName, r.amountCents / 100]),
    ["Total receitas", dre.totalReceitasCents / 100],
    [],
    ["Despesas", "Previsto (R$)"],
    ...dre.despesas.map((r) => [r.categoryName, r.amountCents / 100]),
    ["Total despesas", dre.totalDespesasCents / 100],
    [],
    ["Resultado do mês", dre.resultadoCents / 100],
  ];
  await downloadXlsx(rows, `dre-${month}.xlsx`, "DRE");
}

// ─── Obras ──────────────────────────────────────────────────────────────────

export async function exportObrasPdf(obras: CostCenterReport[], month: string): Promise<void> {
  const { jsPDF: JsPdf, autoTable } = await loadPdf();
  const title = `Relatório por Obra — ${formatMonthLong(month)}`;
  const doc = makePdf(JsPdf, title, "l");

  const summaryBody = obras.map((cc) => [
    cc.costCenterName,
    formatBRL(cc.totalReceitasRealizadoCents),
    formatBRL(cc.totalDespesasRealizadoCents),
    formatBRL(cc.resultadoRealizadoCents),
    formatBRL(cc.totalReceitasPrevistoCents),
    formatBRL(cc.totalDespesasPrevistoCents),
    formatBRL(cc.resultadoPrevistoCents),
  ]);

  autoTable(doc, {
    startY: 26,
    head: [["Obra", "Real.Receitas", "Real.Despesas", "Real.Resultado", "Prev.Receitas", "Prev.Despesas", "Prev.Resultado"]],
    body: summaryBody,
    theme: "striped",
    headStyles: { fillColor: [30, 58, 138] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  downloadPdf(doc, `obras-${month}.pdf`);
}

export async function exportObrasExcel(obras: CostCenterReport[], month: string): Promise<void> {
  const header = [
    `Relatório por Obra — ${formatMonthLong(month)}`,
  ];
  const colHeaders = [
    "Obra",
    "Real. Receitas",
    "Real. Despesas",
    "Real. Resultado",
    "Prev. Receitas",
    "Prev. Despesas",
    "Prev. Resultado",
  ];
  const summaryRows = obras.map((cc) => [
    cc.costCenterName,
    cc.totalReceitasRealizadoCents / 100,
    cc.totalDespesasRealizadoCents / 100,
    cc.resultadoRealizadoCents / 100,
    cc.totalReceitasPrevistoCents / 100,
    cc.totalDespesasPrevistoCents / 100,
    cc.resultadoPrevistoCents / 100,
  ]);

  const rows: (string | number)[][] = [header, [], colHeaders, ...summaryRows];

  for (const cc of obras) {
    rows.push([], [`Detalhe: ${cc.costCenterName}`]);
    if (cc.receitas.length > 0) {
      rows.push(["  Receitas", "", "Realizado (R$)", "", "Previsto (R$)"]);
      for (const r of cc.receitas) {
        rows.push(["  " + r.categoryName, "", r.realizadoCents / 100, "", r.previstoCents / 100]);
      }
    }
    if (cc.despesas.length > 0) {
      rows.push(["  Despesas", "", "Realizado (R$)", "", "Previsto (R$)"]);
      for (const r of cc.despesas) {
        rows.push(["  " + r.categoryName, "", r.realizadoCents / 100, "", r.previstoCents / 100]);
      }
    }
  }

  await downloadXlsx(rows, `obras-${month}.xlsx`, "Por Obra");
}
