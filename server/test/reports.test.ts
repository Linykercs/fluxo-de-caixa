// Relatórios e painel (spec §5): previsto x realizado, projeção e alertas.
// Cada describe usa uma organização própria (makeFixture isolado) para que
// os números esperados não dependam de lançamentos de outros testes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { createSingleEntry } from "../src/services/entries";
import { setClosedThroughMonth } from "../src/services/organizations";
import {
  byCategoryReport,
  byCostCenterReport,
  byCounterpartyReport,
  cashFlowReport,
  chartReport,
  dashboard,
  dreReport,
  projectionReport,
} from "../src/services/reports";
import { reverseSettlement, settleEntry } from "../src/services/settlements";
import { createTestDb, makeFixture } from "./helpers/db";

type Fixture = Awaited<ReturnType<typeof makeFixture>>;

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.cleanup());

function newEntry(
  fx: Fixture,
  direction: "PAYABLE" | "RECEIVABLE",
  amountCents: number,
  competenceMonth: string,
  dueDate: string,
) {
  return createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction,
    description: direction === "PAYABLE" ? "Despesa" : "Receita",
    counterparty: direction === "PAYABLE" ? "Fornecedor" : "Cliente",
    categoryId: direction === "PAYABLE" ? fx.expenseCat.id : fx.incomeCat.id,
    amountCents,
    competenceMonth,
    dueDate: toDate(dueDate),
  });
}

describe("cashFlowReport", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("12 meses; competência de junho paga em julho cai no previsto/jun e realizado/jul", async () => {
    const expense = await newEntry(fx, "PAYABLE", 10_000, "2026-06", "2026-06-30");
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: expense.id,
      amountCents: 10_000,
      settledAt: toDate("2026-07-05"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });
    const income = await newEntry(fx, "RECEIVABLE", 20_000, "2026-06", "2026-06-15");
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: income.id,
      amountCents: 20_000,
      settledAt: toDate("2026-06-20"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const report = await cashFlowReport(db.prisma, fx.org.id, 2026);
    expect(report.map((m) => m.month)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);

    const june = report.find((m) => m.month === "2026-06")!;
    const july = report.find((m) => m.month === "2026-07")!;
    expect(june.previsto).toEqual({ payableCents: 10_000, receivableCents: 20_000 });
    expect(june.realizado).toEqual({ payableCents: 0, receivableCents: 20_000 });
    expect(july.previsto).toEqual({ payableCents: 0, receivableCents: 0 });
    expect(july.realizado).toEqual({ payableCents: 10_000, receivableCents: 0 });
  });

  it("estorno no mesmo mês zera o realizado líquido (descontando estornos)", async () => {
    const expense = await newEntry(fx, "PAYABLE", 7_000, "2026-03", "2026-03-10");
    const settlement = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: expense.id,
      amountCents: 7_000,
      settledAt: toDate("2026-03-12"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });
    await reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: settlement.id, userId: fx.user.id });

    const report = await cashFlowReport(db.prisma, fx.org.id, 2026);
    const march = report.find((m) => m.month === "2026-03")!;
    expect(march.previsto.payableCents).toBe(7_000);
    expect(march.realizado.payableCents).toBe(0);
  });

  it("ignora lançamentos com deletedAt", async () => {
    const deleted = await newEntry(fx, "PAYABLE", 1_000, "2026-04", "2026-04-10");
    await db.prisma.entry.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const report = await cashFlowReport(db.prisma, fx.org.id, 2026);
    const april = report.find((m) => m.month === "2026-04")!;
    expect(april.previsto.payableCents).toBe(0);
  });
});

