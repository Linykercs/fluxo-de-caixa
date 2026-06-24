// Lançamentos via HTTP (spec §6): /payables, /receivables, /entries/:id e
// /entries/:id/recurrence-scope, incluindo filtros e formas de erro.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
});
afterAll(() => teardownHttpTest(ctx));

describe("POST /payables", () => {
  it("kind=single: 201 com derivados e dueDate em YYYY-MM-DD", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Conta de luz",
        counterparty: "Concessionária",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 12_000,
        dueDate: "2031-04-15",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.entry).toMatchObject({
      direction: "PAYABLE",
      description: "Conta de luz",
      dueDate: "2031-04-15",
      competenceMonth: "2031-04",
      amountCents: 12_000,
      settledCents: 0,
      remainingCents: 12_000,
      status: "OPEN",
    });
    expect(body.entry.settlements).toBeUndefined();
  });

  it("kind=installments: 201 com N entries somando o total", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "installments",
        description: "Equipamento parcelado",
        counterparty: "Fornecedor X",
        categoryId: ctx.fx.expenseCat.id,
        totalCents: 30_000,
        installmentTotal: 3,
        firstDueDate: "2031-05-10",
        firstCompetenceMonth: "2031-05",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.entries).toHaveLength(3);
    expect(body.entries.map((e: { amountCents: number }) => e.amountCents)).toEqual([10_000, 10_000, 10_000]);
    expect(body.entries.map((e: { competenceMonth: string }) => e.competenceMonth)).toEqual([
      "2031-05",
      "2031-06",
      "2031-07",
    ]);
    expect(body.entries[0].installmentTotal).toBe(3);
    expect(body.entries[0].installmentNumber).toBe(1);
  });

  it("kind=recurrence: 201, materializa ocorrências mensais", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "recurrence",
        description: "Aluguel",
        counterparty: "Locador",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 5_000,
        dueDay: 10,
        startMonth: "2032-01",
        endMonth: "2032-03",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().recurrence).toMatchObject({
      description: "Aluguel",
      dueDay: 10,
      startMonth: "2032-01",
      endMonth: "2032-03",
      materializedUntil: "2032-03",
    });

    const list = await ctx.app.inject({
      method: "GET",
      url: "/payables?month=2032-02",
      cookies: ctx.cookies,
    });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toMatchObject({ description: "Aluguel", dueDate: "2032-02-10" });
  });

  it("payload inválido (sem description): 400 com field", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        counterparty: "Concessionária",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 1_000,
        dueDate: "2031-04-15",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "description", message: expect.any(String) });
  });

  it("categoria de tipo incompatível: 422 CATEGORY_KIND_MISMATCH", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Errado",
        counterparty: "X",
        categoryId: ctx.fx.incomeCat.id,
        amountCents: 1_000,
        dueDate: "2031-04-15",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "CATEGORY_KIND_MISMATCH", message: expect.any(String) });
  });

  it("categoria inexistente: 404 CATEGORY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Errado",
        counterparty: "X",
        categoryId: "categoria-inexistente",
        amountCents: 1_000,
        dueDate: "2031-04-15",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "CATEGORY_NOT_FOUND", message: expect.any(String) });
  });
});

describe("GET /payables", () => {
  it("filtra por categoryId dentro do mês", async () => {
    const otherCategory = await ctx.db.prisma.category.create({
      data: { organizationId: ctx.fx.org.id, name: "Outra despesa", kind: "EXPENSE" },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Categoria A",
        counterparty: "X",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 1_000,
        dueDate: "2031-08-01",
        competenceMonth: "2031-08",
      },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Categoria B",
        counterparty: "X",
        categoryId: otherCategory.id,
        amountCents: 2_000,
        dueDate: "2031-08-02",
        competenceMonth: "2031-08",
      },
    });

    const all = await ctx.app.inject({ method: "GET", url: "/payables?month=2031-08", cookies: ctx.cookies });
    expect(all.json()).toHaveLength(2);

    const filtered = await ctx.app.inject({
      method: "GET",
      url: `/payables?month=2031-08&categoryId=${otherCategory.id}`,
      cookies: ctx.cookies,
    });
    expect(filtered.json()).toHaveLength(1);
    expect(filtered.json()[0]).toMatchObject({ description: "Categoria B" });
  });

  it("query inválida (mês mal formado): 400", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/payables?month=2031-13", cookies: ctx.cookies });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "month", message: expect.any(String) });
  });
});

