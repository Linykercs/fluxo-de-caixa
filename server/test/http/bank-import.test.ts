// Importação de extrato OFX via HTTP (spec §6): preview (sem persistir) + confirm linha a linha.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDate } from "../../src/lib/dates";
import { createSingleEntry } from "../../src/services/entries";
import type { Entry } from "../../src/generated/prisma/client";
import { setupHttpTest, teardownHttpTest } from "./helpers";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/itau-extrato.ofx",
);
const ofxContent = readFileSync(fixturePath);

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;
let matchedEntry: Entry;

beforeAll(async () => {
  ctx = await setupHttpTest();
  const { db, fx } = ctx;

  // 202606050001: PAYABLE -45000, 2026-06-05 -> 1 candidato (matched)
  matchedEntry = await createSingleEntry(db.prisma, {
    organizationId: fx.org.id,
    direction: "PAYABLE",
    description: "Conta a pagar combinando",
    counterparty: "Fornecedor ABC",
    categoryId: fx.expenseCat.id,
    amountCents: 45_000,
    dueDate: toDate("2026-06-07"),
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

  // 202606080001: já conciliado nesta conta -> duplicate
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
afterAll(() => teardownHttpTest(ctx));

function uploadOfx() {
  const formData = new FormData();
  formData.set("file", new File([ofxContent], "itau-extrato.ofx", { type: "application/x-ofx" }));
  return ctx.app.inject({
    method: "POST",
    url: `/bank-accounts/${ctx.fx.account.id}/import/preview`,
    cookies: ctx.cookies,
    payload: formData,
  });
}

describe("POST /bank-accounts/:id/import/preview", () => {
  it("classifica as 4 transações do extrato conforme o matching", async () => {
    const res = await uploadOfx();
    expect(res.statusCode).toBe(200);

    const byFitid = new Map((res.json() as Array<{ fitid: string; status: string }>).map((r) => [r.fitid, r]));
    expect(byFitid.get("202606050001")?.status).toBe("matched");
    expect(byFitid.get("202606060001")?.status).toBe("ambiguous");
    expect(byFitid.get("202606080001")?.status).toBe("duplicate");
    expect(byFitid.get("202606100001")?.status).toBe("unmatched");
  });

  it("sem sessão: 401", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${ctx.fx.account.id}/import/preview`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /bank-accounts/:id/import/confirm", () => {
  it("settle baixa o lançamento certo, create cria Entry+Settlement, ignore não grava nada", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${ctx.fx.account.id}/import/confirm`,
      cookies: ctx.cookies,
      payload: [
        {
          fitid: "202606050001",
          date: "2026-06-05",
          amountCents: -45_000,
          description: "PAGAMENTO FORNECEDOR ABC",
          action: "settle",
          entryId: matchedEntry.id,
        },
        {
          fitid: "202606060001",
          date: "2026-06-06",
          amountCents: 120_000,
          description: "RECEBIMENTO CLIENTE XYZ",
          action: "create",
          newEntry: {
            description: "Recebimento avulso",
            counterparty: "Cliente XYZ",
            categoryId: ctx.fx.incomeCat.id,
          },
        },
        {
          fitid: "202606080001",
          date: "2026-06-08",
          amountCents: -30_000,
          description: "TARIFA BANCARIA",
          action: "ignore",
        },
        {
          fitid: "202606100001",
          date: "2026-06-10",
          amountCents: -80_000,
          description: "PAGAMENTO ALUGUEL",
          action: "ignore",
        },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { fitid: "202606050001", status: "settled" },
      { fitid: "202606060001", status: "created" },
      { fitid: "202606080001", status: "duplicate" },
      { fitid: "202606100001", status: "ignored" },
    ]);

    // settle: lançamento combinado vira SETTLED
    const afterSettle = await ctx.app.inject({
      method: "GET",
      url: `/entries/${matchedEntry.id}`,
      cookies: ctx.cookies,
    });
    expect(afterSettle.json()).toMatchObject({ status: "SETTLED", remainingCents: 0 });

    // create: novo Entry + Settlement com importFitid
    const created = await ctx.db.prisma.entry.findFirst({
      where: { organizationId: ctx.fx.org.id, description: "Recebimento avulso" },
      include: { settlements: true },
    });
    expect(created).toMatchObject({ direction: "RECEIVABLE", amountCents: 120_000, competenceMonth: "2026-06" });
    expect(created?.settlements).toHaveLength(1);
    expect(created?.settlements[0]).toMatchObject({
      amountCents: 120_000,
      bankAccountId: ctx.fx.account.id,
      importFitid: "202606060001",
    });

    // ignore: nenhuma baixa gravada para 202606100001
    const ignoredSettlement = await ctx.db.prisma.settlement.findFirst({
      where: { bankAccountId: ctx.fx.account.id, importFitid: "202606100001" },
    });
    expect(ignoredSettlement).toBeNull();
  });

  it("reenviar confirm para linhas já bem-sucedidas retorna duplicate (idempotente)", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${ctx.fx.account.id}/import/confirm`,
      cookies: ctx.cookies,
      payload: [
        {
          fitid: "202606050001",
          date: "2026-06-05",
          amountCents: -45_000,
          description: "PAGAMENTO FORNECEDOR ABC",
          action: "settle",
          entryId: matchedEntry.id,
        },
        {
          fitid: "202606060001",
          date: "2026-06-06",
          amountCents: 120_000,
          description: "RECEBIMENTO CLIENTE XYZ",
          action: "create",
          newEntry: {
            description: "Recebimento avulso (reenvio)",
            counterparty: "Cliente XYZ",
            categoryId: ctx.fx.incomeCat.id,
          },
        },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { fitid: "202606050001", status: "duplicate" },
      { fitid: "202606060001", status: "duplicate" },
    ]);

    // nada novo foi criado no reenvio
    const reenvio = await ctx.db.prisma.entry.findFirst({
      where: { organizationId: ctx.fx.org.id, description: "Recebimento avulso (reenvio)" },
    });
    expect(reenvio).toBeNull();
  });

  it("linha create com mês de competência fechado retorna PERIOD_CLOSED sem afetar as demais linhas", async () => {
    await ctx.db.prisma.organization.update({
      where: { id: ctx.fx.org.id },
      data: { closedThroughMonth: "2026-06" },
    });

    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${ctx.fx.account.id}/import/confirm`,
      cookies: ctx.cookies,
      payload: [
        {
          fitid: "FAKE-PERIOD-CLOSED-1",
          date: "2026-06-12",
          amountCents: -5_000,
          description: "Despesa fora de época",
          action: "create",
          newEntry: {
            description: "Despesa atrasada",
            counterparty: "Fornecedor",
            categoryId: ctx.fx.expenseCat.id,
          },
        },
        {
          fitid: "FAKE-PERIOD-CLOSED-2",
          date: "2026-06-12",
          amountCents: -1_000,
          description: "Outra transação",
          action: "ignore",
        },
      ],
    });

    expect(res.statusCode).toBe(200);
    const results = res.json() as Array<{ fitid: string; status: string; error?: { code: string } }>;
    expect(results[0]).toMatchObject({
      fitid: "FAKE-PERIOD-CLOSED-1",
      status: "error",
      error: { code: "PERIOD_CLOSED" },
    });
    expect(results[1]).toEqual({ fitid: "FAKE-PERIOD-CLOSED-2", status: "ignored" });

    // nada foi criado para a linha com erro
    const notCreated = await ctx.db.prisma.entry.findFirst({
      where: { organizationId: ctx.fx.org.id, description: "Despesa atrasada" },
    });
    expect(notCreated).toBeNull();
  });

  it("sem sessão: 401", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${ctx.fx.account.id}/import/confirm`,
      payload: [],
    });
    expect(res.statusCode).toBe(401);
  });
});
