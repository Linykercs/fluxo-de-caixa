// Recorrência (spec §5): materializa 12 meses à frente, horizonte rolante
// idempotente, edição de série estilo agenda (só esta / esta e futuras) e
// cancelamento. Ocorrências pagas ou parcialmente pagas nunca mudam.
import { addMonths, dueDateInMonth, isValidCompetenceMonth, todaySP } from "../lib/dates";
import { BusinessError, NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import type { EntryModel, RecurrenceModel } from "../generated/prisma/models";
import { activeSettlements, assertCategoryMatches, assertCostCenterMatches, assertPeriodOpen } from "./entries";

export interface CreateRecurrenceInput {
  organizationId: string;
  direction: "PAYABLE" | "RECEIVABLE";
  description: string;
  counterparty: string;
  categoryId: string;
  costCenterId?: string | null;
  amountCents: number;
  dueDay: number;
  startMonth: string;
  endMonth?: string;
}

const HORIZON_MONTHS = 12;

function assertMonth(value: string, field: string) {
  if (!isValidCompetenceMonth(value)) {
    throw new BusinessError("INVALID_MONTH", `${field} inválido: "${value}" (esperado "YYYY-MM")`);
  }
}

/** Gera as entries da regra de `from` até `to` (inclusive). */
async function materializeRange(
  db: Db,
  recurrence: {
    id: string;
    organizationId: string;
    direction: string;
    description: string;
    counterparty: string;
    categoryId: string;
    costCenterId: string | null;
    amountCents: number;
    dueDay: number;
  },
  from: string,
  to: string,
) {
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    await db.entry.create({
      data: {
        organizationId: recurrence.organizationId,
        direction: recurrence.direction,
        description: recurrence.description,
        counterparty: recurrence.counterparty,
        categoryId: recurrence.categoryId,
        costCenterId: recurrence.costCenterId,
        amountCents: recurrence.amountCents,
        competenceMonth: month,
        dueDate: dueDateInMonth(month, recurrence.dueDay),
        recurrenceId: recurrence.id,
      },
    });
  }
}

/** Fim do horizonte rolante: 12 meses contando o mês corrente. */
function horizonEnd(today: string): string {
  return addMonths(today.slice(0, 7), HORIZON_MONTHS - 1);
}