describe("GET/PATCH/DELETE /entries/:id", () => {
  async function createEntry() {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/receivables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Venda",
        counterparty: "Cliente Y",
        categoryId: ctx.fx.incomeCat.id,
        amountCents: 7_000,
        dueDate: "2031-09-10",
      },
    });
    return res.json().entry as { id: string };
  }

  it("GET retorna detalhe com settlements", async () => {
    const entry = await createEntry();
    const res = await ctx.app.inject({ method: "GET", url: `/entries/${entry.id}`, cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: entry.id, description: "Venda", settlements: [] });
  });

  it("GET de id inexistente: 404 ENTRY_NOT_FOUND", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/entries/nao-existe", cookies: ctx.cookies });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_FOUND", message: expect.any(String) });
  });

  it("PATCH atualiza campos e DELETE remove (soft delete)", async () => {
    const entry = await createEntry();

    const patchRes = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${entry.id}`,
      cookies: ctx.cookies,
      payload: { description: "Venda revisada", amountCents: 7_500 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toMatchObject({ description: "Venda revisada", amountCents: 7_500 });

    const deleteRes = await ctx.app.inject({
      method: "DELETE",
      url: `/entries/${entry.id}`,
      cookies: ctx.cookies,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ ok: true });

    const getRes = await ctx.app.inject({ method: "GET", url: `/entries/${entry.id}`, cookies: ctx.cookies });
    expect(getRes.statusCode).toBe(404);
  });

  it("PATCH com corpo vazio: 400 (root)", async () => {
    const entry = await createEntry();
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${entry.id}`,
      cookies: ctx.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "(root)", message: expect.any(String) });
  });
});

describe("PATCH /entries/:id/recurrence-scope", () => {
  it("only_this desvincula a ocorrência e edita só ela", async () => {
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "recurrence",
        description: "Internet",
        counterparty: "Provedor",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 2_000,
        dueDay: 5,
        startMonth: "2033-01",
        endMonth: "2033-03",
      },
    });
    expect(createRes.statusCode).toBe(201);

    const list = await ctx.app.inject({ method: "GET", url: "/payables?month=2033-01", cookies: ctx.cookies });
    const jan = list.json()[0] as { id: string };

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${jan.id}/recurrence-scope`,
      cookies: ctx.cookies,
      payload: { scope: "only_this", description: "Internet (mês especial)" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: jan.id, description: "Internet (mês especial)", recurrenceId: null });
  });

  it("this_and_future propaga para ocorrências futuras em aberto", async () => {
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "recurrence",
        description: "Software",
        counterparty: "SaaS Inc",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 1_000,
        dueDay: 20,
        startMonth: "2034-01",
        endMonth: "2034-03",
      },
    });
    expect(createRes.statusCode).toBe(201);

    const janList = await ctx.app.inject({ method: "GET", url: "/payables?month=2034-01", cookies: ctx.cookies });
    const jan = janList.json()[0] as { id: string };
    const febList = await ctx.app.inject({ method: "GET", url: "/payables?month=2034-02", cookies: ctx.cookies });
    const feb = febList.json()[0] as { id: string };

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${jan.id}/recurrence-scope`,
      cookies: ctx.cookies,
      payload: { scope: "this_and_future", amountCents: 1_500 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: jan.id, amountCents: 1_500 });

    const febRes = await ctx.app.inject({ method: "GET", url: `/entries/${feb.id}`, cookies: ctx.cookies });
    expect(febRes.json()).toMatchObject({ amountCents: 1_500 });
  });

  it("lançamento não recorrente: 422 ENTRY_NOT_RECURRENT", async () => {
    const single = await ctx.app.inject({
      method: "POST",
      url: "/payables",
      cookies: ctx.cookies,
      payload: {
        kind: "single",
        description: "Não recorrente",
        counterparty: "X",
        categoryId: ctx.fx.expenseCat.id,
        amountCents: 1_000,
        dueDate: "2031-04-20",
      },
    });
    const entry = single.json().entry as { id: string };

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/entries/${entry.id}/recurrence-scope`,
      cookies: ctx.cookies,
      payload: { scope: "only_this", description: "Tentativa" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "ENTRY_NOT_RECURRENT", message: expect.any(String) });
  });
});
