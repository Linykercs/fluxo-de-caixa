// Regras de edição/exclusão de Entry (spec §5): travas com baixa ativa.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { createSingleEntry, deleteEntry, updateEntry } from "../src/services/entries";
import { reverseSettlement, settleEntry } from "../src/services/settlements";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

function newEntry() {
  return createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Editável",
    counterparty: "Fornecedor",
    categoryId: fx.expenseCat.id,
    amountCents: 10_000,
    dueDate: toDate("2026-06-20"),
  });
}

function settle(entryId: string, amountCents = 10_000) {
  return settleEntry(db.prisma, {
    organizationId: fx.org.id,
    entryId,
    amountCents,
    settledAt: toDate("2026-06-10"),
    bankAccountId: fx.account.id,
    userId: fx.user.id,
  });
}

describe("updateEntry", () => {
  it("sem baixas: todos os campos editáveis", async () => {
    const entry = await newEntry();
    const updated = await updateEntry(db.prisma, fx.org.id, entry.id, {
      description: "Novo nome",
      amountCents: 25_000,
      dueDate: toDate("2026-07-01"),
      competenceMonth: "2026-07",
    });
    expect(updated.amountCents).toBe(25_000);
    expect(updated.competenceMonth).toBe("2026-07");
  });

  it("com baixa ativa (mesmo parcial): valor e datas travados, rótulos liberados", async () => {
    const entry = await newEntry();
    await settle(entry.id, 4_000);

    await expect(
      updateEntry(db.prisma, fx.org.id, entry.id, { amountCents: 20_000 }),
    ).rejects.toMatchObject({ code: "ENTRY_HAS_SETTLEMENTS" });
    await expect(
      updateEntry(db.prisma, fx.org.id, entry.id, { dueDate: toDate("2026-07-01") }),
    ).rejects.toMatchObject({ code: "ENTRY_HAS_SETTLEMENTS" });
    await expect(
      updateEntry(db.prisma, fx.org.id, entry.id, { competenceMonth: "2026-07" }),
    ).rejects.toMatchObject({ code: "ENTRY_HAS_SETTLEMENTS" });

    const updated = await updateEntry(db.prisma, fx.org.id, entry.id, {
      description: "Rótulo novo",
      counterparty: "Outro fornecedor",
      notes: "obs",
    });
    expect(updated.description).toBe("Rótulo novo");
  });

  it("após estorno da única baixa, valor volta a ser editável", async () => {
    const entry = await newEntry();
    const settlement = await settle(entry.id);
    await reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: settlement.id, userId: fx.user.id });
    const updated = await updateEntry(db.prisma, fx.org.id, entry.id, { amountCents: 30_000 });
    expect(updated.amountCents).toBe(30_000);
  });

  it("categoria com kind incompatível → CATEGORY_KIND_MISMATCH", async () => {
    const entry = await newEntry();
    await expect(
      updateEntry(db.prisma, fx.org.id, entry.id, { categoryId: fx.incomeCat.id }),
    ).rejects.toMatchObject({ code: "CATEGORY_KIND_MISMATCH" });
  });
});

describe("deleteEntry", () => {
  it("sem baixas: soft delete (some das listagens, fica no banco)", async () => {
    const entry = await newEntry();
    await deleteEntry(db.prisma, fx.org.id, entry.id);
    const raw = await db.prisma.entry.findUnique({ where: { id: entry.id } });
    expect(raw?.deletedAt).not.toBeNull();
    await expect(updateEntry(db.prisma, fx.org.id, entry.id, { description: "x" })).rejects.toMatchObject({
      code: "ENTRY_NOT_FOUND",
    });
  });

  it("com baixa ativa: bloqueado", async () => {
    const entry = await newEntry();
    await settle(entry.id, 1_000);
    await expect(deleteEntry(db.prisma, fx.org.id, entry.id)).rejects.toMatchObject({
      code: "ENTRY_HAS_SETTLEMENTS",
    });
  });

  it("com baixa estornada: permitido", async () => {
    const entry = await newEntry();
    const settlement = await settle(entry.id);
    await reverseSettlement(db.prisma, { organizationId: fx.org.id, settlementId: settlement.id, userId: fx.user.id });
    const deleted = await deleteEntry(db.prisma, fx.org.id, entry.id);
    expect(deleted.deletedAt).not.toBeNull();
  });
});

describe("costCenterId em Entry", () => {
  it("criação aceita costCenterId, omitido e null", async () => {
    const costCenter = await db.prisma.costCenter.create({
      data: { organizationId: fx.org.id, name: "Obra Y" },
    });

    const withCostCenter = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Com centro de custo",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      costCenterId: costCenter.id,
      amountCents: 5_000,
      dueDate: toDate("2026-06-20"),
    });
    expect(withCostCenter.costCenterId).toBe(costCenter.id);

    const withoutCostCenter = await createSingleEntry(db.prisma, {
      organizationId: fx.org.id,
      direction: "PAYABLE",
      description: "Sem centro de custo",
      counterparty: "Fornecedor",
      categoryId: fx.expenseCat.id,
      amountCents: 5_000,
      dueDate: toDate("2026-06-20"),
    });
    expect(withoutCostCenter.costCenterId).toBeNull();
  });

  it("atualização define e limpa costCenterId", async () => {
    const costCenter = await db.prisma.costCenter.create({
      data: { organizationId: fx.org.id, name: "Obra Z" },
    });
    const entry = await newEntry();
    expect(entry.costCenterId).toBeNull();

    const updated = await updateEntry(db.prisma, fx.org.id, entry.id, { costCenterId: costCenter.id });
    expect(updated.costCenterId).toBe(costCenter.id);

    const cleared = await updateEntry(db.prisma, fx.org.id, entry.id, { costCenterId: null });
    expect(cleared.costCenterId).toBeNull();
  });
});
