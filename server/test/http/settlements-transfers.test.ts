// Fluxo crítico via HTTP (spec §5/§6): criar → baixar → estornar, e transferências.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
});
afterAll(() => teardownHttpTest(ctx));

async function createPayable(amountCents: number, dueDate: string) {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/payables",
    cookies: ctx.cookies,
    payload: {
      kind: "single",
      description: "Conta a pagar",
      counterparty: "Fornecedor",
      categoryId: ctx.fx.expenseCat.id,
      amountCents,
      dueDate,
    },
  });
  return res.json().entry as { id: string };
}

describe("fluxo crítico: criar → baixar → estornar", () => {
  it("baixa total muda status para SETTLED e estorno volta para OPEN", async () => {
    const entry = await createPayable(10_000, "2031-04-25");

    const settleRes = await ctx.app.inject({
      method: "POST",
      url: `/entries/${entry.id}/settle`,
      cookies: ctx.cookies,
      payload: { amountCents: 10_000, settledAt: "2031-04-20", bankAccountId: ctx.fx.account.id },
    });
    expect(settleRes.statusCode).toBe(201);
    const settlement = settleRes.json();
    expect(settlement).toMatchObject({
      entryId: entry.id,
      amountCents: 10_000,
      settledAt: "2031-04-20",
      bankAccountId: ctx.fx.account.id,
      reversalOfId: null,
      reversedById: null,
    });

    const afterSettle = await ctx.app.inject({ method: "GET", url: `/entries/${entry.id}`, cookies: ctx.cookies });
    expect(afterSettle.json()).toMatchObject({ status: "SETTLED", settledCents: 10_000, remainingCents: 0 });
    expect(afterSettle.json().settlements).toHaveLength(1);

    const reverseRes = await ctx.app.inject({
      method: "POST",
      url: `/settlements/${settlement.id}/reverse`,
      cookies: ctx.cookies,
    });
    expect(reverseRes.statusCode).toBe(201);
    const reversal = reverseRes.json();
    expect(reversal).toMatchObject({ entryId: entry.id, amountCents: -10_000, reversalOfId: settlement.id });

    const afterReverse = await ctx.app.inject({ method: "GET", url: `/entries/${entry.id}`, cookies: ctx.cookies });
    expect(afterReverse.json()).toMatchObject({ status: "OPEN", settledCents: 0, remainingCents: 10_000 });
    expect(afterReverse.json().settlements).toHaveLength(2);

    // segunda reversão da mesma baixa: 422
    const doubleReverse = await ctx.app.inject({
      method: "POST",
      url: `/settlements/${settlement.id}/reverse`,
      cookies: ctx.cookies,
    });
    expect(doubleReverse.statusCode).toBe(422);
    expect(doubleReverse.json()).toEqual({ code: "SETTLEMENT_ALREADY_REVERSED", message: expect.any(String) });

    // reverter um estorno: 422
    const reverseReversal = await ctx.app.inject({
      method: "POST",
      url: `/settlements/${reversal.id}/reverse`,
      cookies: ctx.cookies,
    });
    expect(reverseReversal.statusCode).toBe(422);
    expect(reverseReversal.json()).toEqual({ code: "CANNOT_REVERSE_REVERSAL", message: expect.any(String) });
  });

  it("valor acima do restante: 422 AMOUNT_EXCEEDS_REMAINING", async () => {
    const entry = await createPayable(5_000, "2031-04-26");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/entries/${entry.id}/settle`,
      cookies: ctx.cookies,
      payload: { amountCents: 5_001, settledAt: "2031-04-20", bankAccountId: ctx.fx.account.id },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "AMOUNT_EXCEEDS_REMAINING", message: expect.any(String) });
  });

  it("amountCents <= 0: 400 (validação)", async () => {
    const entry = await createPayable(5_000, "2031-04-27");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/entries/${entry.id}/settle`,
      cookies: ctx.cookies,
      payload: { amountCents: 0, settledAt: "2031-04-20", bankAccountId: ctx.fx.account.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "amountCents", message: expect.any(String) });
  });

  it("entry inexistente: 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/entries/nao-existe/settle",
      cookies: ctx.cookies,
      payload: { amountCents: 100, settledAt: "2031-04-20", bankAccountId: ctx.fx.account.id },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });

  it("settlement inexistente em /reverse: 404 SETTLEMENT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/settlements/nao-existe/reverse",
      cookies: ctx.cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "SETTLEMENT_NOT_FOUND", message: expect.any(String) });
  });

  it("entry soft-deletada não recebe baixa (404)", async () => {
    const entry = await createPayable(3_000, "2031-11-01");

    await ctx.app.inject({ method: "DELETE", url: `/entries/${entry.id}`, cookies: ctx.cookies });

    const res = await ctx.app.inject({
      method: "POST",
      url: `/entries/${entry.id}/settle`,
      cookies: ctx.cookies,
      payload: { amountCents: 3_000, settledAt: "2031-11-01", bankAccountId: ctx.fx.account.id },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });
});

describe("POST /transfers", () => {
  it("transferência entre contas: 201 com data em YYYY-MM-DD", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/transfers",
      cookies: ctx.cookies,
      payload: {
        fromAccountId: ctx.fx.account.id,
        toAccountId: ctx.fx.account2.id,
        amountCents: 5_000,
        date: "2031-04-22",
        notes: "Reforço de caixa",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      fromAccountId: ctx.fx.account.id,
      toAccountId: ctx.fx.account2.id,
      amountCents: 5_000,
      date: "2031-04-22",
      notes: "Reforço de caixa",
    });
  });

  it("mesma conta de origem e destino: 422 TRANSFER_SAME_ACCOUNT", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/transfers",
      cookies: ctx.cookies,
      payload: {
        fromAccountId: ctx.fx.account.id,
        toAccountId: ctx.fx.account.id,
        amountCents: 1_000,
        date: "2031-04-22",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "TRANSFER_SAME_ACCOUNT", message: expect.any(String) });
  });

  it("amountCents <= 0: 400 (validação)", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/transfers",
      cookies: ctx.cookies,
      payload: {
        fromAccountId: ctx.fx.account.id,
        toAccountId: ctx.fx.account2.id,
        amountCents: 0,
        date: "2031-04-22",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "amountCents", message: expect.any(String) });
  });

  it("conta inexistente: 404 BANK_ACCOUNT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/transfers",
      cookies: ctx.cookies,
      payload: {
        fromAccountId: ctx.fx.account.id,
        toAccountId: "conta-inexistente",
        amountCents: 1_000,
        date: "2031-04-22",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "BANK_ACCOUNT_NOT_FOUND", message: expect.any(String) });
  });
});
