// Rotas de apoio via HTTP (spec §6): contas bancárias + extrato, categorias,
// painel e relatórios.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todaySP } from "../../src/lib/dates";
import { setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
});
afterAll(() => teardownHttpTest(ctx));

describe("bank-accounts", () => {
  it("GET /bank-accounts lista contas ativas com saldo derivado", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/bank-accounts", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    const accounts = res.json();
    expect(accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ctx.fx.account.id, balanceCents: 100_000 }),
        expect.objectContaining({ id: ctx.fx.account2.id, balanceCents: 50_000 }),
      ]),
    );
  });

  it("POST /bank-accounts cria conta", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/bank-accounts",
      cookies: ctx.cookies,
      payload: { name: "Conta Nova", initialBalanceCents: 20_000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: "Conta Nova", initialBalanceCents: 20_000, archivedAt: null });
  });

  it("PATCH /bank-accounts/:id renomeia e arquiva", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/bank-accounts",
      cookies: ctx.cookies,
      payload: { name: "Temporária", initialBalanceCents: 0 },
    });
    const id = created.json().id as string;

    const renamed = await ctx.app.inject({
      method: "PATCH",
      url: `/bank-accounts/${id}`,
      cookies: ctx.cookies,
      payload: { name: "Renomeada" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: "Renomeada" });

    const archived = await ctx.app.inject({
      method: "PATCH",
      url: `/bank-accounts/${id}`,
      cookies: ctx.cookies,
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archivedAt).not.toBeNull();

    const list = await ctx.app.inject({ method: "GET", url: "/bank-accounts", cookies: ctx.cookies });
    expect(list.json().map((a: { id: string }) => a.id)).not.toContain(id);
  });

  it("PATCH com corpo vazio: 400 (root)", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/bank-accounts/${ctx.fx.account.id}`,
      cookies: ctx.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "(root)", message: expect.any(String) });
  });

  it("PATCH em conta inexistente: 404 BANK_ACCOUNT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/bank-accounts/nao-existe",
      cookies: ctx.cookies,
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "BANK_ACCOUNT_NOT_FOUND", message: expect.any(String) });
  });

  describe("extrato", () => {
    it("GET /bank-accounts/:id/statement reflete uma baixa", async () => {
      const entryRes = await ctx.app.inject({
        method: "POST",
        url: "/payables",
        cookies: ctx.cookies,
        payload: {
          kind: "single",
          description: "Despesa para extrato",
          counterparty: "X",
          categoryId: ctx.fx.expenseCat.id,
          amountCents: 4_000,
          dueDate: "2031-04-15",
        },
      });
      const entry = entryRes.json().entry as { id: string };

      await ctx.app.inject({
        method: "POST",
        url: `/entries/${entry.id}/settle`,
        cookies: ctx.cookies,
        payload: { amountCents: 4_000, settledAt: "2031-04-20", bankAccountId: ctx.fx.account.id },
      });

      const full = await ctx.app.inject({
        method: "GET",
        url: `/bank-accounts/${ctx.fx.account.id}/statement`,
        cookies: ctx.cookies,
      });
      expect(full.statusCode).toBe(200);
      const fullBody = full.json();
      expect(fullBody.accountId).toBe(ctx.fx.account.id);
      expect(fullBody.openingBalanceCents).toBe(100_000);
      expect(fullBody.closingBalanceCents).toBe(96_000);
      expect(fullBody.lines).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "SETTLEMENT", amountCents: -4_000 })]),
      );

      const today = todaySP();
      const todayOnly = await ctx.app.inject({
        method: "GET",
        url: `/bank-accounts/${ctx.fx.account.id}/statement?from=${today}&to=${today}`,
        cookies: ctx.cookies,
      });
      expect(todayOnly.json().lines).toHaveLength(1);
      expect(todayOnly.json().openingBalanceCents).toBe(100_000);

      const farFuture = await ctx.app.inject({
        method: "GET",
        url: `/bank-accounts/${ctx.fx.account.id}/statement?from=2099-01-01&to=2099-01-02`,
        cookies: ctx.cookies,
      });
      expect(farFuture.json().lines).toHaveLength(0);
      expect(farFuture.json().openingBalanceCents).toBe(96_000);
      expect(farFuture.json().closingBalanceCents).toBe(96_000);
    });
  });
});

describe("categories", () => {
  it("GET /categories lista e filtra por kind", async () => {
    const all = await ctx.app.inject({ method: "GET", url: "/categories", cookies: ctx.cookies });
    expect(all.statusCode).toBe(200);
    expect(all.json().map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining([ctx.fx.expenseCat.id, ctx.fx.incomeCat.id]),
    );

    const expenses = await ctx.app.inject({ method: "GET", url: "/categories?kind=EXPENSE", cookies: ctx.cookies });
    expect(expenses.json().every((c: { kind: string }) => c.kind === "EXPENSE")).toBe(true);
    expect(expenses.json().map((c: { id: string }) => c.id)).toContain(ctx.fx.expenseCat.id);
  });

  it("POST /categories cria e PATCH renomeia/arquiva", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      cookies: ctx.cookies,
      payload: { name: "Categoria Nova", kind: "INCOME" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Categoria Nova", kind: "INCOME", archivedAt: null });
    const id = created.json().id as string;

    const renamed = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${id}`,
      cookies: ctx.cookies,
      payload: { name: "Categoria Renomeada" },
    });
    expect(renamed.json()).toMatchObject({ name: "Categoria Renomeada" });

    const archived = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${id}`,
      cookies: ctx.cookies,
      payload: { archived: true },
    });
    expect(archived.json().archivedAt).not.toBeNull();
  });

  it("PATCH com corpo vazio: 400 (root)", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${ctx.fx.expenseCat.id}`,
      cookies: ctx.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "(root)", message: expect.any(String) });
  });

  it("PATCH em categoria inexistente: 404 CATEGORY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/categories/nao-existe",
      cookies: ctx.cookies,
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "CATEGORY_NOT_FOUND", message: expect.any(String) });
  });
});

