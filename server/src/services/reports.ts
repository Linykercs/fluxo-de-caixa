// Relatórios e painel (spec §5):
// - Previsto = Σ Entry.amountCents (não deletadas) por competenceMonth, por direção.
// - Realizado = Σ Settlement.amountCents (já líquido: estornos somam negativo
//   na própria data) por settledAt, por direção.
// - Projeção = saldo atual acumulando remainingCents das entries em aberto por
//   dueDate; vencidas e não pagas entram no primeiro mês (o de "hoje").
import {
  addDays,
  addMonths,
  calendarDate,
  isValidCompetenceMonth,
  todaySP,
  toDate,
} from "../lib/dates";
import { BusinessError } from "../lib/errors";
import type { Db } from "../lib/prisma";
import { deriveEntry } from "./entries";
import { getTotalBalanceCents, listAccountsWithBalances } from "./bank-accounts";
import { getClosedThroughMonth } from "./organizations";

export const PROJECTION_MONTHS = 6;
const DUE_SOON_DAYS = 7;

function assertMonth(value: string): void {
  if (!isValidCompetenceMonth(value)) {
    throw new BusinessError("INVALID_MONTH", `month inválido: "${value}" (esperado "YYYY-MM")`);
  }
}

export interface DirectionTotals {
  payableCents: number;
  receivableCents: number;
}

export interface MonthFlow {
  month: string;
  previsto: DirectionTotals;
  realizado: DirectionTotals;
}

/** Fluxo mensal previsto x realizado, `${year}-01` a `${year}-12` (spec §5). */
export async function cashFlowReport(
  db: Db,
  organizationId: string,
  year: number,
): Promise<MonthFlow[]> {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const byMonth = new Map<string, MonthFlow>(
    months.map((month) => [
      month,
      {
        month,
        previsto: { payableCents: 0, receivableCents: 0 },
        realizado: { payableCents: 0, receivableCents: 0 },
      },
    ]),
  );

  const entries = await db.entry.findMany({
    where: {
      organizationId,
      deletedAt: null,
      competenceMonth: { gte: `${year}-01`, lte: `${year}-12` },
    },
    select: { competenceMonth: true, direction: true, amountCents: true },
  });
  for (const entry of entries) {
    const bucket = byMonth.get(entry.competenceMonth)!;
    if (entry.direction === "PAYABLE") bucket.previsto.payableCents += entry.amountCents;
    else bucket.previsto.receivableCents += entry.amountCents;
  }

  const settlements = await db.settlement.findMany({
    where: {
      organizationId,
      settledAt: { gte: toDate(`${year}-01-01`), lt: toDate(`${year + 1}-01-01`) },
    },
    select: { amountCents: true, settledAt: true, entry: { select: { direction: true } } },
  });
  for (const settlement of settlements) {
    const bucket = byMonth.get(calendarDate(settlement.settledAt).slice(0, 7))!;
    if (settlement.entry.direction === "PAYABLE") bucket.realizado.payableCents += settlement.amountCents;
    else bucket.realizado.receivableCents += settlement.amountCents;
  }

  return months.map((month) => byMonth.get(month)!);
}

export interface CategorySummaryRow {
  categoryId: string;
  categoryName: string;
  kind: "EXPENSE" | "INCOME";
  previstoCents: number;
  realizadoCents: number;
}

/** Resumo por categoria do mês: previsto (competência) x realizado (caixa), lado a lado (spec §5). */
export async function byCategoryReport(
  db: Db,
  organizationId: string,
  month: string,
): Promise<CategorySummaryRow[]> {
  assertMonth(month);

  const categories = await db.category.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const rows = new Map<string, CategorySummaryRow>(
    categories.map((category) => [
      category.id,
      {
        categoryId: category.id,
        categoryName: category.name,
        kind: category.kind as "EXPENSE" | "INCOME",
        previstoCents: 0,
        realizadoCents: 0,
      },
    ]),
  );

  const entries = await db.entry.findMany({
    where: { organizationId, deletedAt: null, competenceMonth: month },
    select: { categoryId: true, amountCents: true },
  });
  for (const entry of entries) {
    const row = rows.get(entry.categoryId);
    if (row) row.previstoCents += entry.amountCents;
  }

  const settlements = await db.settlement.findMany({
    where: {
      organizationId,
      settledAt: { gte: toDate(`${month}-01`), lt: toDate(`${addMonths(month, 1)}-01`) },
    },
    select: { amountCents: true, entry: { select: { categoryId: true } } },
  });
  for (const settlement of settlements) {
    const row = rows.get(settlement.entry.categoryId);
    if (row) row.realizadoCents += settlement.amountCents;
  }

  return [...rows.values()];
}

