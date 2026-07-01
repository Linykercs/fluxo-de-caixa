// Orçamento recorrente por categoria: mesmo espírito das Recurrence (editar "a
// partir de um mês" preserva o valor nos meses passados), mas sem materializar
// nada em Entry — orçado x realizado é sempre calculado on-the-fly a partir do
// mesmo Σ Entry.amountCents por competência que o relatório por categoria usa.
import { addMonths, isValidCompetenceMonth } from "../lib/dates";
import { BusinessError, NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";

function assertMonth(value: string, field = "month"): void {
  if (!isValidCompetenceMonth(value)) {
    throw new BusinessError("INVALID_MONTH", `${field} inválido: "${value}" (esperado "YYYY-MM")`);
  }
}

/** "YYYY-MM" | null → comparável (null = sem fim, trata como "infinito"). */
const FAR_FUTURE = "9999-12";

async function assertNoOverlap(
  db: Db,
  organizationId: string,
  categoryId: string,
  startMonth: string,
  endMonth: string | null,
  excludeBudgetId?: string,
): Promise<void> {
  const existing = await db.budget.findMany({
    where: { organizationId, categoryId, id: excludeBudgetId ? { not: excludeBudgetId } : undefined },
  });
  const newEnd = endMonth ?? FAR_FUTURE;
  const overlaps = existing.some((b) => {
    const existingEnd = b.endMonth ?? FAR_FUTURE;
    return startMonth <= existingEnd && b.startMonth <= newEnd;
  });
  if (overlaps) {
    throw new BusinessError("BUDGET_OVERLAP", "Já existe um orçamento para essa categoria nesse período");
  }
}

async function assertCategoryExists(db: Db, organizationId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, organizationId } });
  if (!category || category.archivedAt) {
    throw new NotFoundError("CATEGORY_NOT_FOUND", "Categoria não encontrada ou arquivada");
  }
}

export interface CreateBudgetInput {
  organizationId: string;
  categoryId: string;
  amountCents: number;
  startMonth: string;
  endMonth?: string | null;
}

export async function createBudget(db: Db, input: CreateBudgetInput) {
  if (input.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  assertMonth(input.startMonth, "startMonth");
  const endMonth = input.endMonth ?? null;
  if (endMonth !== null) {
    assertMonth(endMonth, "endMonth");
    if (endMonth < input.startMonth) {
      throw new BusinessError("INVALID_MONTH", "endMonth anterior a startMonth");
    }
  }
  await assertCategoryExists(db, input.organizationId, input.categoryId);
  await assertNoOverlap(db, input.organizationId, input.categoryId, input.startMonth, endMonth);

  return db.budget.create({
    data: {
      organizationId: input.organizationId,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      startMonth: input.startMonth,
      endMonth,
    },
  });
}

async function getBudgetOrThrow(db: Db, organizationId: string, budgetId: string) {
  const budget = await db.budget.findFirst({ where: { id: budgetId, organizationId } });
  if (!budget) throw new NotFoundError("BUDGET_NOT_FOUND", "Orçamento não encontrado");
  return budget;
}

/**
 * Muda o valor orçado a partir de `effectiveMonth`, preservando o valor nos
 * meses anteriores: se `effectiveMonth` é o próprio início da regra, só
 * atualiza; senão fecha a regra atual em `effectiveMonth - 1` e cria uma nova
 * a partir de `effectiveMonth` com o novo valor (carregando o fim antigo).
 */
export async function updateBudgetFromMonth(
  db: Db,
  input: { organizationId: string; budgetId: string; effectiveMonth: string; amountCents: number },
) {
  if (input.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  assertMonth(input.effectiveMonth, "effectiveMonth");
  const budget = await getBudgetOrThrow(db, input.organizationId, input.budgetId);
  if (input.effectiveMonth < budget.startMonth) {
    throw new BusinessError("INVALID_MONTH", "effectiveMonth anterior ao início da regra");
  }
  if (budget.endMonth !== null && input.effectiveMonth > budget.endMonth) {
    throw new BusinessError("INVALID_MONTH", "effectiveMonth depois do fim da regra");
  }

  if (input.effectiveMonth === budget.startMonth) {
    return db.budget.update({ where: { id: budget.id }, data: { amountCents: input.amountCents } });
  }

  const previousMonth = addMonths(input.effectiveMonth, -1);
  return db.$transaction(async (tx) => {
    await tx.budget.update({ where: { id: budget.id }, data: { endMonth: previousMonth } });
    return tx.budget.create({
      data: {
        organizationId: budget.organizationId,
        categoryId: budget.categoryId,
        amountCents: input.amountCents,
        startMonth: input.effectiveMonth,
        endMonth: budget.endMonth,
      },
    });
  });
}

/** Encerra a regra a partir de `effectiveMonth` (exclusive: esse mês em diante deixa de ter orçamento). */
export async function cancelBudgetFromMonth(
  db: Db,
  input: { organizationId: string; budgetId: string; effectiveMonth: string },
) {
  assertMonth(input.effectiveMonth, "effectiveMonth");
  const budget = await getBudgetOrThrow(db, input.organizationId, input.budgetId);

  if (input.effectiveMonth <= budget.startMonth) {
    await db.budget.delete({ where: { id: budget.id } });
    return null;
  }
  return db.budget.update({
    where: { id: budget.id },
    data: { endMonth: addMonths(input.effectiveMonth, -1) },
  });
}

export async function listBudgets(db: Db, organizationId: string) {
  return db.budget.findMany({
    where: { organizationId },
    include: { category: { select: { name: true, kind: true } } },
    orderBy: [{ category: { name: "asc" } }, { startMonth: "asc" }],
  });
}

export interface BudgetReportRow {
  categoryId: string;
  categoryName: string;
  kind: "EXPENSE" | "INCOME";
  budgetId: string | null;
  budgetedCents: number;
  actualCents: number;
}

/** Orçado (regra vigente no mês) x realizado (Σ Entry.amountCents da competência), por categoria ativa. */
export async function budgetReport(db: Db, organizationId: string, month: string): Promise<BudgetReportRow[]> {
  assertMonth(month);

  const categories = await db.category.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const rows = new Map<string, BudgetReportRow>(
    categories.map((category) => [
      category.id,
      {
        categoryId: category.id,
        categoryName: category.name,
        kind: category.kind as "EXPENSE" | "INCOME",
        budgetId: null,
        budgetedCents: 0,
        actualCents: 0,
      },
    ]),
  );

  const budgets = await db.budget.findMany({
    where: {
      organizationId,
      startMonth: { lte: month },
      OR: [{ endMonth: null }, { endMonth: { gte: month } }],
    },
  });
  for (const budget of budgets) {
    const row = rows.get(budget.categoryId);
    if (row) {
      row.budgetId = budget.id;
      row.budgetedCents = budget.amountCents;
    }
  }

  const entries = await db.entry.findMany({
    where: { organizationId, deletedAt: null, competenceMonth: month },
    select: { categoryId: true, amountCents: true },
  });
  for (const entry of entries) {
    const row = rows.get(entry.categoryId);
    if (row) row.actualCents += entry.amountCents;
  }

  return [...rows.values()];
}
