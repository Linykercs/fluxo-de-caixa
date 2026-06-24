// Fechamento de mês (spec §8/F6): com `organization.closedThroughMonth` não
// nulo, criar/editar uma Entry (ou Recurrence) com competência
// <= closedThroughMonth é rejeitado com BusinessError("PERIOD_CLOSED").
// Settlements, estornos e transfers não são afetados.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { createInstallments, createSingleEntry, updateEntry } from "../src/services/entries";
import { getClosedThroughMonth, setClosedThroughMonth } from "../src/services/organizations";
import { createRecurrence } from "../src/services/recurrences";
import { reverseSettlement, settleEntry } from "../src/services/settlements";
import { createTransfer } from "../src/services/transfers";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

function newPayable(competenceMonth: string, dueDate: string) {
  return createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Despesa",
    counterparty: "Fornecedor",
    categoryId: fx.expenseCat.id,
    amountCents: 10_000,
    competenceMonth,
    dueDate: toDate(dueDate),
  });
}

describe("closedThroughMonth === null (estado inicial)", () => {
  it("criação e edição funcionam em qualquer competência", async () => {
    const entry = await newPayable("2026-06", "2026-06-10");
    const updated = await updateEntry(db.prisma, fx.org.id, entry.id, { description: "Despesa editada" });
    expect(updated.description).toBe("Despesa editada");
  });
});

describe("mês fechado (closedThroughMonth = 2026-06)", () => {
  beforeAll(async () => {
    expect(await setClosedThroughMonth(db.prisma, fx.org.id, "2026-06")).toBe("2026-06");
  });

  it("createSingleEntry com competência <= closedThroughMonth → PERIOD_CLOSED", async () => {
    await expect(newPayable("2026-06", "2026-06-15")).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });

  it("createSingleEntry com competência > closedThroughMonth → ok", async () => {
    const entry = await newPayable("2026-07", "2026-07-10");
    expect(entry.competenceMonth).toBe("2026-07");
  });

  it("createInstallments com alguma parcela em mês fechado → PERIOD_CLOSED, nenhuma parcela criada", async () => {
    const before = await db.prisma.entry.count({ where: { organizationId: fx.org.id } });
    await expect(
      createInstallments(db.prisma, {
        organizationId: fx.org.id,
        direction: "PAYABLE",
        description: "Compra parcelada",
        counterparty: "Fornecedor",
        categoryId: fx.expenseCat.id,
        totalCents: 30_000,
        installmentTotal: 3,
        firstDueDate: toDate("2026-06-15"),
        firstCompetenceMonth: "2026-06",
      }),
    ).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
    const after = await db.prisma.entry.count({ where: { organizationId: fx.org.id } });
    expect(after).toBe(before);
  });

  it("createInstallments com todas as parcelas em meses abertos → ok", async () => {
    const entries = await createInstallments(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Compra parcelada",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      totalCents: 30_000,
      installmentTotal: 3,
      firstDueDate: toDate("2026-07-15"),
      firstCompetenceMonth: "2026-07",
    });
    expect(entries.map((e) => e.competenceMonth)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("updateEntry de lançamento com competência em mês fechado → PERIOD_CLOSED, mesmo sem alterar a competência", async () => {
    const entry = await db.prisma.entry.findFirstOrThrow({
      where: { organizationId: fx.org.id, competenceMonth: "2026-06" },
    });
    await expect(updateEntry(db.prisma, fx.org.id, entry.id, { description: "Tentativa" })).rejects.toMatchObject({
      code: "PERIOD_CLOSED",
    });
  });

  it("updateEntry movendo a competência para um mês fechado → PERIOD_CLOSED", async () => {
    const entry = await newPayable("2026-07", "2026-07-20");
    await expect(
      updateEntry(db.prisma, fx.org.id, entry.id, { competenceMonth: "2026-06", dueDate: toDate("2026-06-20") }),
    ).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });

  it("createRecurrence com startMonth <= closedThroughMonth → PERIOD_CLOSED", async () => {
    await expect(
      createRecurrence(db.prisma, {
        organizationId: fx.org.id,
        direction: "PAYABLE",
        description: "Assinatura",
        counterparty: "Fornecedor",
        categoryId: fx.expenseCat.id,
        amountCents: 1_000,
        dueDay: 5,
        startMonth: "2026-06",
      }),
    ).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });

  it("createRecurrence com startMonth > closedThroughMonth → ok", async () => {
    const recurrence = await createRecurrence(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Assinatura",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      amountCents: 1_000,
      dueDay: 5,
      startMonth: "2026-07",
    });
    expect(recurrence.startMonth).toBe("2026-07");
  });

  it("settlement e estorno em lançamento de mês fechado continuam funcionando", async () => {
    const entry = await db.prisma.entry.findFirstOrThrow({
      where: { organizationId: fx.org.id, competenceMonth: "2026-06", direction: "PAYABLE" },
    });
    const settlement = await settleEntry(db.prisma, {
      organizationId: fx.org.id,
      entryId: entry.id,
      amountCents: 10_000,
      settledAt: toDate("2026-07-01"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
    });
    await expect(
      reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: settlement.id, userId: fx.user.id }),
    ).resolves.toBeTruthy();
  });

  it("transfer entre contas continua funcionando", async () => {
    const transfer = await createTransfer(db.prisma, {
      organizationId: fx.org.id,
      fromAccountId: fx.account.id,
      toAccountId: fx.account2.id,
      amountCents: 1_000,
      date: toDate("2026-07-01"),
      userId: fx.user.id,
    });
    expect(transfer.fromAccountId).toBe(fx.account.id);
  });
});

describe("reabrir mês (cursor movido para um mês anterior)", () => {
  it("redefinir closedThroughMonth para um mês anterior reabre os meses entre os dois cursores", async () => {
    expect(await getClosedThroughMonth(db.prisma, fx.org.id)).toBe("2026-06");
    expect(await setClosedThroughMonth(db.prisma, fx.org.id, "2026-05")).toBe("2026-05");

    // 2026-06 estava fechado, agora reaberto.
    const entry = await newPayable("2026-06", "2026-06-25");
    expect(entry.competenceMonth).toBe("2026-06");

    // 2026-05 continua fechado.
    await expect(newPayable("2026-05", "2026-05-10")).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });
});
