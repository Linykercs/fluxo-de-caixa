// Derivados da Entry e criação de parcelamento (spec §4 e §5).
// Invariantes: settledCents ignora settlements estornadas e seus estornos;
// status nunca é armazenado; Σ parcelas = total exato.
import { randomUUID } from "node:crypto";
import type { Entry, Settlement } from "../generated/prisma/client";
import { calendarDate, isOverdue, lastDayOfMonth, addMonths, todaySP, competenceOf, toDate } from "../lib/dates";
import { BusinessError, NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";
import { getClosedThroughMonth } from "./organizations";

export type EntryStatus = "OPEN" | "SETTLED" | "OVERDUE";

export interface EntryDerived {
  settledCents: number;
  remainingCents: number;
  status: EntryStatus;
}

/** Settlements que contam para o valor baixado: nem estornadas, nem estornos. */
export function activeSettlements<S extends Settlement>(settlements: S[]): S[] {
  return settlements.filter((s) => s.reversalOfId === null && s.reversedById === null);
}

export function deriveEntry(
  entry: Pick<Entry, "amountCents" | "dueDate"> & { settlements: Settlement[] },
  today: string = todaySP(),
): EntryDerived {
  const settledCents = activeSettlements(entry.settlements).reduce(
    (sum, s) => sum + s.amountCents,
    0,
  );
  const remainingCents = entry.amountCents - settledCents;
  const status: EntryStatus =
    remainingCents === 0 ? "SETTLED" : isOverdue(entry.dueDate, today) ? "OVERDUE" : "OPEN";
  return { settledCents, remainingCents, status };
}

/** Carrega entry viva (não soft-deletada) com settlements, ou 404. */
export async function getEntryOrThrow(db: Db, organizationId: string, entryId: string) {
  const entry = await db.entry.findFirst({
    where: { id: entryId, organizationId, deletedAt: null },
    include: { settlements: true },
  });
  if (!entry) throw new NotFoundError("ENTRY_NOT_FOUND", "Lançamento não encontrado");
  return entry;
}

/** Categoria deve existir, estar ativa e ter kind coerente com a direção. */
export async function assertCategoryMatches(db: Db, organizationId: string, categoryId: string, direction: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, organizationId } });
  if (!category || category.archivedAt) {
    throw new NotFoundError("CATEGORY_NOT_FOUND", "Categoria não encontrada ou arquivada");
  }
  const expected = direction === "PAYABLE" ? "EXPENSE" : "INCOME";
  if (category.kind !== expected) {
    throw new BusinessError(
      "CATEGORY_KIND_MISMATCH",
      `Categoria ${category.kind} não pode ser usada em lançamento ${direction}`,
    );
  }
  return category;
}

/** Lançamentos com competência em mês fechado são rejeitados (spec §8/F6). */
export async function assertPeriodOpen(db: Db, organizationId: string, competenceMonth: string): Promise<void> {
  const closedThroughMonth = await getClosedThroughMonth(db, organizationId);
  if (closedThroughMonth !== null && competenceMonth <= closedThroughMonth) {
    throw new BusinessError("PERIOD_CLOSED", `O mês ${competenceMonth} está fechado para lançamentos.`);
  }
}

export interface CreateInstallmentsInput {
  organizationId: string;
  direction: "PAYABLE" | "RECEIVABLE";
  description: string;
  counterparty: string;
  notes?: string;
  categoryId: string;
  costCenterId?: string | null;
  totalCents: number;
  installmentTotal: number;
  firstDueDate: Date;
  firstCompetenceMonth: string;
}

/**
 * Parcelamento: N entries independentes no mesmo installmentGroupId, com
 * vencimentos e competências mensais consecutivos. O resto da divisão vai na
 * última parcela; meses curtos usam o último dia (31/jan → 28/fev).
 */
export async function createInstallments(db: Db, input: CreateInstallmentsInput) {
  const n = input.installmentTotal;
  if (!Number.isInteger(n) || n < 2) {
    throw new BusinessError("INVALID_INSTALLMENT_COUNT", "Parcelamento exige 2 ou mais parcelas");
  }
  if (input.totalCents < n) {
    throw new BusinessError(
      "AMOUNT_TOO_SMALL",
      "Valor total menor que 1 centavo por parcela",
    );
  }
  await assertCategoryMatches(db, input.organizationId, input.categoryId, input.direction);
  for (let i = 0; i < n; i++) {
    await assertPeriodOpen(db, input.organizationId, addMonths(input.firstCompetenceMonth, i));
  }

  const base = Math.floor(input.totalCents / n);
  const groupId = randomUUID();
  const firstDay = Number(calendarDate(input.firstDueDate).slice(8, 10));

  const entries = [];
  for (let i = 0; i < n; i++) {
    const month = addMonths(input.firstCompetenceMonth, i);
    const day = Math.min(firstDay, lastDayOfMonth(month));
    entries.push(
      await db.entry.create({
        data: {
          organizationId: input.organizationId,
          direction: input.direction,
          description: input.description,
          counterparty: input.counterparty,
          notes: input.notes,
          categoryId: input.categoryId,
          costCenterId: input.costCenterId,
          amountCents: i === n - 1 ? input.totalCents - base * (n - 1) : base,
          competenceMonth: month,
          dueDate: toDate(`${month}-${String(day).padStart(2, "0")}`),
          installmentGroupId: groupId,
          installmentNumber: i + 1,
          installmentTotal: n,
        },
      }),
    );
  }
  return entries;
}

