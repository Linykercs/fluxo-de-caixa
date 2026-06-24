import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_PASSWORD, setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;
let operatorCookies: Record<string, string>;
let operatorId: string;

beforeAll(async () => {
  ctx = await setupHttpTest();

  const operator = await ctx.db.prisma.user.create({
    data: {
      organizationId: ctx.fx.org.id,
      name: "Operador",
      email: "operador@teste.dev",
      passwordHash: await argon2.hash(TEST_PASSWORD),
      role: "OPERATOR",
    },
  });
  operatorId = operator.id;

  const loginRes = await ctx.app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "operador@teste.dev", password: TEST_PASSWORD },
  });
  const cookie = loginRes.cookies.find((c) => c.name === "fluxo_session");
  if (!cookie) throw new Error("login do operador não retornou cookie");
  operatorCookies = { fluxo_session: cookie.value };
});

afterAll(() => teardownHttpTest(ctx));

describe("Operador — rotas bloqueadas (403)", () => {
  it("POST /categories retorna 403", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      cookies: operatorCookies,
      payload: { name: "Nova", kind: "EXPENSE" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: "FORBIDDEN", message: expect.any(String) });
  });

  it("PATCH /categories/:id retorna 403", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${ctx.fx.expenseCat.id}`,
      cookies: operatorCookies,
      payload: { name: "Renomear" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /users retorna 403", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/users",
      cookies: operatorCookies,
      payload: { name: "Novo", email: "novo@teste.dev", password: "senha123" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /reports/close-period retorna 403", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/reports/close-period",
      cookies: operatorCookies,
      payload: { month: "2026-05" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Operador — rotas permitidas (200)", () => {
  it("GET /categories retorna 200", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/categories", cookies: operatorCookies });
    expect(res.statusCode).toBe(200);
  });

  it("GET /bank-accounts retorna 200", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/bank-accounts", cookies: operatorCookies });
    expect(res.statusCode).toBe(200);
  });

  it("GET /users retorna 200", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/users", cookies: operatorCookies });
    expect(res.statusCode).toBe(200);
  });
});

describe("PATCH /users/:id/role", () => {
  it("admin pode mudar role de outro usuário", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${operatorId}/role`,
      cookies: ctx.cookies,
      payload: { role: "ADMIN" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: operatorId, role: "ADMIN" });
  });

  it("admin não pode mudar o próprio role", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${ctx.fx.user.id}/role`,
      cookies: ctx.cookies,
      payload: { role: "OPERATOR" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: "FORBIDDEN", message: expect.any(String) });
  });

  it("operador não pode mudar role de ninguém", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${ctx.fx.user.id}/role`,
      cookies: operatorCookies,
      payload: { role: "OPERATOR" },
    });
    expect(res.statusCode).toBe(403);
  });
});
