import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { getAccountBalanceCents } from "../src/services/bank-accounts";
import { createTransfer } from "../src/services/transfers";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

describe("createTransfer", () => {
  it("gera exatamente 2 movements com soma zero e saldos espelhados", async () => {
    const fromBefore = await getAccountBalanceCents(db.prisma, fx.org.id, fx.account.id);
    const toBefore = await getAccountBalanceCents(db.prisma, fx.org.id, fx.account2.id);

    const transfer = await createTransfer(db.prisma, {
      organizationId: fx.org.id,
      fromAccountId: fx.account.id,
      toAccountId: fx.account2.id,
      amountCents: 30_000,
      date: toDate("2026-06-10"),
      userId: fx.user.id,
    });

    const movements = await db.prisma.movement.findMany({ where: { transferId: transfer.id } });
    expect(movements).toHaveLength(2);
    expect(movements.reduce((s, m) => s + m.amountCents, 0)).toBe(0);
    expect(movements.map((m) => m.type).sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);

    expect(await getAccountBalanceCents(db.prisma, fx.org.id, fx.account.id)).toBe(fromBefore - 30_000);
    expect(await getAccountBalanceCents(db.prisma, fx.org.id, fx.account2.id)).toBe(toBefore + 30_000);
  });

  it("mesma conta → TRANSFER_SAME_ACCOUNT", async () => {
    await expect(
      createTransfer(db.prisma, {
        organizationId: fx.org.id,
        fromAccountId: fx.account.id,
        toAccountId: fx.account.id,
        amountCents: 1_000,
        date: toDate("2026-06-10"),
        userId: fx.user.id,
      }),
    ).rejects.toMatchObject({ code: "TRANSFER_SAME_ACCOUNT" });
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
    await expect(
      createTransfer(db.prisma, {
        organizationId: fx.org.id,
        fromAccountId: fx.account.id,
        toAccountId: archived.id,
        amountCents: 1_000,
        date: toDate("2026-06-10"),
        userId: fx.user.id,
      }),
    ).rejects.toMatchObject({ code: "BANK_ACCOUNT_ARCHIVED" });
  });

  it("valor não positivo → AMOUNT_MUST_BE_POSITIVE", async () => {
    await expect(
      createTransfer(db.prisma, {
        organizationId: fx.org.id,
        fromAccountId: fx.account.id,
        toAccountId: fx.account2.id,
        amountCents: 0,
        date: toDate("2026-06-10"),
        userId: fx.user.id,
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_MUST_BE_POSITIVE" });
  });
});
