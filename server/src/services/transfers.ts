// Transferência entre contas (spec §5): Transfer + exatamente 2 Movements na
// mesma transação; não aparece como despesa/receita em relatórios.
import { BusinessError, NotFoundError } from "../lib/errors";
import type { PrismaClient } from "../generated/prisma/client";

export interface CreateTransferInput {
  organizationId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  date: Date;
  userId: string;
  notes?: string;
}

export async function createTransfer(prisma: PrismaClient, input: CreateTransferInput) {
  if (input.amountCents <= 0) {
    throw new BusinessError("AMOUNT_MUST_BE_POSITIVE", "Valor deve ser maior que zero");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new BusinessError("TRANSFER_SAME_ACCOUNT", "Contas de origem e destino devem ser diferentes");
  }

  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.bankAccount.findFirst({ where: { id: input.fromAccountId, organizationId: input.organizationId } }),
      tx.bankAccount.findFirst({ where: { id: input.toAccountId, organizationId: input.organizationId } }),
    ]);
    if (!from || !to) {
      throw new NotFoundError("BANK_ACCOUNT_NOT_FOUND", "Conta bancária não encontrada");
    }
    if (from.archivedAt || to.archivedAt) {
      throw new BusinessError("BANK_ACCOUNT_ARCHIVED", "Conta bancária arquivada não transfere");
    }

    const transfer = await tx.transfer.create({
      data: {
        organizationId: input.organizationId,
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: input.amountCents,
        date: input.date,
        userId: input.userId,
        notes: input.notes,
      },
    });
    await tx.movement.create({
      data: {
        organizationId: input.organizationId,
        bankAccountId: from.id,
        amountCents: -input.amountCents,
        type: "TRANSFER_OUT",
        transferId: transfer.id,
        userId: input.userId,
        description: `Transferência para ${to.name}`,
      },
    });
    await tx.movement.create({
      data: {
        organizationId: input.organizationId,
        bankAccountId: to.id,
        amountCents: input.amountCents,
        type: "TRANSFER_IN",
        transferId: transfer.id,
        userId: input.userId,
        description: `Transferência de ${from.name}`,
      },
    });
    return transfer;
  });
}