describe("byCategoryReport", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("previsto (competência) x realizado (caixa) por categoria, lado a lado", async () => {
    const rentCat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Aluguel", kind: "EXPENSE" },
    });

    // Despesas gerais: paga no mesmo mês.
    const settled = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de luz",
      counterparty: "Energia Ltda",
      categoryId: fx.expenseCat.id,
      amountCents: 5_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-05"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: settled.id,
      amountCents: 5_000,
      settledAt: toDate("2026-08-05"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // Aluguel: ainda em aberto (só previsto).
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Aluguel agosto",
      counterparty: "Imobiliária",
      categoryId: rentCat.id,
      amountCents: 3_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-10"),
    });

    // Receitas gerais: recebida no mesmo mês.
    const income = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Venda",
      counterparty: "Cliente X",
      categoryId: fx.incomeCat.id,
      amountCents: 8_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-15"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: income.id,
      amountCents: 8_000,
      settledAt: toDate("2026-08-20"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // Mês diferente: não deve contar em agosto.
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de luz",
      counterparty: "Energia Ltda",
      categoryId: fx.expenseCat.id,
      amountCents: 999,
      competenceMonth: "2026-09",
      dueDate: toDate("2026-09-05"),
    });

    const report = await byCategoryReport(db.prisma, fx.org.id, "2026-08");

    // ordenado por kind asc, depois nome asc: Aluguel, Despesas gerais, Receitas gerais
    expect(report.map((r) => r.categoryId)).toEqual([rentCat.id, fx.expenseCat.id, fx.incomeCat.id]);

    expect(report.find((r) => r.categoryId === rentCat.id)).toMatchObject({
      kind: "EXPENSE",
      previstoCents: 3_000,
      realizadoCents: 0,
    });
    expect(report.find((r) => r.categoryId === fx.expenseCat.id)).toMatchObject({
      kind: "EXPENSE",
      previstoCents: 5_000,
      realizadoCents: 5_000,
    });
    expect(report.find((r) => r.categoryId === fx.incomeCat.id)).toMatchObject({
      kind: "INCOME",
      previstoCents: 8_000,
      realizadoCents: 8_000,
    });
  });

  it("categoria arquivada não aparece no resumo", async () => {
    const tempCat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Temporária", kind: "EXPENSE" },
    });
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Despesa avulsa",
      counterparty: "X",
      categoryId: tempCat.id,
      amountCents: 100,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-01"),
    });
    await db.prisma.category.update({ where: { id: tempCat.id }, data: { archivedAt: new Date() } });

    const report = await byCategoryReport(db.prisma, fx.org.id, "2026-08");
    expect(report.find((r) => r.categoryId === tempCat.id)).toBeUndefined();
  });

  it("month inválido → INVALID_MONTH", async () => {
    await expect(byCategoryReport(db.prisma, fx.org.id, "2026-13")).rejects.toMatchObject({
      code: "INVALID_MONTH",
    });
  });
});

describe("byCounterpartyReport", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("previsto (competência) x realizado (caixa) por fornecedor/cliente, agrupado por direção", async () => {
    // Fornecedor: uma despesa paga no mesmo mês, outra ainda em aberto.
    const settled = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de luz",
      counterparty: "Energia Ltda",
      categoryId: fx.expenseCat.id,
      amountCents: 5_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-05"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: settled.id,
      amountCents: 5_000,
      settledAt: toDate("2026-08-05"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de água",
      counterparty: "Energia Ltda",
      categoryId: fx.expenseCat.id,
      amountCents: 1_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-10"),
    });

    // Cliente: recebido no mesmo mês.
    const income = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Venda",
      counterparty: "Cliente X",
      categoryId: fx.incomeCat.id,
      amountCents: 8_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-15"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: income.id,
      amountCents: 8_000,
      settledAt: toDate("2026-08-20"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // Mês diferente: não deve contar em agosto.
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de luz",
      counterparty: "Energia Ltda",
      categoryId: fx.expenseCat.id,
      amountCents: 999,
      competenceMonth: "2026-09",
      dueDate: toDate("2026-09-05"),
    });

    const report = await byCounterpartyReport(db.prisma, fx.org.id, "2026-08");

    expect(report).toEqual([
      { counterparty: "Cliente X", direction: "RECEIVABLE", previstoCents: 8_000, realizadoCents: 8_000 },
      { counterparty: "Energia Ltda", direction: "PAYABLE", previstoCents: 6_000, realizadoCents: 5_000 },
    ]);
  });

  it("mês sem lançamentos → lista vazia (sem pré-seed)", async () => {
    const report = await byCounterpartyReport(db.prisma, fx.org.id, "2026-01");
    expect(report).toEqual([]);
  });

  it("month inválido → INVALID_MONTH", async () => {
    await expect(byCounterpartyReport(db.prisma, fx.org.id, "2026-13")).rejects.toMatchObject({
      code: "INVALID_MONTH",
    });
  });
});

