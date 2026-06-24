import { describe, expect, it } from "vitest";
import type { Settlement } from "../src/generated/prisma/client";
import { toDate } from "../src/lib/dates";
import { deriveEntry } from "../src/services/entries";

let seq = 0;
function makeSettlement(partial: Partial<Settlement> & { amountCents: number }): Settlement {
  seq += 1;
  return {
    id: `s${seq}`,
    organizationId: "org",
    entryId: "e1",
    settledAt: toDate("2026-06-01"),
    bankAccountId: "acc",
    userId: "u1",
    notes: null,
    importFitid: null,
    reversalOfId: null,
    reversedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

const TODAY = "2026-06-12";

function derive(opts: { amountCents: number; due: string; settlements?: Settlement[] }) {
  return deriveEntry(
    { amountCents: opts.amountCents, dueDate: toDate(opts.due), settlements: opts.settlements ?? [] },
    TODAY,
  );
}

describe("deriveEntry", () => {
  it("sem baixas e dentro do prazo → OPEN com remaining total", () => {
    expect(derive({ amountCents: 1000, due: "2026-06-20" })).toEqual({
      settledCents: 0,
      remainingCents: 1000,
      status: "OPEN",
    });
  });

  it("sem baixas e vencida → OVERDUE", () => {
    expect(derive({ amountCents: 1000, due: "2026-06-11" }).status).toBe("OVERDUE");
  });

  it("vence hoje → OPEN, não OVERDUE", () => {
    expect(derive({ amountCents: 1000, due: "2026-06-12" }).status).toBe("OPEN");
  });

  it("baixa total → SETTLED mesmo com vencimento no passado", () => {
    const result = derive({
      amountCents: 1000,
      due: "2026-05-01",
      settlements: [makeSettlement({ amountCents: 1000 })],
    });
    expect(result).toEqual({ settledCents: 1000, remainingCents: 0, status: "SETTLED" });
  });

  it("baixa parcial mantém OPEN (ou OVERDUE se vencida) com o resto", () => {
    const partial = [makeSettlement({ amountCents: 400 })];
    expect(derive({ amountCents: 1000, due: "2026-06-20", settlements: partial })).toEqual({
      settledCents: 400,
      remainingCents: 600,
      status: "OPEN",
    });
    expect(
      derive({ amountCents: 1000, due: "2026-06-01", settlements: partial }).status,
    ).toBe("OVERDUE");
  });

  it("múltiplas parciais somam", () => {
    const result = derive({
      amountCents: 1000,
      due: "2026-06-20",
      settlements: [makeSettlement({ amountCents: 300 }), makeSettlement({ amountCents: 700 })],
    });
    expect(result.status).toBe("SETTLED");
  });

  it("settlement estornada e seu estorno não contam", () => {
    const original = makeSettlement({ amountCents: 1000, reversedById: "rev" });
    const reversal = makeSettlement({ amountCents: -1000, id: "rev", reversalOfId: original.id });
    const result = derive({
      amountCents: 1000,
      due: "2026-06-20",
      settlements: [original, reversal],
    });
    expect(result).toEqual({ settledCents: 0, remainingCents: 1000, status: "OPEN" });
  });
});