describe("GET /dashboard", () => {
  it("retorna o painel do mês informado", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/dashboard?month=2031-04", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.month).toBe("2031-04");
    expect(body).toMatchObject({
      accounts: expect.any(Array),
      totalBalanceCents: expect.any(Number),
      totals: { payable: expect.any(Object), receivable: expect.any(Object) },
      alerts: { overdue: expect.any(Array), dueToday: expect.any(Array), dueSoon: expect.any(Array) },
      projection: expect.any(Array),
    });
  });

  it("sem month: 400", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/dashboard", cookies: ctx.cookies });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "month", message: expect.any(String) });
  });

  it("month mal formado: 400", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/dashboard?month=2031-13", cookies: ctx.cookies });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "month", message: expect.any(String) });
  });
});

describe("GET /reports/*", () => {
  it("cash-flow: previsto reflete o lançamento do mês", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Para cash-flow",
        counterparty: "X",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 9_000,
        dueDate: "2036-03-10",
      },
    });

    const res = await ctx.app.inject({ method: "GET", url: "/reports/cash-flow?year=2036", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    const months = res.json() as Array<{ month: string; previsto: { payableCents: number } }>;
    expect(months).toHaveLength(12);
    expect(months.find((m) => m.month === "2036-03")?.previsto.payableCents).toBe(9_000);
  });

  it("cash-flow: year inválido → 400", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/reports/cash-flow?year=abc", cookies: ctx.cookies });
    expect(res.statusCode).toBe(400);
  });

  it("by-category: previsto reflete o lançamento do mês na categoria certa", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Para by-category",
        counterparty: "X",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 8_000,
        dueDate: "2035-06-10",
      },
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: "/reports/by-category?month=2035-06",
      cookies: ctx.cookies,
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ categoryId: string; previstoCents: number }>;
    expect(rows.find((r) => r.categoryId === ctx.fx.expenseCat.id)?.previstoCents).toBe(8_000);
  });

  it("projection: usa PROJECTION_MONTHS por padrão e aceita months explícito", async () => {
    const defaultRes = await ctx.app.inject({ method: "GET", url: "/reports/projection", cookies: ctx.cookies });
    expect(defaultRes.statusCode).toBe(200);
    const defaultBody = defaultRes.json() as Array<{ month: string }>;
    expect(defaultBody).toHaveLength(6);
    expect(defaultBody[0]?.month).toBe(todaySP().slice(0, 7));

    const customRes = await ctx.app.inject({
      method: "GET",
      url: "/reports/projection?months=3",
      cookies: ctx.cookies,
    });
    expect(customRes.json()).toHaveLength(3);
  });
});
