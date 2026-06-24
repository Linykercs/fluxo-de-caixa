// Isolamento entre organizações (spec §3.3): operações por ID em registros de
// outra organização devem retornar 404, nunca expor ou alterar dados de
// terceiros. Org A é a organização autenticada (ctx); Org B é só seedada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeFullFixture } from "../helpers/db";
import { setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;
let orgB: Awaited<ReturnType<typeof makeFullFixture>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
  orgB = await makeFullFixture(ctx.db.prisma, "Org B");
});
afterAll(() => teardownHttpTest(ctx));

describe("Entries de outra organização", () => {
  it("GET /entries/:id → 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/entries/${orgB.openEntry.id}`,
      cookies: ctx.cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });

  it("PATCH /entries/:id → 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${orgB.openEntry.id}`,
      cookies: ctx.cookies,
      payload: { description: "Tentativa de acesso" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });

  it("DELETE /entries/:id → 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/entries/${orgB.openEntry.id}`,
      cookies: ctx.cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });

  it("PATCH /entries/:id/recurrence-scope → 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${orgB.recurrenceEntry.id}/recurrence-scope`,
      cookies: ctx.cookies,
      payload: { scope: "only_this", description: "Tentativa" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });
});

describe("Settlements, Transfers e Bank Accounts de outra organização", () => {
  it("POST /entries/:id/settle → 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/entries/${orgB.openEntry.id}/settle`,
      cookies: ctx.cookies,
      payload: { amountCents: 1_000, settledAt: "2026-06-15", bankAccountId: ctx.fx.account.id },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("ENTRY_NOT_FOUND");
  });

  it("POST /settlements/:id/reverse → 404 SETTLEMENT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/settlements/${orgB.settlement.id}/reverse`,
      cookies: ctx.cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("SETTLEMENT_NOT_FOUND");
  });

  it("POST /transfers com contas de outra organização → não cria transferência", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/transfers",
      cookies: ctx.cookies,
      payload: {
        fromAccountId: orgB.account.id,
        toAccountId: orgB.account2.id,
        amountCents: 1_000,
        date: "2026-06-15",
      },
    });
    expect(res.statusCode).not.toBe(201);
    const count = await ctx.db.prisma.transfer.count({ where: { fromAccountId: orgB.account.id } });
    expect(count).toBe(0);
  });

  it("PATCH /bank-accounts/:id de outra organização → 404 BANK_ACCOUNT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/bank-accounts/${orgB.account.id}`,
      cookies: ctx.cookies,
      payload: { name: "Tentativa de acesso" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("BANK_ACCOUNT_NOT_FOUND");
  });

  it("GET /bank-accounts/:id/statement de outra organização → 404 BANK_ACCOUNT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/bank-accounts/${orgB.account.id}/statement`,
      cookies: ctx.cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("BANK_ACCOUNT_NOT_FOUND");
  });
});

describe("Categories, Cost Centers e Bank Import de outra organização", () => {
  it("PATCH /categories/:id de outra organização → 404 CATEGORY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${orgB.expenseCat.id}`,
      cookies: ctx.cookies,
      payload: { name: "Tentativa de acesso" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("CATEGORY_NOT_FOUND");
  });

  it("PATCH /cost-centers/:id de outra organização → 404 COST_CENTER_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/cost-centers/${orgB.costCenter.id}`,
      cookies: ctx.cookies,
      payload: { name: "Tentativa de acesso" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("COST_CENTER_NOT_FOUND");
  });

  it("POST /bank-accounts/:id/import/preview de outra organização → 404 BANK_ACCOUNT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${orgB.account.id}/import/preview`,
      cookies: ctx.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("BANK_ACCOUNT_NOT_FOUND");
  });

  it("POST /bank-accounts/:id/import/confirm de outra organização → 404 BANK_ACCOUNT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/bank-accounts/${orgB.account.id}/import/confirm`,
      cookies: ctx.cookies,
      payload: [],
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("BANK_ACCOUNT_NOT_FOUND");
  });
});
