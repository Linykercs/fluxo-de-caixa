import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarDate, toDate } from "../src/lib/dates";
import { createInstallments } from "../src/services/entries";
import { createTestDb, makeFixture } from "./helpers/db";

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);
});
afterAll(() => db.cleanup());

function input(totalCents: number, n: number, firstDue = "2026-04-15") {
  return {
    organizationId: fx.org.id,
    direction: "PAYABLE" as const,
    description: "Compra parcelada",
    counterparty: "Fornecedor",
    categoryId: fx.expenseCat.id,
    totalCents,
    installmentTotal: n,
    firstDueDate: toDate(firstDue),
    firstCompetenceMonth: firstDue.slice(0, 7),
  };
}

describe("createInstallments", () => {
  it("divide com resto na última: Σ parcelas = total exato", async () => {
    // 650000 / 6 = 108333,33… → 5× 108333 + 1× 108335
    const entries = await createInstallments(db.prisma, input(650_000, 6));
    expect(entries.map((e) => e.amountCents)).toEqual([
      108_333, 108_333, 108_333, 108_333, 108_333, 108_335,
    ]);
    expect(entries.reduce((s, e) => s + e.amountCents, 0)).toBe(650_000);
  });

  it("caso clássico de resto: 1000 em 3 → 333 + 333 + 334", async () => {
    const entries = await createInstallments(db.prisma, input(1_000, 3));
    expect(entries.map((e) => e.amountCents)).toEqual([333, 333, 334]);
  });

  it("vencimentos e competências mensais consecutivos, no mesmo grupo", async () => {
    const entries = await createInstallments(db.prisma, input(30_000, 3, "2026-04-15"));
    expect(entries.map((e) => calendarDate(e.dueDate))).toEqual([
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
    ]);
    expect(entries.map((e) => e.competenceMonth)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(entries.map((e) => e.installmentNumber)).toEqual([1, 2, 3]);
    expect(entries.every((e) => e.installmentTotal === 3)).toBe(true);
    expect(new Set(entries.map((e) => e.installmentGroupId)).size).toBe(1);
    expect(entries[0]!.installmentGroupId).not.toBeNull();
  });

  it("dia 31 faz clamp nos meses curtos sem 'grudar' no menor dia", async () => {
    const entries = await createInstallments(db.prisma, input(40_000, 4, "2026-01-31"));
    expect(entries.map((e) => calendarDate(e.dueDate))).toEqual([
      "2026-01-31",
      "2026-02-28", // fevereiro: clamp
      "2026-03-31", // março volta ao dia 31
      "2026-04-30",
    ]);
  });

  it("menos de 2 parcelas → INVALID_INSTALLMENT_COUNT", async () => {
    await expect(createInstallments(db.prisma, input(1_000, 1))).rejects.toMatchObject({
      code: "INVALID_INSTALLMENT_COUNT",
    });
  });

  it("total menor que 1 centavo por parcela → AMOUNT_TOO_SMALL", async () => {
    await expect(createInstallments(db.prisma, input(5, 6))).rejects.toMatchObject({
      code: "AMOUNT_TOO_SMALL",
    });
  });

  it("categoria de kind incompatível → CATEGORY_KIND_MISMATCH", async () => {
    await expect(
      createInstallments(db.prisma, { ...input(10_000, 2), categoryId: fx.incomeCat.id }),
    ).rejects.toMatchObject({ code: "CATEGORY_KIND_MISMATCH" });
  });
});
