import type { FastifyInstance } from "fastify";
import {
  budgetReportQuerySchema,
  cancelBudgetQuerySchema,
  createBudgetSchema,
  updateBudgetSchema,
} from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { parse } from "../lib/validation.js";
import {
  budgetReport,
  cancelBudgetFromMonth,
  createBudget,
  listBudgets,
  updateBudgetFromMonth,
} from "../services/budgets.js";

export async function budgetsRoutes(app: FastifyInstance) {
  app.get("/budgets/report", async (request) => {
    const query = parse(budgetReportQuerySchema, request.query);
    return budgetReport(app.prisma, request.user.organizationId, query.month);
  });

  app.get("/budgets", async (request) => {
    return listBudgets(app.prisma, request.user.organizationId);
  });

  app.post("/budgets", async (request, reply) => {
    assertAdmin(request);
    const input = parse(createBudgetSchema, request.body);
    const budget = await createBudget(app.prisma, { organizationId: request.user.organizationId, ...input });
    reply.code(201);
    return budget;
  });

  app.patch("/budgets/:id", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const input = parse(updateBudgetSchema, request.body);
    return updateBudgetFromMonth(app.prisma, {
      organizationId: request.user.organizationId,
      budgetId: id,
      effectiveMonth: input.effectiveMonth,
      amountCents: input.amountCents,
    });
  });

  app.delete("/budgets/:id", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const query = parse(cancelBudgetQuerySchema, request.query);
    const result = await cancelBudgetFromMonth(app.prisma, {
      organizationId: request.user.organizationId,
      budgetId: id,
      effectiveMonth: query.effectiveMonth,
    });
    return { canceled: true, budget: result };
  });
}
