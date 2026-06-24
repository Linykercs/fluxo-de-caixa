// Baixa e estorno (spec §5). Ambos em transação atômica: Settlement + Movement
// nascem juntos ou nada acontece. Histórico nunca é apagado — estorno cria
// registros compensatórios.
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { BusinessError, NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";
import { deriveEntry, getEntryOrThrow } from "./entries";

export interface SettleEntryInput {
  organizationId: string;
  entryId: string;
  amountCents: number;
  settledAt: Date;
  bankAccountId: string;
  userId: string;
  notes?: string;
  /** FITID da transação OFX que originou esta baixa (importação de extrato). */
  importFitid?: string;
}

/** Sinal do movimento bancário: pagar sai (-), receber entra (+). */
function movementSign(direction: string): 1 | -1 {
  return direction === "PAYABLE" ? -1 : 1;
}

/**
 * Núcleo de `settleEntry`, parametrizado por `Db` para poder ser composto
 * dentro de outra transação (ex.: criar lançamento + baixar em `confirmImportRow`).
 */
export async function settleEntryTx(tx: Db, input: SettleEntryInput) {
  const entry = await getEntryOrThrow(tx, input.organizationId, input.entryId);
  const { remainingCents } = deriveEntry(entry);
  if (remainingCents === 0) {
    throw new BusinessError("ENTRY_ALREADY_SETTLED", "Lançamento já está totalmente baixado");
  }
  if (input.amountCents > remainingCents) {
    throw new BusinessError(
      "AMOUNT_EXCEEDS_REMAINING",
      `Valor excede o restante em aberto (${remainingCents} centavos)`,
    );
  }

  const account = await tx.bankAccount.findFirst({
    where: { id: input.bankAccountId, organizationId: input.organizationId },
  });
  if (!account) {
    throw new NotFoundError("BANK_ACCOUNT_NOT_FOUND", "Conta bancária não encontrada");
  }
  if (account.archivedAt) {
    throw new BusinessError("BANK_ACCOUNT_ARCHIVED", "Conta bancária arquivada não recebe baixas");
  }

  const settlement = await tx.settlement.create({
    data: {
      organizationId: entry.organizationId,
      entryId: entry.id,
      amountCents: input.amountCents,
      settledAt: input.settledAt,
      bankAccountId: account.id,
      userId: input.userId,
      notes: input.notes,
      importFitid: input.importFitid,
    },
  });
  await tx.movement.create({
    data: {
      organizationId: entry.organizationId,
      bankAccountId: account.id,
      amountCents: movementSign(entry.direction) * input.amountCents,
      type: "SETTLEMENT",
      settlementId: settlement.id,
      userId: input.userId,
      description: `Baixa: ${entry.description}`,
    },
  });
  return settlement;
}

export async function settleEntry(prisma: PrismaClient, input: SettleEntryInput) {
  if (input.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor da baixa deve ser maior que zero");
  }

  try {
    return await prisma.$transaction((tx) => settleEntryTx(tx, input));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BusinessError("IMPORT_FITID_ALREADY_USED", "Esta transação já foi importada para esta conta");
    }
    throw error;
  }
}

export interface ReverseSettlementInput {
  organizationId: string;
  settlementId: string;
  userId: string;
}

export async function reverseSettlement(prisma: PrismaClient, input: ReverseSettlementInput) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.settlement.findFirst({
      where: { id: input.settlementId, organizationId: input.organizationId },
      include: { entry: true },
    });
    if (!original) {
      throw new NotFoundError("SETTLEMENT_NOT_FOUND", "Baixa não encontrada");
    }
    if (original.reversalOfId !== null) {
      throw new BusinessError("CANNOT_REVERSE_REVERSAL", "Um estorno não pode ser estornado");
    }
    if (original.reversedById !== null) {
      throw new BusinessError("SETTLEMENT_ALREADY_REVERSED", "Baixa já foi estornada");
    }

    const reversal = await tx.settlement.create({
      data: {
        organizationId: original.organizationId,
        entryId: original.entryId,
        amountCents: -original.amountCents,
        settledAt: original.settledAt,
        bankAccountId: original.bankAccountId,
        userId: input.userId,
        reversalOfId: original.id,
      },
    });
    await tx.settlement.update({
      where: { id: original.id },
      data: { reversedById: reversal.id },
    });
    await tx.movement.create({
      data: {
        organizationId: original.organizationId,
        bankAccountId: original.bankAccountId,
        amountCents: -movementSign(original.entry.direction) * original.amountCents,
        type: "REVERSAL",
        settlementId: reversal.id,
        userId: input.userId,
        description: `Estorno: ${original.entry.description}`,
      },
    });
    return reversal;
  });
}
