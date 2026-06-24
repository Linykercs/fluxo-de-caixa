// Sessão via cookie httpOnly com JWT (spec §6). Login confere a senha com
// argon2; logout limpa o cookie; /me decodifica o JWT do cookie.
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { loginSchema } from "@fluxo/shared";
import { config } from "../lib/config.js";
import { BusinessError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parse(loginSchema, request.body);

    const user = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
      throw new BusinessError("INVALID_CREDENTIALS", "E-mail ou senha inválidos");
    }

    const token = app.jwt.sign({
      sub: user.id,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    reply.setCookie(config.cookieName, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      maxAge: 60 * 60 * 24 * 7,
    });

    return { id: user.id, name: user.name, email: user.email, organizationId: user.organizationId, role: user.role };
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    await request.jwtVerify();
    const { sub, organizationId, name, email, role } = request.user;
    return { id: sub, organizationId, name, email, role };
  });
}