describe("dreReport", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("separa receitas/despesas por categoria e calcula o resultado do mês", async () => {
    const rentCat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Aluguel", kind: "EXPENSE" },
    });

    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de luz",
      counterparty: "Energia Ltda",
      categoryId: fx.expenseCat.id,
      amountCents: 5_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-05"),
    });
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Aluguel agosto",
      counterparty: "Imobiliária",
      categoryId: rentCat.id,
      amountCents: 3_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-10"),
    });
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Venda",
      counterparty: "Cliente X",
      categoryId: fx.incomeCat.id,
      amountCents: 8_000,
      competenceMonth: "2026-08",
      dueDate: toDate("2026-08-15"),
    });

    const report = await dreReport(db.prisma, fx.org.id, "2026-08");

    expect(report.month).toBe("2026-08");
    expect(report.receitas).toEqual([
      { categoryId: fx.incomeCat.id, categoryName: fx.incomeCat.name, amountCents: 8_000 },
    ]);
    expect(report.despesas.map((r) => r.categoryId).sort()).toEqual([fx.expenseCat.id, rentCat.id].sort());
    expect(report.totalReceitasCents).toBe(8_000);
    expect(report.totalDespesasCents).toBe(8_000);
    expect(report.resultadoCents).toBe(0);
    expect(report.closedThroughMonth).toBeNull();
    expect(report.isClosed).toBe(false);
  });

  it("closedThroughMonth/isClosed refletem o cursor de fechamento da organização", async () => {
    await setClosedThroughMonth(db.prisma, fx.org.id, "2026-08");

    const closed = await dreReport(db.prisma, fx.org.id, "2026-08");
    expect(closed.closedThroughMonth).toBe("2026-08");
    expect(closed.isClosed).toBe(true);

    const open = await dreReport(db.prisma, fx.org.id, "2026-09");
    expect(open.closedThroughMonth).toBe("2026-08");
    expect(open.isClosed).toBe(false);
  });

  it("month inválido → INVALID_MONTH", async () => {
    await expect(dreReport(db.prisma, fx.org.id, "2026-13")).rejects.toMatchObject({
      code: "INVALID_MONTH",
    });
  });
});