export interface CounterpartySummaryRow {
  counterparty: string;
  direction: "PAYABLE" | "RECEIVABLE";
  previstoCents: number;
  realizadoCents: number;
}

/** Resumo por fornecedor/cliente do mês: previsto (competência) x realizado (caixa), agrupado por (counterparty, direction). Só aparecem combinações com algum valor no mês (spec §5/F5). */
export async function byCounterpartyReport(
  db: Db,
  organizationId: string,
  month: string,
): Promise<CounterpartySummaryRow[]> {
  assertMonth(month);

  const rows = new Map<string, CounterpartySummaryRow>();
  function getRow(counterparty: string, direction: "PAYABLE" | "RECEIVABLE"): CounterpartySummaryRow {
    const key = `${direction}:${counterparty}`;
    let row = rows.get(key);
    if (!row) {
      row = { counterparty, direction, previstoCents: 0, realizadoCents: 0 };
      rows.set(key, row);
    }
    return row;
  }

  const entries = await db.entry.findMany({
    where: { organizationId, deletedAt: null, competenceMonth: month },
    select: { counterparty: true, direction: true, amountCents: true },
  });
  for (const entry of entries) {
    getRow(entry.counterparty, entry.direction as "PAYABLE" | "RECEIVABLE").previstoCents += entry.amountCents;
  }

  const settlements = await db.settlement.findMany({
    where: {
      organizationId,
      settledAt: { gte: toDate(`${month}-01`), lt: toDate(`${addMonths(month, 1)}-01`) },
    },
    select: { amountCents: true, entry: { select: { counterparty: true, direction: true } } },
  });
  for (const settlement of settlements) {
    getRow(settlement.entry.counterparty, settlement.entry.direction as "PAYABLE" | "RECEIVABLE").realizadoCents +=
      settlement.amountCents;
  }

  return [...rows.values()].sort((a, b) => a.counterparty.localeCompare(b.counterparty));
}

export interface DreRow {
  categoryId: string;
  categoryName: string;
  amountCents: number;
}

export interface DreReport {
  month: string;
  receitas: DreRow[];
  despesas: DreRow[];
  totalReceitasCents: number;
  totalDespesasCents: number;
  resultadoCents: number;
  closedThroughMonth: string | null;
  isClosed: boolean;
}

/** DRE do mês (receitas - despesas), a partir do previsto por categoria de byCategoryReport (spec §8/F6). */
export async function dreReport(db: Db, organizationId: string, month: string): Promise<DreReport> {
  const categories = await byCategoryReport(db, organizationId, month);

  const receitas: DreRow[] = [];
  const despesas: DreRow[] = [];
  for (const category of categories) {
    const row: DreRow = {
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      amountCents: category.previstoCents,
    };
    if (category.kind === "INCOME") receitas.push(row);
    else despesas.push(row);
  }
  const totalReceitasCents = receitas.reduce((sum, r) => sum + r.amountCents, 0);
  const totalDespesasCents = despesas.reduce((sum, r) => sum + r.amountCents, 0);
  const closedThroughMonth = await getClosedThroughMonth(db, organizationId);

  return {
    month,
    receitas,
    despesas,
    totalReceitasCents,
    totalDespesasCents,
    resultadoCents: totalReceitasCents - totalDespesasCents,
    closedThroughMonth,
    isClosed: closedThroughMonth !== null && month <= closedThroughMonth,
  };
}

export interface ProjectionMonth {
  month: string;
  payableCents: number;
  receivableCents: number;
  balanceCents: number;
}

