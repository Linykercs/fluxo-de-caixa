// Centros de custo via HTTP (Fase 11 F3): autenticação, escopo por
// organização e CRUD (criar/listar/renomear/arquivar).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
});
afterAll(() => teardownHttpTest(ctx));

describe("cost-centers", () => {
  it("GET /cost-centers exige sessao", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/cost-centers" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /cost-centers cria e GET /cost-centers lista", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/cost-centers",
      cookies: ctx.cookies,
      payload: { name: "Obra X" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      organizationId: ctx.fx.org.id,
      name: "Obra X",
      archivedAt: null,
    });

    const list = await ctx.app.inject({ method: "GET", url: "/cost-centers", cookies: ctx.cookies });
    expect(list.statusCode).toBe(200);
    const costCenters = list.json<Array<{ id: string; name: string }>>();
    expect(costCenters.map((c) => c.name)).toContain("Obra X");
  });

  it("GET /cost-centers lista somente centros de custo da organizacao logada", async () => {
    const otherOrg = await ctx.db.prisma.organization.create({ data: { name: "Outra org" } });
    await ctx.db.prisma.costCenter.create({ data: { organizationId: otherOrg.id, name: "De outra org" } });

    const list = await ctx.app.inject({ method: "GET", url: "/cost-centers", cookies: ctx.cookies });
    const costCenters = list.json<Array<{ name: string }>>();
    expect(costCenters.map((c) => c.name)).not.toContain("De outra org");
  });

  it("PATCH /cost-centers/:id renomeia", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/cost-centers",
      cookies: ctx.cookies,
      payload: { name: "Original" },
    });
    const { id } = create.json();

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/cost-centers/${id}`,
      cookies: ctx.cookies,
      payload: { name: "Renomeado" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renomeado");
  });

  it("PATCH /cost-centers/:id arquiva e desarquiva", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/cost-centers",
      cookies: ctx.cookies,
      payload: { name: "Arquivável" },
    });
    const { id } = create.json();

    const archived = await ctx.app.inject({
      method: "PATCH",
      url: `/cost-centers/${id}`,
      cookies: ctx.cookies,
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archivedAt).not.toBeNull();

    const unarchived = await ctx.app.inject({
      method: "PATCH",
      url: `/cost-centers/${id}`,
      cookies: ctx.cookies,
      payload: { archived: false },
    });
    expect(unarchived.json().archivedAt).toBeNull();
  });

  it("PATCH /cost-centers/:id em id inexistente -> 404", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/cost-centers/inexistente",
      cookies: ctx.cookies,
      payload: { name: "Novo nome" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "COST_CENTER_NOT_FOUND", message: expect.any(String) });
  });

  it("POST /cost-centers valida nome obrigatorio", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/cost-centers",
      cookies: ctx.cookies,
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});
