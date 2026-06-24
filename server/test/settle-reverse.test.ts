// Baixa, estorno e saldo derivado contra banco real (SQLite temporário).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { getAccountBalanceCents } from "../src/services/bank-accounts";
import { createSingleEntry, deriveEntry, getEntryOrThrow } from "../src/services/entries";
import { reverseSettlement, settleEntry } from "../src/services/settlements";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

function newPayable(amountCents: number) {
  return createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Conta de teste",
    counterparty: "Fornecedor",
    categoryId: fx.expenseCat.id,
    amountCents,
    dueDate: toDate("2026-06-20"),
  });
}

async function statusOf(entryId: string) {
  return deriveEntry(await getEntryOrThrow(db.prisma, fx.org.id, entryId));
}

describe("settleEntry", () => {
  it("baixa total: settlement + movement negativo (PAYABLE) e status SETTLED", async () => {
    const entry = await newPayable(10_000);
    const settlement = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 10_000,
      settledAt: toDate("2026-06-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });

    const movement = await db.prisma.movement.findFirst({
      where: { settlementId: settlement.id },
    });
    expect(movement?.amountCents).toBe(-10_000);
    expect(movement?.type).toBe("SETTLEMENT");
    expect((await statusOf(entry.id)).status).toBe("SETTLED");
  });

  it("RECEIVABLE gera movement positivo", async () => {
    const entry = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "RECEIVABLE",
      description: "Recebível de teste",
      counterparty: "Cliente",
      categoryId: fx.incomeCat.id,
      amountCents: 5_000,
      dueDate: toDate("2026-06-20"),
    });
    const settlement = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 5_000,
      settledAt: toDate("2026-06-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });
    const movement = await db.prisma.movement.findFirst({
      where: { settlementId: settlement.id },
    });
    expect(movement?.amountCents).toBe(5_000);
  });

  it("baixas parciais acumulam até SETTLED e bloqueiam nova baixa", async () => {
    const entry = await newPayable(10_000);
    const settleArgs = {
      organizationId: fx.org.id,
      entryId: entry.id,
      settledAt: toDate("2026-06-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    };
    await settleEntry(db.prisma, { ...settleArgs, amountCents: 4_000 });
    expect(await statusOf(entry.id)).toMatchObject({ remainingCents: 6_000, status: "OPEN" });

    await settleEntry(db.prisma, { ...settleArgs, amountCents: 6_000 });
    expect((await statusOf(entry.id)).status).toBe("SETTLED");

    await expect(settleEntry(db.prisma, { ...settleArgs, amountCents: 1 })).rejects.toMatchObject({
      code: "ENTRY_ALREADY_SETTLED",
    });
  });

  it("valor acima do restante → AMOUNT_EXCEEDS_REMAINING (e nada é gravado)", async () => {
    const entry = await newPayable(10_000);
    await expect(
      settleEntry(db.prisma, {
        organizationId: fx.org.id,
        entryId: entry.id,
        amountCents: 10_001,
        settledAt: toDate("2026-06-10"),
        bankAccountId: fx.account.id,
        userId: fx.user.id,
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_EXCEEDS_REMAINING" });
    expect(await db.prisma.settlement.count({ where: { entryId: entry.id } })).toBe(0);
  });

  it("valor não positivo → AMOUNT_MUST_BE_POSITIVE", async () => {
    const entry = await newPayable(10_000);
    await expect(
      settleEntry(db.prisma, {
        organizationId: fx.org.id,
        entryId: entry.id,
        amountCents: 0,
        settledAt: toDate("2026-06-10"),
        bankAccountId: fx.account.id,
        userId: fx.user.id,
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_MUST_BE_POSITIVE" });
  });

  it("conta arquivada → BANK_ACCOUNT_ARCHIVED", async () => {
    const archived = await db.prisma.bankAccount.create({
      data: {
        organizationId: fx.org.id,
        name: "Arquivada",
        initialBalanceCents: 0,
        archivedAt: new Date(),
      },
    });
    const entry = await newPayable(10_000);
    await expect(
      settleEntry(db.prisma, {
        organizationId: fx.org.id,
        entryId: entry.id,
        amountCents: 10_000,
        settledAt: toDate("2026-06-10"),
        bankAccountId: archived.id,
        userId: fx.user.id,
      }),
    ).rejects.toMatchObject({ code: "BANK_ACCOUNT_ARCHIVED" });
  });

  it("importFitid é gravado e dedup (bankAccountId, importFitid) rejeita reimportação", async () => {
    const entry = await newPayable(10_000);
    const settlement = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 10_000,
      settledAt: toDate("2026-06-10"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
      importFitid: "FIT-DEDUP-1",
    });
    expect(settlement.importFitid).toBe("FIT-DEDUP-1");

    const other = await newPayable(5_000);
    await expect(
      settleEntry(db.prisma, {
        organizationId: fx.org.id,
        entryId: other.id,
        amountCents: 5_000,
        settledAt: toDate("2026-06-10"),
        bankAccountId: fx.account.id,
        userId: fx.user.id,
        importFitid: "FIT-DEDUP-1",
      }),
    ).rejects.toMatchObject({ code: "IMPORT_FITID_ALREADY_USED" });
  });
});

describe("reverseSettlement", () => {
  it("estorno reabre a conta, restaura o saldo e bloqueia dupla reversão", async () => {
    const before = await getAccountBalanceCents(db.prisma, fx.org.id, fx.account2.id);
    const entry = await newPayable(20_000);
    const settlement = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 20_000,
      settledAt: toDate("2026-06-10"),
      bankAccountId: fx.account2.id,
      userId: fx.user.id,
    });
    expect(await getAccountBalanceCents(db.prisma, fx.org.id, fx.account2.id)).toBe(before - 20_000);

    const reversal = await reverseSettlement(db.prisma, {
      organizationId: fx.org.id,
      settlementId: settlement.id,
      userId: fx.user.id,
    });

    // saldo restaurado, conta reaberta, vínculos preenchidos dos dois lados
    expect(await getAccountBalanceCents(db.prisma, fx.org.id, fx.account2.id)).toBe(before);
    expect(await statusOf(entry.id)).toMatchObject({
      settledCents: 0,
      remainingCents: 20_000,
      status: "OPEN",
    });
    expect(reversal.reversalOfId).toBe(settlement.id);
    const original = await db.prisma.settlement.findUnique({ where: { id: settlement.id } });
    expect(original?.reversedById).toBe(reversal.id);

    // histórico preservado: nada foi apagado
    expect(await db.prisma.settlement.count({ where: { entryId: entry.id } })).toBe(2);

    await expect(
      reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: settlement.id, userId: fx.user.id }),
    ).rejects.toMatchObject({ code: "SETTLEMENT_ALREADY_REVERSED" });
    await expect(
      reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: reversal.id, userId: fx.user.id }),
    ).rejects.toMatchObject({ code: "CANNOT_REVERSE_REVERSAL" });
  });
});

describe("fluxo crítico integrado", () => {
  it("criar → baixar → saldo → estornar → saldo restaurado → rebaixar", async () => {
    const account = await db.prisma.bankAccount.create({
      data: { organizationId: fx.org.id, name: "Fluxo", initialBalanceCents: 500_000 },
    });
    const entry = await newPayable(120_000);

    const s1 = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 120_000,
      settledAt: toDate("2026-06-05"),
      bankAccountId: account.id,
      userId: fx.user.id,
    });
    expect(await getAccountBalanceCents(db.prisma, fx.org.id, account.id)).toBe(380_000);

    await reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: s1.id, userId: fx.user.id });
    expect(await getAccountBalanceCents(db.prisma, fx.org.id, account.id)).toBe(500_000);
    expect((await statusOf(entry.id)).status).toBe("OPEN");

    await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 120_000,
      settledAt: toDate("2026-06-06"),
      bankAccountId: account.id,
      userId: fx.user.id,
    });
    expect(await getAccountBalanceCents(db.prisma, fx.org.id, account.id)).toBe(380_000);
    expect((await statusOf(entry.id)).status).toBe("SETTLED");
  });
});