/**
 * Projeção de saldo (spec §5): saldo atual acumulando `remainingCents` das
 * entries em aberto por `dueDate` (recebíveis somam, pagáveis subtraem).
 * Vencidas e não pagas entram no primeiro mês (o de `today`).
 * `payableCents`/`receivableCents` (sempre >= 0) são os totais em aberto de
 * cada direção naquele mês; `balanceCents` acumula `receivableCents -
 * payableCents` a partir do saldo atual.
 */
export async function projectionReport(
  db: Db,
  organizationId: string,
  months: number,
  today: string = todaySP(),
): Promise<ProjectionMonth[]> {
  if (!Number.isInteger(months) || months < 1) {
    throw new BusinessError("INVALID_MONTHS", "months deve ser um inteiro >= 1");
  }

  const startMonth = today.slice(0, 7);
  const monthList = Array.from({ length: months }, (_, i) => addMonths(startMonth, i));
  const lastMonth = monthList[months - 1]!;
  const horizonEnd = toDate(`${addMonths(lastMonth, 1)}-01`);

  const entries = await db.entry.findMany({
    where: { organizationId, deletedAt: null, dueDate: { lt: horizonEnd } },
    include: { settlements: true },
  });

  const payableDeltas = new Map(monthList.map((month) => [month, 0]));
  const receivableDeltas = new Map(monthList.map((month) => [month, 0]));
  for (const entry of entries) {
    const { remainingCents } = deriveEntry(entry, today);
    if (remainingCents === 0) continue;
    const dueMonth = calendarDate(entry.dueDate).slice(0, 7);
    const bucket = dueMonth < startMonth ? startMonth : dueMonth;
    const deltas = entry.direction === "RECEIVABLE" ? receivableDeltas : payableDeltas;
    deltas.set(bucket, deltas.get(bucket)! + remainingCents);
  }

  let balanceCents = await getTotalBalanceCents(db, organizationId);
  return monthList.map((month) => {
    const payableCents = payableDeltas.get(month)!;
    const receivableCents = receivableDeltas.get(month)!;
    balanceCents += receivableCents - payableCents;
    return { month, payableCents, receivableCents, balanceCents };
  });
}

export interface CostCenterDreRow {
  categoryId: string;
  categoryName: string;
  kind: "EXPENSE" | "INCOME";
  previstoCents: number;
  realizadoCents: number;
}

