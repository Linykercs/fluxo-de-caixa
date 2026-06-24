// Contas bancárias (spec §6): saldo derivado, criação, renomear/arquivar e extrato.
import type { FastifyInstance } from "fastify";
import { createBankAccountSchema, statementQuerySchema, updateBankAccountSchema } from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { parse } from "../lib/validation.js";
import {
  createBankAccount,
  getStatement,
  listAccountsWithBalances,
  updateBankAccount,
} from "../services/bank-accounts.js";

export async function bankAccountsRoutes(app: FastifyInstance) {
  app.get("/bank-accounts", async (request) => {
    return listAccountsWithBalances(app.prisma, request.user.organizationId);
  });

  app.post("/bank-accounts", async (request, reply) => {
    assertAdmin(request);
    const input = parse(createBankAccountSchema, request.body);
    const account = await createBankAccount(app.prisma, {
      organizationId: request.user.organizationId,
      name: input.name,
      initialBalanceCents: input.initialBalanceCents,
    });
    reply.code(201);
    return account;
  });

  app.patch("/bank-accounts/:id", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const input = parse(updateBankAccountSchema, request.body);
    return updateBankAccount(app.prisma, request.user.organizationId, id, input);
  });

  app.get("/bank-accounts/:id/statement", async (request) => {
    const { id } = request.params as { id: string };
    const query = parse(statementQuerySchema, request.query);
    return getStatement(app.prisma, request.user.organizationId, id, query);
  });
}
