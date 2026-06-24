import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_PASSWORD, setupHttpTest, teardownHttpTest } from "./helpers";

let ctx: Awaited<ReturnType<typeof setupHttpTest>>;

beforeAll(async () => {
  ctx = await setupHttpTest();
});
afterAll(() => teardownHttpTest(ctx));

describe("users", () => {
  it("GET /users exige sessao", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /users lista somente usuarios da organizacao logada", async () => {
    const otherOrg = await ctx.db.prisma.organization.create({ data: { name: "Outra org" } });
    await ctx.db.prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        name: "Outro Usuario",
        email: "outro@teste.dev",
        passwordHash: await argon2.hash(TEST_PASSWORD),
      },
    });

    const res = await ctx.app.inject({ method: "GET", url: "/users", cookies: ctx.cookies });
    expect(res.statusCode).toBe(200);
    const users = res.json<Array<{ id: string; organizationId: string; email: string; passwordHash?: string }>>();
    expect(users).toHaveLength(1);
    const [user] = users;
    expect(user!).toMatchObject({ id: ctx.fx.user.id, organizationId: ctx.fx.org.id, email: ctx.fx.user.email });
    expect(user!.passwordHash).toBeUndefined();
  });

  it("POST /users cria usuario na organizacao logada e permite login", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/users",
      cookies: ctx.cookies,
      payload: { name: "Maria Financeiro", email: "MARIA@EMPRESA.COM.BR", password: "senha456" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      organizationId: ctx.fx.org.id,
      name: "Maria Financeiro",
      email: "maria@empresa.com.br",
    });
    expect(res.json().passwordHash).toBeUndefined();

    const login = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "maria@empresa.com.br", password: "senha456" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("POST /users rejeita e-mail duplicado", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/users",
      cookies: ctx.cookies,
      payload: { name: "Duplicado", email: ctx.fx.user.email, password: "senha456" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ code: "USER_EMAIL_EXISTS", message: expect.any(String) });
  });

  it("POST /users valida senha minima", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/users",
      cookies: ctx.cookies,
      payload: { name: "Curto", email: "curto@teste.dev", password: "1234567" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ field: "password", message: expect.any(String) });
  });
});
