// Helpers para testes HTTP: app sobre banco de teste + cookie de sessão.
import argon2 from "argon2";
import { buildApp } from "../../src/app";
import { createTestDb, makeFixture } from "../helpers/db";

export const TEST_PASSWORD = "senha123";

export async function setupHttpTest() {
  const db = await createTestDb();
  const fx = await makeFixture(db.prisma);

  const user = await db.prisma.user.update({
    where: { id: fx.user.id },
    data: { email: "login@teste.dev", passwordHash: await argon2.hash(TEST_PASSWORD) },
  });

  const app = buildApp({ prisma: db.prisma });
  await app.ready();

  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: user.email, password: TEST_PASSWORD },
  });
  const sessionCookie = loginRes.cookies.find((c) => c.name === "fluxo_session");
  if (!sessionCookie) throw new Error("login não retornou cookie de sessão");

  return {
    db,
    fx: { ...fx, user },
    app,
    cookies: { fluxo_session: sessionCookie.value },
  };
}

export async function teardownHttpTest(ctx: Awaited<ReturnType<typeof setupHttpTest>>) {
  await ctx.app.close();
  await ctx.db.cleanup();
}
