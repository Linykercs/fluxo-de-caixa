import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "./lib/config.js";
import { BusinessError, NotFoundError } from "./lib/errors.js";
import { prisma as defaultPrisma, type Prisma } from "./lib/prisma.js";
import { ValidationError } from "./lib/validation.js";
import { authRoutes } from "./routes/auth.js";
import { bankAccountsRoutes } from "./routes/bank-accounts.js";
import { bankImportRoutes } from "./routes/bank-import.js";
import { budgetsRoutes } from "./routes/budgets.js";
import { categoriesRoutes } from "./routes/categories.js";
import { costCentersRoutes } from "./routes/cost-centers.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { entriesRoutes } from "./routes/entries.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { reportsRoutes } from "./routes/reports.js";
import { settlementsRoutes } from "./routes/settlements.js";
import { telegramWebhookRoutes } from "./routes/telegram-webhook.js";
import { transfersRoutes } from "./routes/transfers.js";
import { usersRoutes } from "./routes/users.js";

export interface BuildAppOptions {
  prisma?: Prisma;
  serveWeb?: boolean;
}

const apiPrefixes = [
  "/auth",
  "/payables",
  "/receivables",
  "/entries",
  "/settlements",
  "/transfers",
  "/bank-accounts",
  "/categories",
  "/cost-centers",
  "/dashboard",
  "/reports",
  "/users",
  "/notifications",
  "/budgets",
  "/health",
];

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const shouldServeWeb = opts.serveWeb ?? config.serveWeb;

  app.decorate("prisma", opts.prisma ?? defaultPrisma);

  app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  app.register(cors, { origin: config.corsOrigin, credentials: true });
  app.register(cookie);
  app.register(multipart);
  app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: config.cookieName, signed: false },
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authRoutes);
  // Telegram não manda cookie de sessão; autenticação é o segredo na própria URL (ver rota).
  app.register(telegramWebhookRoutes);

  // Tudo abaixo exige sessão válida (spec §6: tudo protegido exceto /auth/login e o webhook do Telegram).
  app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", async (request) => {
      await request.jwtVerify();
    });
    await protectedApp.register(entriesRoutes);
    await protectedApp.register(settlementsRoutes);
    await protectedApp.register(transfersRoutes);
    await protectedApp.register(bankAccountsRoutes);
    await protectedApp.register(bankImportRoutes);
    await protectedApp.register(categoriesRoutes);
    await protectedApp.register(costCentersRoutes);
    await protectedApp.register(dashboardRoutes);
    await protectedApp.register(reportsRoutes);
    await protectedApp.register(usersRoutes);
    await protectedApp.register(notificationsRoutes);
    await protectedApp.register(budgetsRoutes);
  });

  if (shouldServeWeb) {
    const root = path.resolve(config.webDistPath);
    const indexPath = path.join(root, "index.html");
    if (!existsSync(indexPath)) {
      app.log.warn({ root }, "web build not found; static frontend will not be served");
    } else {
      app.register(fastifyStatic, { root });
      app.setNotFoundHandler((request, reply) => {
        const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
        const isApiPath = apiPrefixes.some((prefix) => request.url === prefix || request.url.startsWith(`${prefix}/`));
        if (request.method === "GET" && acceptsHtml && !isApiPath) {
          return reply.sendFile("index.html");
        }
        return reply.status(404).send({ code: "NOT_FOUND", message: "Recurso não encontrado" });
      });
    }
  }

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.status(400).send({ field: error.field, message: error.message });
    }
    if (error instanceof BusinessError) {
      const status = error.code === "FORBIDDEN" ? 403 : 422;
      return reply.status(status).send({ code: error.code, message: error.message });
    }
    if (error instanceof NotFoundError) {
      return reply.status(404).send({ code: error.code, message: error.message });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode === 401) {
      return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Sessão inválida ou ausente" });
    }
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ code: error.code ?? "BAD_REQUEST", message: error.message });
    }

    request.log.error(error);
    return reply.status(500).send({ code: "INTERNAL_ERROR", message: "Erro interno do servidor" });
  });

  return app;
}
