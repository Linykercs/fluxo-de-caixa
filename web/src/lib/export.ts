import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { CostCenterReport, DreReport } from "../api/types";
import { formatMonthLong } from "./dates";
import { formatBRL } from "./money";

// ─── PDF helpers ────────────────────────────────────────────────────────────

function makePdf(title: string, orientation: "p" | "l" = "p"): jsPDF {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
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

function downloadXlsx(rows: (string | number)[][], filename: string, sheetName = "Dados"): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ─── DRE ────────────────────────────────────────────────────────────────────

export function exportDrePdf(dre: DreReport, month: string): void {
  const title = `DRE — ${formatMonthLong(month)}`;
  const doc = makePdf(title);
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

export function exportDreExcel(dre: DreReport, month: string): void {
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
  downloadXlsx(rows, `dre-${month}.xlsx`, "DRE");
}

// ─── Obras ──────────────────────────────────────────────────────────────────

export function exportObrasPdf(obras: CostCenterReport[], month: string): void {
  const title = `Relatório por Obra — ${formatMonthLong(month)}`;
  const doc = makePdf(title, "l");

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

export function exportObrasExcel(obras: CostCenterReport[], month: string): void {
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

  downloadXlsx(rows, `obras-${month}.xlsx`, "Por Obra");
}