export interface CostCenterReport {
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

type CategoryData = {
  categoryName: string;
  kind: "EXPENSE" | "INCOME";
  previstoCents: number;
  realizadoCents: number;
};

function buildCcResult(
  costCenterId: string | null,
  costCenterName: string,
  group: Map<string, CategoryData>,
): CostCenterReport | null {
  const receitas: CostCenterDreRow[] = [];
  const despesas: CostCenterDreRow[] = [];
  for (const [categoryId, row] of group) {
    const item: CostCenterDreRow = {
      categoryId,
      categoryName: row.categoryName,
      kind: row.kind,
      previstoCents: row.previstoCents,
      realizadoCents: row.realizadoCents,
    };
    if (row.kind === "INCOME") receitas.push(item);
    else despesas.push(item);
  }
  const totalReceitasPrevistoCents = receitas.reduce((s, r) => s + r.previstoCents, 0);
  const totalReceitasRealizadoCents = receitas.reduce((s, r) => s + r.realizadoCents, 0);
  const totalDespesasPrevistoCents = despesas.reduce((s, r) => s + r.previstoCents, 0);
  const totalDespesasRealizadoCents = despesas.reduce((s, r) => s + r.realizadoCents, 0);
  if (!totalReceitasPrevistoCents && !totalReceitasRealizadoCents && !totalDespesasPrevistoCents && !totalDespesasRealizadoCents) return null;
  return {
    costCenterId,
    costCenterName,
    totalReceitasPrevistoCents,
    totalReceitasRealizadoCents,
    totalDespesasPrevistoCents,
    totalDespesasRealizadoCents,
    resultadoPrevistoCents: totalReceitasPrevistoCents - totalDespesasPrevistoCents,
    resultadoRealizadoCents: totalReceitasRealizadoCents - totalDespesasRealizadoCents,
    receitas,
    despesas,
  };
}

/** Relatório por centro de custo: previsto (competência) x realizado (caixa), agrupado por obra (spec Grupo A). */
export async function byCostCenterReport(
  db: Db,
  organizationId: string,
  month: string,
): Promise<CostCenterReport[]> {
  assertMonth(month);

  const categories = await db.category.findMany({
    where: { organizationId, archivedAt: null },
  });
  const categoryMap = new Map(
    categories.map((c) => [c.id, { name: c.name, kind: c.kind as "EXPENSE" | "INCOME" }]),
  );

  const costCenters = await db.costCenter.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
  });

  const NULL_KEY = "__null__";
  const groups = new Map<string, Map<string, CategoryData>>();

  function ensureRow(ccKey: string, categoryId: string): CategoryData | null {
    let group = groups.get(ccKey);
    if (!group) { group = new Map(); groups.set(ccKey, group); }
    let row = group.get(categoryId);
    if (!row) {
      const cat = categoryMap.get(categoryId);
      if (!cat) return null;
      row = { categoryName: cat.name, kind: cat.kind, previstoCents: 0, realizadoCents: 0 };
      group.set(categoryId, row);
    }
    return row;
  }

  const entries = await db.entry.findMany({
    where: { organizationId, deletedAt: null, competenceMonth: month },
    select: { categoryId: true, costCenterId: true, amountCents: true },
  });
  for (const entry of entries) {
    const row = ensureRow(entry.costCenterId ?? NULL_KEY, entry.categoryId);
    if (row) row.previstoCents += entry.amountCents;
  }

  const settlements = await db.settlement.findMany({
    where: {
      organizationId,
      settledAt: { gte: toDate(`${month}-01`), lt: toDate(`${addMonths(month, 1)}-01`) },
    },
    select: { amountCents: true, entry: { select: { categoryId: true, costCenterId: true } } },
  });
  for (const s of settlements) {
    const row = ensureRow(s.entry.costCenterId ?? NULL_KEY, s.entry.categoryId);
    if (row) row.realizadoCents += s.amountCents;
  }

  const result: CostCenterReport[] = [];
  for (const cc of costCenters) {
    const r = buildCcResult(cc.id, cc.name, groups.get(cc.id) ?? new Map());
    if (r) result.push(r);
  }
  const nullResult = buildCcResult(null, "Sem centro de custo", groups.get(NULL_KEY) ?? new Map());
  if (nullResult) result.push(nullResult);

  return result;
}

export interface ChartMonth {
  month: string;
  receitasCents: number;
  despesasCents: number;
  resultadoCents: number;
}

/** Últimos N meses de realizado (caixa): entradas, saídas e resultado líquido (spec Grupo A). */
export async function chartReport(
  db: Db,
  organizationId: string,
  months: number,
  today: string = todaySP(),
): Promise<ChartMonth[]> {
  if (!Number.isInteger(months) || months < 1) {
    throw new BusinessError("INVALID_MONTHS", "months deve ser um inteiro >= 1");
  }

  const startMonth = addMonths(today.slice(0, 7), -(months - 1));
  const monthList = Array.from({ length: months }, (_, i) => addMonths(startMonth, i));
  const startDate = toDate(`${startMonth}-01`);
  const endDate = toDate(`${addMonths(monthList[months - 1]!, 1)}-01`);

  const byMonth = new Map<string, ChartMonth>(
    monthList.map((m) => [m, { month: m, receitasCents: 0, despesasCents: 0, resultadoCents: 0 }]),
  );

  const settlements = await db.settlement.findMany({
    where: { organizationId, settledAt: { gte: startDate, lt: endDate } },
    select: { amountCents: true, settledAt: true, entry: { select: { direction: true } } },
  });
  for (const s of settlements) {
    const bucket = byMonth.get(calendarDate(s.settledAt).slice(0, 7));
    if (!bucket) continue;
    if (s.entry.direction === "RECEIVABLE") bucket.receitasCents += s.amountCents;
    else bucket.despesasCents += s.amountCents;
  }

  for (const bucket of byMonth.values()) {
    bucket.resultadoCents = bucket.receitasCents - bucket.despesasCents;
  }

  return monthList.map((m) => byMonth.get(m)!);
}