export async function createRecurrence(prisma: PrismaClient, input: CreateRecurrenceInput) {
  assertMonth(input.startMonth, "startMonth");
  if (input.endMonth !== undefined) {
    assertMonth(input.endMonth, "endMonth");
    if (input.endMonth < input.startMonth) {
      throw new BusinessError("INVALID_MONTH", "endMonth anterior a startMonth");
    }
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    throw new BusinessError("INVALID_DUE_DAY", "dueDay deve estar entre 1 e 31");
  }
  if (input.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  await assertCategoryMatches(prisma, input.organizationId, input.categoryId, input.direction);
  if (input.costCenterId) {
    await assertCostCenterMatches(prisma, input.organizationId, input.costCenterId);
  }
  await assertPeriodOpen(prisma, input.organizationId, input.startMonth);

  return prisma.$transaction(async (tx) => {
    const until = [addMonths(input.startMonth, HORIZON_MONTHS - 1), input.endMonth]
      .filter((m): m is string => m !== undefined)
      .sort()[0]!;
    const recurrence = await tx.recurrence.create({
      data: { ...input, materializedUntil: until },
    });
    await materializeRange(tx, recurrence, input.startMonth, until);
    return recurrence;
  });
}

/**
 * Completa o horizonte rolante de todas as regras ativas da organização.
 * Idempotente: só gera meses depois de materializedUntil, então ocorrências
 * editadas "só esta" ou excluídas nunca voltam.
 */
export async function ensureHorizon(
  prisma: PrismaClient,
  organizationId: string,
  today: string = todaySP(),
) {
  const target = horizonEnd(today);
  const pending = await prisma.recurrence.findMany({
    where: {
      organizationId,
      canceledAt: null,
      OR: [{ materializedUntil: null }, { materializedUntil: { lt: target } }],
    },
  });

  for (const recurrence of pending) {
    const from =
      recurrence.materializedUntil === null
        ? recurrence.startMonth
        : addMonths(recurrence.materializedUntil, 1);
    const to = recurrence.endMonth !== null && recurrence.endMonth < target
      ? recurrence.endMonth
      : target;
    if (from > to) continue;
    await prisma.$transaction(async (tx) => {
      await materializeRange(tx, recurrence, from, to);
      await tx.recurrence.update({
        where: { id: recurrence.id },
        data: { materializedUntil: to },
      });
    });
  }
}

export interface RecurrenceChanges {
  description?: string;
  counterparty?: string;
  categoryId?: string;
  costCenterId?: string | null;
  amountCents?: number;
  dueDay?: number;
}

/**
 * Edição de série a partir de uma ocorrência (spec §5):
 * - only_this: desvincula a entry da regra e aplica as mudanças só nela.
 * - this_and_future: atualiza a regra e as ocorrências em aberto com
 *   competência >= a da base; pagas/parciais ficam intactas.
 */
export async function updateRecurrenceFromEntry(
  prisma: PrismaClient,
  input: { organizationId: string; entryId: string; scope: "only_this"; changes: RecurrenceChanges },
): Promise<EntryModel>;
export async function updateRecurrenceFromEntry(
  prisma: PrismaClient,
  input: { organizationId: string; entryId: string; scope: "this_and_future"; changes: RecurrenceChanges },
): Promise<RecurrenceModel>;
export async function updateRecurrenceFromEntry(
  prisma: PrismaClient,
  input: { organizationId: string; entryId: string; scope: "only_this" | "this_and_future"; changes: RecurrenceChanges },
): Promise<EntryModel | RecurrenceModel> {
  const { changes } = input;
  if (changes.amountCents !== undefined && changes.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  if (
    changes.dueDay !== undefined &&
    (!Number.isInteger(changes.dueDay) || changes.dueDay < 1 || changes.dueDay > 31)
  ) {
    throw new BusinessError("INVALID_DUE_DAY", "dueDay deve estar entre 1 e 31");
  }

  return prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, deletedAt: null },
      include: { settlements: true, recurrence: true },
    });
    if (!entry) throw new NotFoundError("ENTRY_NOT_FOUND", "Lançamento não encontrado");
    if (!entry.recurrence) {
      throw new BusinessError("ENTRY_NOT_RECURRENT", "Lançamento não pertence a uma recorrência");
    }
    if (changes.categoryId !== undefined) {
      await assertCategoryMatches(tx, entry.organizationId, changes.categoryId, entry.direction);
    }
    if (changes.costCenterId) {
      await assertCostCenterMatches(tx, entry.organizationId, changes.costCenterId);
    }

    const hasActive = activeSettlements(entry.settlements).length > 0;

    if (input.scope === "only_this") {
      if (hasActive && changes.amountCents !== undefined) {
        throw new BusinessError(
          "ENTRY_HAS_SETTLEMENTS",
          "Lançamento com baixa ativa: estorne antes de alterar o valor",
        );
      }
      return tx.entry.update({
        where: { id: entry.id },
        data: {
          recurrenceId: null,
          description: changes.description,
          counterparty: changes.counterparty,
          categoryId: changes.categoryId,
          costCenterId: changes.costCenterId,
          amountCents: changes.amountCents,
          dueDate:
            changes.dueDay !== undefined
              ? dueDateInMonth(entry.competenceMonth, changes.dueDay)
              : undefined,
        },
      });
    }

    // this_and_future
    const recurrence = await tx.recurrence.update({
      where: { id: entry.recurrence.id },
      data: {
        description: changes.description,
        counterparty: changes.counterparty,
        categoryId: changes.categoryId,
        costCenterId: changes.costCenterId,
        amountCents: changes.amountCents,
        dueDay: changes.dueDay,
      },
    });

    const futureEntries = await tx.entry.findMany({
      where: {
        recurrenceId: recurrence.id,
        deletedAt: null,
        competenceMonth: { gte: entry.competenceMonth },
      },
      include: { settlements: true },
    });
    for (const occurrence of futureEntries) {
      if (activeSettlements(occurrence.settlements).length > 0) continue; // pagas não mudam
      await tx.entry.update({
        where: { id: occurrence.id },
        data: {
          description: recurrence.description,
          counterparty: recurrence.counterparty,
          categoryId: recurrence.categoryId,
          costCenterId: recurrence.costCenterId,
          amountCents: recurrence.amountCents,
          dueDate: dueDateInMonth(occurrence.competenceMonth, recurrence.dueDay),
        },
      });
    }
    return recurrence;
  });
}

/** Cancela a regra e soft-deleta as ocorrências futuras em aberto. */
export async function cancelRecurrence(
  prisma: PrismaClient,
  organizationId: string,
  recurrenceId: string,
  today: string = todaySP(),
) {
  return prisma.$transaction(async (tx) => {
    const recurrence = await tx.recurrence.findFirst({ where: { id: recurrenceId, organizationId } });
    if (!recurrence) {
      throw new NotFoundError("RECURRENCE_NOT_FOUND", "Recorrência não encontrada");
    }
    if (recurrence.canceledAt) {
      throw new BusinessError("RECURRENCE_ALREADY_CANCELED", "Recorrência já cancelada");
    }

    const occurrences = await tx.entry.findMany({
      where: { recurrenceId, deletedAt: null, dueDate: { gte: new Date(`${today}T00:00:00.000Z`) } },
      include: { settlements: true },
    });
    for (const occurrence of occurrences) {
      if (activeSettlements(occurrence.settlements).length > 0) continue; // pagas permanecem
      await tx.entry.update({ where: { id: occurrence.id }, data: { deletedAt: new Date() } });
    }
    return tx.recurrence.update({
      where: { id: recurrenceId },
      data: { canceledAt: new Date() },
    });
  });
}
