// Matching de importação OFX (spec §5) contra banco real (SQLite temporário).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../src/lib/dates";
import { previewImport } from "../src/services/bank-import";
import { createSingleEntry } from "../src/services/entries";
import { parseOfx } from "../src/services/ofx-parser";
import { createTestDb, makeFixture } from "./helpers/db";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/itau-extrato.ofx",
);

let db: Awaited<ReturnType<typeof createTestDb>>;
let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  db = await createTestDb();
  fx = await makeFixture(db.prisma);

  // 202606050001: PAYABLE -45000, 2026-06-05 -> 1 candidato (matched)
  await createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Conta a pagar combinando",
    counterparty: "Fornecedor ABC",
    categoryId: fx.expenseCat.id,
    amountCents: 45_000,
    dueDate: toDate("2026-06-07"), // 2 dias de diferença, dentro da janela
  });

  // 202606060001: RECEIVABLE +120000, 2026-06-06 -> 2 candidatos (ambiguous)
  await createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "RECEIVABLE",
    description: "Recebível 1",
    counterparty: "Cliente XYZ",
    categoryId: fx.incomeCat.id,
    amountCents: 120_000,
    dueDate: toDate("2026-06-04"),
  });
  await createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "RECEIVABLE",
    description: "Recebível 2",
    counterparty: "Cliente XYZ",
    categoryId: fx.incomeCat.id,
    amountCents: 120_000,
    dueDate: toDate("2026-06-09"),
  });

  // 202606080001: marcado como já importado nesta conta -> duplicate
  const dummy = await createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Lançamento já conciliado",
    counterparty: "Banco",
    categoryId: fx.expenseCat.id,
    amountCents: 1_000,
    dueDate: toDate("2026-06-01"),
  });
  await db.prisma.settlement.create({
    data: {
      organizationId: fx.org.id,
      entryId: dummy.id,
      amountCents: 1_000,
      settledAt: toDate("2026-06-01"),
      bankAccountId: fx.account.id,
      userId: fx.user.id,
      importFitid: "202606080001",
    },
  });

  // 202606100001: PAYABLE -80000, sem lançamento correspondente -> unmatched
});
afterAll(() => db.cleanup());

describe("previewImport", () => {
  it("classifica cada transação do extrato conforme o matching", async () => {
    const content = readFileSync(fixturePath, "utf8");
    const transactions = parseOfx(content);

    const rows = await previewImport(db.prisma, {
      organizationId: fx.org.id,
      bankAccountId: fx.account.id,
      transactions,
    });
    const byFitid = new Map(rows.map((r) => [r.fitid, r]));

    const matched = byFitid.get("202606050001");
    expect(matched?.status).toBe("matched");
    expect(matched?.candidates).toHaveLength(1);
    expect(matched?.candidates[0]).toMatchObject({
      description: "Conta a pagar combinando",
      counterparty: "Fornecedor ABC",
      dueDate: "2026-06-07",
      remainingCents: 45_000,
    });

    const ambiguous = byFitid.get("202606060001");
    expect(ambiguous?.status).toBe("ambiguous");
    expect(ambiguous?.candidates).toHaveLength(2);
    // ordenado por proximidade de data: 2026-06-04 (2 dias) antes de 2026-06-09 (3 dias)
    expect(ambiguous?.candidates[0]).toMatchObject({ description: "Recebível 1", dueDate: "2026-06-04" });
    expect(ambiguous?.candidates[1]).toMatchObject({ description: "Recebível 2", dueDate: "2026-06-09" });

    expect(byFitid.get("202606080001")).toMatchObject({ status: "duplicate", candidates: [] });

    expect(byFitid.get("202606100001")).toMatchObject({ status: "unmatched", candidates: [] });
  });
});
