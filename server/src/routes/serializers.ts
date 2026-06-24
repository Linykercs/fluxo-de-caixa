// Serialização de Entry/Settlement para a API: datas-calendário como
// "YYYY-MM-DD" (compatível com <input type="date">) e derivados embutidos
// (settledCents, remainingCents, status — spec §4).
import type { Entry, Settlement } from "../generated/prisma/client";
import { calendarDate } from "../lib/dates";
import { deriveEntry } from "../services/entries";

export function serializeSettlement(settlement: Settlement) {
  return {
    id: settlement.id,
    entryId: settlement.entryId,
    amountCents: settlement.amountCents,
    settledAt: calendarDate(settlement.settledAt),
    bankAccountId: settlement.bankAccountId,
    userId: settlement.userId,
    notes: settlement.notes,
    reversalOfId: settlement.reversalOfId,
    reversedById: settlement.reversedById,
    createdAt: settlement.createdAt,
  };
}

type EntryWithSettlements = Entry & { settlements: Settlement[] };

export function serializeEntry(entry: EntryWithSettlements, today?: string) {
  const derived = deriveEntry(entry, today);
  return {
    id: entry.id,
    direction: entry.direction,
    description: entry.description,
    counterparty: entry.counterparty,
    notes: entry.notes,
    categoryId: entry.categoryId,
    costCenterId: entry.costCenterId,
    amountCents: entry.amountCents,
    competenceMonth: entry.competenceMonth,
    dueDate: calendarDate(entry.dueDate),
    recurrenceId: entry.recurrenceId,
    installmentGroupId: entry.installmentGroupId,
    installmentNumber: entry.installmentNumber,
    installmentTotal: entry.installmentTotal,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...derived,
  };
}

export function serializeEntryDetail(entry: EntryWithSettlements, today?: string) {
  return {
    ...serializeEntry(entry, today),
    settlements: entry.settlements.map(serializeSettlement),
  };
}