export interface CreateSingleEntryInput {
  organizationId: string;
  direction: "PAYABLE" | "RECEIVABLE";
  description: string;
  counterparty: string;
  notes?: string;
  categoryId: string;
  costCenterId?: string | null;
  amountCents: number;
  competenceMonth?: string;
  dueDate: Date;
}

export interface UpdateEntryChanges {
  description?: string;
  counterparty?: string;
  notes?: string | null;
  categoryId?: string;
  costCenterId?: string | null;
  amountCents?: number;
  dueDate?: Date;
  competenceMonth?: string;
}

/**
 * Edição de Entry (spec §5): sem baixa ativa tudo é editável; com baixa
 * (não estornada) valor e datas ficam travados — estorne primeiro.
 */
export async function updateEntry(db: Db, organizationId: string, entryId: string, changes: UpdateEntryChanges) {
  const entry = await getEntryOrThrow(db, organizationId, entryId);
  await assertPeriodOpen(db, entry.organizationId, entry.competenceMonth);
  if (changes.competenceMonth !== undefined) {
    await assertPeriodOpen(db, entry.organizationId, changes.competenceMonth);
  }
  const hasActive = activeSettlements(entry.settlements).length > 0;
  const locked = (["amountCents", "dueDate", "competenceMonth"] as const).filter(
    (field) => changes[field] !== undefined,
  );
  if (hasActive && locked.length > 0) {
    throw new BusinessError(
      "ENTRY_HAS_SETTLEMENTS",
      `Lançamento com baixa ativa: estorne antes de alterar ${locked.join(", ")}`,
    );
  }
  if (changes.amountCents !== undefined && changes.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  if (changes.categoryId !== undefined) {
    await assertCategoryMatches(db, organizationId, changes.categoryId, entry.direction);
  }
  return db.entry.update({ where: { id: entry.id }, data: { ...changes } });
}

/** Exclusão é soft delete e só sem baixas ativas (spec §3.5). */
export async function deleteEntry(db: Db, organizationId: string, entryId: string) {
  const entry = await getEntryOrThrow(db, organizationId, entryId);
  if (activeSettlements(entry.settlements).length > 0) {
    throw new BusinessError(
      "ENTRY_HAS_SETTLEMENTS",
      "Lançamento com baixa ativa não pode ser excluído: estorne primeiro",
    );
  }
  return db.entry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });
}

export interface ListEntriesFilter {
  organizationId: string;
  direction: "PAYABLE" | "RECEIVABLE";
  month?: string;
  status?: EntryStatus;
  categoryId?: string;
  costCenterId?: string;
  bankAccountId?: string;
}

/**
 * Entries da direção com derivados (spec §6: GET /payables, /receivables).
 * `bankAccountId` filtra pelas entries com baixa ativa naquela conta.
 */
export async function listEntries(
  db: Db,
  filter: ListEntriesFilter,
  today: string = todaySP(),
) {
  const entries = await db.entry.findMany({
    where: {
      organizationId: filter.organizationId,
      direction: filter.direction,
      deletedAt: null,
      ...(filter.month ? { competenceMonth: filter.month } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.costCenterId ? { costCenterId: filter.costCenterId } : {}),
      ...(filter.bankAccountId
        ? { settlements: { some: { bankAccountId: filter.bankAccountId, reversalOfId: null } } }
        : {}),
    },
    include: {
      settlements: {
        where: { reversalOfId: null, reversedById: null },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const derived = entries.map((entry) => ({ ...entry, ...deriveEntry(entry, today) }));
  return filter.status ? derived.filter((entry) => entry.status === filter.status) : derived;
}

/** Lançamento único; competência default = mês do vencimento. */
export async function createSingleEntry(db: Db, input: CreateSingleEntryInput) {
  if (input.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  await assertCategoryMatches(db, input.organizationId, input.categoryId, input.direction);
  const competenceMonth = input.competenceMonth ?? competenceOf(input.dueDate);
  await assertPeriodOpen(db, input.organizationId, competenceMonth);
  return db.entry.create({
    data: {
      organizationId: input.organizationId,
      direction: input.direction,
      description: input.description,
      counterparty: input.counterparty,
      notes: input.notes,
      categoryId: input.categoryId,
      costCenterId: input.costCenterId,
      amountCents: input.amountCents,
      competenceMonth,
      dueDate: input.dueDate,
    },
  });
}
