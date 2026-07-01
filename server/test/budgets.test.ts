import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { createSingleEntry } from "../src/services/entries";
import {
  budgetReport,
  cancelBudgetFromMonth,
  createBudget,
  updateBudgetFromMonth,
} from "../src/services/budgets";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

describe("createBudget", () => {
  it("cria uma regra recorrente sem fim definido", async () => {
    const budget = await createBudget(db.prisma, {
      organizationId: fx.org.id,
      categoryId: fx.expenseCat.id,
      amountCents: 50_000,
      startMonth: "2026-01",
    });
    expect(budget.amountCents).toBe(50_000);
    expect(budget.endMonth).toBeNull();
  });

  it("rejeita sobreposição com regra existente da mesma categoria", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Aluguel", kind: "EXPENSE" },
    });
    await createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 10_000, startMonth: "2026-02", endMonth: "2026-06" });

    await expect(
      createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 20_000, startMonth: "2026-05" }),
    ).rejects.toThrow(/BUDGET_OVERLAP|orçamento/i);
  });

  it("rejeita valor não positivo", async () => {
    await expect(
      createBudget(db.prisma, { organizationId: fx.org.id, categoryId: fx.incomeCat.id, amountCents: 0, startMonth: "2026-01" }),
    ).rejects.toThrow();
  });
});

describe("updateBudgetFromMonth", () => {
  it("atualiza em lugar quando effectiveMonth é o próprio início", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Marketing", kind: "EXPENSE" },
    });
    const budget = await createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 30_000, startMonth: "2026-03" });

    const updated = await updateBudgetFromMonth(db.prisma, {
      organizationId: fx.org.id,
      budgetId: budget.id,
      effectiveMonth: "2026-03",
      amountCents: 35_000,
    });

    expect(updated.id).toBe(budget.id);
    expect(updated.amountCents).toBe(35_000);
    const all = await db.prisma.budget.findMany({ where: { categoryId: cat.id } });
    expect(all).toHaveLength(1);
  });

  it("preserva o valor nos meses passados ao mudar a partir de um mês futuro", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Software", kind: "EXPENSE" },
    });
    const budget = await createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 10_000, startMonth: "2026-01" });

    await updateBudgetFromMonth(db.prisma, {
      organizationId: fx.org.id,
      budgetId: budget.id,
      effectiveMonth: "2026-04",
      amountCents: 15_000,
    });

    const reportBefore = await budgetReport(db.prisma, fx.org.id, "2026-02");
    const reportAfter = await budgetReport(db.prisma, fx.org.id, "2026-05");
    expect(reportBefore.find((r) => r.categoryId === cat.id)?.budgetedCents).toBe(10_000);
    expect(reportAfter.find((r) => r.categoryId === cat.id)?.budgetedCents).toBe(15_000);
  });
});

describe("cancelBudgetFromMonth", () => {
  it("exclui a regra quando effectiveMonth é o início", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Viagens", kind: "EXPENSE" },
    });
    const budget = await createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 5_000, startMonth: "2026-06" });

    await cancelBudgetFromMonth(db.prisma, { organizationId: fx.org.id, budgetId: budget.id, effectiveMonth: "2026-06" });

    const found = await db.prisma.budget.findUnique({ where: { id: budget.id } });
    expect(found).toBeNull();
  });

  it("encerra a regra a partir de um mês futuro, mantendo o passado", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Consultoria", kind: "EXPENSE" },
    });
    const budget = await createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 8_000, startMonth: "2026-01" });

    await cancelBudgetFromMonth(db.prisma, { organizationId: fx.org.id, budgetId: budget.id, effectiveMonth: "2026-04" });

    const reportBefore = await budgetReport(db.prisma, fx.org.id, "2026-03");
    const reportAfter = await budgetReport(db.prisma, fx.org.id, "2026-04");
    expect(reportBefore.find((r) => r.categoryId === cat.id)?.budgetedCents).toBe(8_000);
    expect(reportAfter.find((r) => r.categoryId === cat.id)?.budgetedCents).toBe(0);
  });
});

describe("budgetReport", () => {
  it("compara orçado (regra vigente) com realizado (soma de lançamentos da competência)", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Energia", kind: "EXPENSE" },
    });
    await createBudget(db.prisma, { organizationId: fx.org.id, categoryId: cat.id, amountCents: 20_000, startMonth: "2026-07" });
    await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Conta de luz",
      counterparty: "Energisa",
      categoryId: cat.id,
      amountCents: 18_500,
      dueDate: toDate("2026-07-10"),
    });

    const report = await budgetReport(db.prisma, fx.org.id, "2026-07");
    const row = report.find((r) => r.categoryId === cat.id);

    expect(row?.budgetedCents).toBe(20_000);
    expect(row?.actualCents).toBe(18_500);
  });

  it("categoria sem orçamento aparece com budgetedCents zero", async () => {
    const cat = await db.prisma.category.create({
      data: { organizationId: fx.org.id, name: "Sem orçamento", kind: "EXPENSE" },
    });
    const report = await budgetReport(db.prisma, fx.org.id, "2026-08");
    const row = report.find((r) => r.categoryId === cat.id);
    expect(row?.budgetedCents).toBe(0);
    expect(row?.budgetId).toBeNull();
  });
});
