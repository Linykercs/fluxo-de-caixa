// Sessão (spec §6): login/logout/me via cookie httpOnly, e bloqueio global
// de rotas protegidas sem sessão válida.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_PASSWORD, setupHttpTest, teardownHttpTest } from "./helpers";
import { createTestDb } from "../helpers/db";
import { buildApp } from "../../src/app";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
});
afterAll(() => teardownHttpTest(ctx));

describe("POST /auth/login", () => {
  it("credenciais corretas: 200, retorna usuário e seta cookie httpOnly", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ctx.fx.user.email, password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ctx.fx.user.id,
      name: ctx.fx.user.name,
      email: ctx.fx.user.email,
      organizationId: ctx.fx.org.id,
      role: "ADMIN",
    });
    const cookie = res.cookies.find((c) => c.name === "fluxo_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
  });

  it("senha errada: 422 INVALID_CREDENTIALS", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ctx.fx.user.email, password: "errada" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "INVALID_CREDENTIALS", message: expect.any(String) });
  });

  it("e-mail inexistente: 422 INVALID_CREDENTIALS", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ninguem@teste.dev", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "INVALID_CREDENTIALS", message: expect.any(String) });
  });

  it("payload inválido (e-mail mal formado): 400 com field", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "não-é-email", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "email", message: expect.any(String) });
  });
});

describe("GET /auth/me", () => {
  it("sem cookie: 401 UNAUTHENTICATED", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: "UNAUTHENTICATED", message: expect.any(String) });
  });

  it("com cookie válido: 200 com dados do usuário", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/auth/me", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ctx.fx.user.id,
      organizationId: ctx.fx.org.id,
      name: ctx.fx.user.name,
      email: ctx.fx.user.email,
      role: "ADMIN",
    });
  });
});

describe("rotas protegidas", () => {
  it("GET /payables sem cookie: 401 UNAUTHENTICATED", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/payables" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: "UNAUTHENTICATED", message: expect.any(String) });
  });

  it("GET /payables com cookie válido: 200", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/payables", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /auth/login rate limit", () => {
  it("bloqueia na 6ª requisição (429)", async () => {
    const testDb = await createTestDb();
    const testApp = buildApp({ prisma: testDb.prisma });
    await testApp.ready();
    try {
      for (let i = 0; i < 5; i++) {
        await testApp.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: `login${i}@teste.dev`, password: "wrongpass1" },
        });
      }
      const res = await testApp.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "login5@teste.dev", password: "wrongpass1" },
      });
      expect(res.statusCode).toBe(429);
    } finally {
      await testApp.close();
      await testDb.cleanup();
    }
  });
});

describe("POST /auth/logout", () => {
  it("limpa o cookie de sessão", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/auth/logout", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const cookie = res.cookies.find((c) => c.name === "fluxo_session");
    expect(cookie?.value).toBe("");
  });
});
