// Matching e confirmação de importação OFX (spec §5/§6).
import type { ImportConfirmRow } from "@fluxo/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { calendarDate, competenceOf, toDate } from "../lib/dates";
import { BusinessError, NotFoundError } from "../lib/errors";
import { createSingleEntry, deriveEntry } from "./entries";
import type { OfxTransaction } from "./ofx-parser";
import { settleEntry, settleEntryTx } from "./settlements";

export interface ImportCandidate {
  entryId: string;
  description: string;
  counterparty: string;
  dueDate: string;
  remainingCents: number;
}

export type ImportRowStatus = "duplicate" | "matched" | "ambiguous" | "unmatched";

export interface ImportPreviewRow extends OfxTransaction {
  status: ImportRowStatus;
  candidates: ImportCandidate[];
}

export interface PreviewImportParams {
  organizationId: string;
  bankAccountId: string;
  transactions: OfxTransaction[];
}

const MATCH_WINDOW_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateDiffDays(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_PER_DAY;
}

export async function previewImport(prisma: PrismaClient, params: PreviewImportParams): Promise<ImportPreviewRow[]> {
  const { organizationId, bankAccountId, transactions } = params;

  const entries = await prisma.entry.findMany({
    where: { organizationId, deletedAt: null },
    include: { settlements: true },
  });

  const existingFitids = new Set(
    (
      await prisma.settlement.findMany({
        where: { bankAccountId, importFitid: { in: transactions.map((t) => t.fitid) } },
        select: { importFitid: true },
      })
    ).map((s) => s.importFitid),
  );

  const rows: ImportPreviewRow[] = [];
  for (const txn of transactions) {
    if (existingFitids.has(txn.fitid)) {
      rows.push({ ...txn, status: "duplicate", candidates: [] });
      continue;
    }

    const direction = txn.amountCents < 0 ? "PAYABLE" : "RECEIVABLE";
    const absAmount = Math.abs(txn.amountCents);

    const candidates = entries
      .filter((entry) => entry.direction === direction)
      .map((entry) => ({ entry, derived: deriveEntry(entry) }))
      .filter(({ derived }) => derived.status !== "SETTLED" && derived.remainingCents === absAmount)
      .filter(({ entry }) => dateDiffDays(calendarDate(entry.dueDate), txn.date) <= MATCH_WINDOW_DAYS)
      .sort((a, b) => dateDiffDays(calendarDate(a.entry.dueDate), txn.date) - dateDiffDays(calendarDate(b.entry.dueDate), txn.date))
      .map(({ entry, derived }) => ({
        entryId: entry.id,
        description: entry.description,
        counterparty: entry.counterparty,
        dueDate: calendarDate(entry.dueDate),
        remainingCents: derived.remainingCents,
      }));

    const status: ImportRowStatus =
      candidates.length === 0 ? "unmatched" : candidates.length === 1 ? "matched" : "ambiguous";
    rows.push({ ...txn, status, candidates });
  }
  return rows;
}

export type ImportConfirmStatus = "settled" | "created" | "ignored" | "duplicate" | "error";

export interface ImportConfirmResult {
  fitid: string;
  status: ImportConfirmStatus;
  error?: { code: string; message: string };
}

export interface ConfirmImportRowParams {
  organizationId: string;
  bankAccountId: string;
  userId: string;
  row: ImportConfirmRow;
}

/** Erros de negócio (e P2002 de importFitid duplicado) virão como { status: "error" }. */
function asConfirmError(error: unknown): { code: string; message: string } | null {
  if (error instanceof BusinessError || error instanceof NotFoundError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { code: "IMPORT_FITID_ALREADY_USED", message: "Esta transação já foi importada para esta conta" };
  }
  return null;
}

/**
 * Confirma uma linha revisada do extrato (spec §6, passos 1-4): dedup por
 * `importFitid`, ignora, baixa lançamento existente, ou cria+baixa um novo.
 */
export async function confirmImportRow(prisma: PrismaClient, params: ConfirmImportRowParams): Promise<ImportConfirmResult> {
  const { organizationId, bankAccountId, userId, row } = params;

  const existing = await prisma.settlement.findFirst({
    where: { bankAccountId, importFitid: row.fitid },
  });
  if (existing) {
    return { fitid: row.fitid, status: "duplicate" };
  }

  if (row.action === "ignore") {
    return { fitid: row.fitid, status: "ignored" };
  }

  if (row.action === "settle") {
    try {
      await settleEntry(prisma, {
        organizationId,
        entryId: row.entryId,
        amountCents: Math.abs(row.amountCents),
        settledAt: toDate(row.date),
        bankAccountId,
        userId,
        importFitid: row.fitid,
      });
      return { fitid: row.fitid, status: "settled" };
    } catch (error) {
      const mapped = asConfirmError(error);
      if (mapped) return { fitid: row.fitid, status: "error", error: mapped };
      throw error;
    }
  }

  try {
    const dueDate = toDate(row.date);
    await prisma.$transaction(async (tx) => {
      const entry = await createSingleEntry(tx, {
        organizationId,
        direction: row.amountCents < 0 ? "PAYABLE" : "RECEIVABLE",
        description: row.newEntry.description,
        counterparty: row.newEntry.counterparty,
        categoryId: row.newEntry.categoryId,
        costCenterId: row.newEntry.costCenterId,
        amountCents: Math.abs(row.amountCents),
        competenceMonth: competenceOf(dueDate),
        dueDate,
      });
      await settleEntryTx(tx, {
        organizationId,
        entryId: entry.id,
        amountCents: Math.abs(row.amountCents),
        settledAt: dueDate,
        bankAccountId,
        userId,
        importFitid: row.fitid,
      });
    });
    return { fitid: row.fitid, status: "created" };
  } catch (error) {
    const mapped = asConfirmError(error);
    if (mapped) return { fitid: row.fitid, status: "error", error: mapped };
    throw error;
  }
}