describe("projectionReport", () => {
  const TODAY = "2026-06-15";
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("acumula remainingCents por dueDate; vencidas entram no mês de hoje", async () => {
    // Vencida (antes de hoje) → cai no mês corrente (junho).
    await newEntry(fx, "RECEIVABLE", 30_000, "2026-05", "2026-05-01");
    // Em aberto, vence ainda este mês.
    await newEntry(fx, "PAYABLE", 10_000, "2026-06", "2026-06-20");
    // Próximo mês.
    await newEntry(fx, "RECEIVABLE", 5_000, "2026-07", "2026-07-10");
    // Mais adiante.
    await newEntry(fx, "PAYABLE", 2_000, "2026-09", "2026-09-05");
    // Fora do horizonte de 6 meses (2026-06..2026-11) — não deve aparecer.
    await newEntry(fx, "RECEIVABLE", 999_999, "2026-12", "2026-12-01");
    // Totalmente paga: não afeta a projeção, mas o movimento afeta o saldo atual.
    const settled = await newEntry(fx, "PAYABLE", 1_000, "2026-06", "2026-06-10");
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: settled.id,
      amountCents: 1_000,
      settledAt: toDate("2026-06-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const projection = await projectionReport(db.prisma, fx.org.id, 6, TODAY);
    expect(projection.map((p) => p.month)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);

    // saldo inicial 150_000 - 1_000 (movimento da baixa) = 149_000
    // junho: payable e receivable no mesmo mês
    expect(projection[0]).toEqual({
      month: "2026-06",
      payableCents: 10_000,
      receivableCents: 30_000,
      balanceCents: 169_000, // +30_000 -10_000
    });
    // julho: só receivable
    expect(projection[1]).toEqual({
      month: "2026-07",
      payableCents: 0,
      receivableCents: 5_000,
      balanceCents: 174_000, // +5_000
    });
    // agosto: mês sem nenhum
    expect(projection[2]).toEqual({
      month: "2026-08",
      payableCents: 0,
      receivableCents: 0,
      balanceCents: 174_000,
    });
    // setembro: só payable
    expect(projection[3]).toEqual({
      month: "2026-09",
      payableCents: 2_000,
      receivableCents: 0,
      balanceCents: 172_000, // -2_000
    });
    expect(projection[4]).toEqual({
      month: "2026-10",
      payableCents: 0,
      receivableCents: 0,
      balanceCents: 172_000,
    });
    expect(projection[5]).toEqual({
      month: "2026-11",
      payableCents: 0,
      receivableCents: 0,
      balanceCents: 172_000,
    });
  });

  it("months < 1 → INVALID_MONTHS", async () => {
    await expect(projectionReport(db.prisma, fx.org.id, 0, TODAY)).rejects.toMatchObject({
      code: "INVALID_MONTHS",
    });
  });
});

describe("dashboard", () => {
  const TODAY = "2026-06-15";
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("totals seguem o mês navegado; saldos, alertas e projeção seguem hoje", async () => {
    // --- Alertas (todos com competência de junho, relativos a TODAY=15/06) ---
    const overdue = await newEntry(fx, "PAYABLE", 3_000, "2026-06", "2026-06-10"); // vencida
    const dueToday = await newEntry(fx, "RECEIVABLE", 4_000, "2026-06", "2026-06-15"); // hoje
    const dueSoon1 = await newEntry(fx, "PAYABLE", 500, "2026-06", "2026-06-20"); // +5 dias
    const dueSoon2 = await newEntry(fx, "RECEIVABLE", 6_000, "2026-06", "2026-06-22"); // +7 dias (limite)
    await newEntry(fx, "PAYABLE", 700, "2026-06", "2026-06-23"); // +8 dias: fora do alerta, dentro da projeção

    // Paga (vencida mas liquidada): não deve gerar alerta.
    const settledOverdue = await newEntry(fx, "PAYABLE", 2_000, "2026-06", "2026-06-12");
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: settledOverdue.id,
      amountCents: 2_000,
      settledAt: toDate("2026-06-12"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // --- Totals do mês navegado (julho) ---
    await newEntry(fx, "PAYABLE", 12_000, "2026-07", "2026-07-05"); // só previsto
    const incomeJuly = await newEntry(fx, "RECEIVABLE", 9_000, "2026-07", "2026-07-10");
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: incomeJuly.id,
      amountCents: 9_000,
      settledAt: toDate("2026-07-08"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const dash = await dashboard(db.prisma, fx.org.id, "2026-07", TODAY);

    expect(dash.month).toBe("2026-07");

    // saldo: 150_000 inicial - 2_000 (settledOverdue) + 9_000 (incomeJuly) = 157_000
    expect(dash.totalBalanceCents).toBe(157_000);
    expect(dash.accounts.find((a) => a.id === fx.account.id)?.balanceCents).toBe(107_000);
    expect(dash.accounts.find((a) => a.id === fx.account2.id)?.balanceCents).toBe(50_000);

    // totals seguem julho, não junho
    expect(dash.totals).toEqual({
      payable: { previstoCents: 12_000, realizadoCents: 0 },
      receivable: { previstoCents: 9_000, realizadoCents: 9_000 },
    });

    // alertas seguem hoje (15/06), independente do mês navegado
    expect(dash.alerts.overdue.map((a) => a.id)).toEqual([overdue.id]);
    expect(dash.alerts.overdue[0]).toMatchObject({ remainingCents: 3_000, dueDate: "2026-06-10" });

    expect(dash.alerts.dueToday.map((a) => a.id)).toEqual([dueToday.id]);
    expect(dash.alerts.dueToday[0]).toMatchObject({ remainingCents: 4_000, dueDate: "2026-06-15" });

    expect(dash.alerts.dueSoon.map((a) => a.id)).toEqual([dueSoon1.id, dueSoon2.id]);

    // projeção sempre começa no mês de hoje (junho), independente do mês navegado
    expect(dash.projection[0]?.month).toBe("2026-06");
    // 157_000 + (4_000 + 6_000) [recebíveis] - (3_000 + 500 + 700) [pagáveis] = 162_800
    expect(dash.projection[0]?.balanceCents).toBe(162_800);
    expect(dash.projection[1]?.month).toBe("2026-07");
    // -12_000 (a pagar de julho, ainda em aberto)
    expect(dash.projection[1]?.balanceCents).toBe(150_800);
  });

  it("month inválido → INVALID_MONTH", async () => {
    await expect(dashboard(db.prisma, fx.org.id, "2026-13", TODAY)).rejects.toMatchObject({
      code: "INVALID_MONTH",
    });
  });
});

describe("byCostCenterReport", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("agrupa previsto e realizado por centro de custo; sem centro de custo aparece por último", async () => {
    const cc = await db.prisma.costCenter.create({
      data: { organizationId: fx.org.id, name: "Obra A" },
    });

    // Despesa com centro de custo, paga no mesmo mês.
    const e1 = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Material",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      costCenterId: cc.id,
      amountCents: 10_000,
      competenceMonth: "2026-10",
      dueDate: toDate("2026-10-05"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: e1.id,
      amountCents: 10_000,
      settledAt: toDate("2026-10-06"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // Receita sem centro de custo (só previsto — em aberto).
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Venda",
      counterparty: "Cliente",
      categoryId: fx.incomeCat.id,
      amountCents: 5_000,
      competenceMonth: "2026-10",
      dueDate: toDate("2026-10-15"),
    });

    const report = await byCostCenterReport(db.prisma, fx.org.id, "2026-10");

    expect(report).toHaveLength(2);
    expect(report[0]!.costCenterId).toBe(cc.id);
    expect(report[0]!.costCenterName).toBe("Obra A");
    expect(report[0]!.totalDespesasPrevistoCents).toBe(10_000);
    expect(report[0]!.totalDespesasRealizadoCents).toBe(10_000);
    expect(report[0]!.totalReceitasPrevistoCents).toBe(0);
    expect(report[0]!.resultadoPrevistoCents).toBe(-10_000);
    expect(report[0]!.resultadoRealizadoCents).toBe(-10_000);

    expect(report[1]!.costCenterId).toBeNull();
    expect(report[1]!.costCenterName).toBe("Sem centro de custo");
    expect(report[1]!.totalReceitasPrevistoCents).toBe(5_000);
    expect(report[1]!.totalReceitasRealizadoCents).toBe(0);
    expect(report[1]!.resultadoPrevistoCents).toBe(5_000);
  });

  it("centro de custo sem movimentação no mês é omitido", async () => {
    const cc = await db.prisma.costCenter.create({
      data: { organizationId: fx.org.id, name: "Obra Vazia" },
    });
    const report = await byCostCenterReport(db.prisma, fx.org.id, "2026-11");
    expect(report.find((r) => r.costCenterId === cc.id)).toBeUndefined();
  });

  it("month inválido → INVALID_MONTH", async () => {
    await expect(byCostCenterReport(db.prisma, fx.org.id, "2026-13")).rejects.toMatchObject({
      code: "INVALID_MONTH",
    });
  });
});

describe("chartReport", () => {
  const TODAY = "2026-06-15";
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeFixture(db.prisma);
  });

  it("retorna últimos N meses de realizado, do mais antigo ao mais recente", async () => {
    // Settlement em abril (3 meses atrás de junho).
    const e1 = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Receita abril",
      counterparty: "Cliente",
      categoryId: fx.incomeCat.id,
      amountCents: 20_000,
      competenceMonth: "2026-04",
      dueDate: toDate("2026-04-10"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: e1.id,
      amountCents: 20_000,
      settledAt: toDate("2026-04-15"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // Settlement em junho.
    const e2 = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Despesa junho",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      amountCents: 8_000,
      competenceMonth: "2026-06",
      dueDate: toDate("2026-06-10"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: e2.id,
      amountCents: 8_000,
      settledAt: toDate("2026-06-12"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const report = await chartReport(db.prisma, fx.org.id, 3, TODAY);

    // 3 meses: abril, maio, junho
    expect(report.map((r) => r.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(report.find((r) => r.month === "2026-04")).toMatchObject({
      receitasCents: 20_000,
      despesasCents: 0,
      resultadoCents: 20_000,
    });
    expect(report.find((r) => r.month === "2026-05")).toMatchObject({
      receitasCents: 0,
      despesasCents: 0,
      resultadoCents: 0,
    });
    expect(report.find((r) => r.month === "2026-06")).toMatchObject({
      receitasCents: 0,
      despesasCents: 8_000,
      resultadoCents: -8_000,
    });
  });

  it("boundary de virada de ano: settlements de dez/2025 e jan/2026 são separados", async () => {
    const e1 = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Receita dez",
      counterparty: "Cliente",
      categoryId: fx.incomeCat.id,
      amountCents: 3_000,
      competenceMonth: "2025-12",
      dueDate: toDate("2025-12-20"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: e1.id,
      amountCents: 3_000,
      settledAt: toDate("2025-12-20"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const e2 = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Despesa jan",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      amountCents: 1_500,
      competenceMonth: "2026-01",
      dueDate: toDate("2026-01-10"),
    });
    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: e2.id,
      amountCents: 1_500,
      settledAt: toDate("2026-01-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    // today = 2026-06-15, 7 meses = 2025-12 a 2026-06
    const report = await chartReport(db.prisma, fx.org.id, 7, TODAY);
    expect(report[0]!.month).toBe("2025-12");
    expect(report[0]!.receitasCents).toBe(3_000);
    expect(report[1]!.month).toBe("2026-01");
    expect(report[1]!.despesasCents).toBe(1_500);
  });

  it("months < 1 → INVALID_MONTHS", async () => {
    await expect(chartReport(db.prisma, fx.org.id, 0, TODAY)).rejects.toMatchObject({
      code: "INVALID_MONTHS",
    });
  });
});
