import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseOfx } from "../src/services/ofx-parser";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/itau-extrato.ofx",
);

describe("parseOfx", () => {
  it("extrai fitid/data/valor/descrição de cada STMTTRN", () => {
    const content = readFileSync(fixturePath, "utf8");
    const transactions = parseOfx(content);

    expect(transactions).toEqual([
      { fitid: "202606050001", date: "2026-06-05", amountCents: -45_000, description: "PAGAMENTO FORNECEDOR ABC" },
      { fitid: "202606060001", date: "2026-06-06", amountCents: 120_000, description: "RECEBIMENTO CLIENTE XYZ" },
      { fitid: "202606080001", date: "2026-06-08", amountCents: -30_000, description: "TARIFA BANCARIA" },
      { fitid: "202606100001", date: "2026-06-10", amountCents: -80_000, description: "PAGAMENTO ALUGUEL" },
    ]);
  });
});