export interface AlertEntry {
  id: string;
  direction: "PAYABLE" | "RECEIVABLE";
  description: string;
  counterparty: string;
  categoryId: string;
  dueDate: string;
  remainingCents: number;
}

export interface Dashboard {
  month: string;
  accounts: { id: string; name: string; balanceCents: number }[];
  totalBalanceCents: number;
  totals: {
    payable: { previstoCents: number; realizadoCents: number };
    receivable: { previstoCents: number; realizadoCents: number };
  };
  alerts: {
    overdue: AlertEntry[];
    dueToday: AlertEntry[];
    dueSoon: AlertEntry[];
  };
  projection: ProjectionMonth[];
}

/**
 * Painel (spec §5/§7). `month` (navegação ◀▶) só afeta `totals`
 * (previsto x realizado daquele mês); saldos, alertas e projeção são sempre
 * relativos a `today` — "saldo atual" e "vencendo hoje" só fazem sentido no
 * presente. `projection[0]` é o saldo previsto para o fim do mês corrente.
 */
export async function dashboard(
  db: Db,
  organizationId: string,
  month: string,
  today: string = todaySP(),
): Promise<Dashboard> {
  assertMonth(month);

  const accounts = await listAccountsWithBalances(db, organizationId);
  const totalBalanceCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

  const totals: Dashboard["totals"] = {
    payable: { previstoCents: 0, realizadoCents: 0 },
    receivable: { previstoCents: 0, realizadoCents: 0 },
  };
  const monthEntries = await db.entry.findMany({
    where: { organizationId, deletedAt: null, competenceMonth: month },
    select: { direction: true, amountCents: true },
  });
  for (const entry of monthEntries) {
    const totalsKey = entry.direction === "PAYABLE" ? "payable" : "receivable";
    totals[totalsKey].previstoCents += entry.amountCents;
  }
  const monthSettlements = await db.settlement.findMany({
    where: {
      organizationId,
      settledAt: { gte: toDate(`${month}-01`), lt: toDate(`${addMonths(month, 1)}-01`) },
    },
    select: { amountCents: true, entry: { select: { direction: true } } },
  });
  for (const settlement of monthSettlements) {
    const totalsKey = settlement.entry.direction === "PAYABLE" ? "payable" : "receivable";
    totals[totalsKey].realizadoCents += settlement.amountCents;
  }

  // Alertas: qualquer entry em aberto com vencimento até "hoje + 7 dias"
  // cobre vencidas (qualquer competência passada), hoje e próximos dias.
  const soonLimit = addDays(today, DUE_SOON_DAYS);
  const candidates = await db.entry.findMany({
    where: { organizationId, deletedAt: null, dueDate: { lte: toDate(soonLimit) } },
    include: { settlements: true },
  });
  const alerts: Dashboard["alerts"] = { overdue: [], dueToday: [], dueSoon: [] };
  for (const entry of candidates) {
    const { remainingCents } = deriveEntry(entry, today);
    if (remainingCents === 0) continue;
    const dueDate = calendarDate(entry.dueDate);
    const alertEntry: AlertEntry = {
      id: entry.id,
      direction: entry.direction as "PAYABLE" | "RECEIVABLE",
      description: entry.description,
      counterparty: entry.counterparty,
      categoryId: entry.categoryId,
      dueDate,
      remainingCents,
    };
    if (dueDate < today) alerts.overdue.push(alertEntry);
    else if (dueDate === today) alerts.dueToday.push(alertEntry);
    else alerts.dueSoon.push(alertEntry);
  }
  for (const bucket of Object.values(alerts)) {
    bucket.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  const projection = await projectionReport(db, organizationId, PROJECTION_MONTHS, today);

  return {
    month,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balanceCents: a.balanceCents })),
    totalBalanceCents,
    totals,
    alerts,
    projection,
  };
}
