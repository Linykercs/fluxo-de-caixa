// Relatórios (spec §5/§6).
import type { FastifyInstance } from "fastify";
import {
  byCategoryQuerySchema,
  byCounterpartyQuerySchema,
  cashFlowQuerySchema,
  closePeriodSchema,
  costCenterReportQuerySchema,
  dreQuerySchema,
  projectionQuerySchema,
} from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { parse } from "../lib/validation.js";
import { setClosedThroughMonth } from "../services/organizations.js";
import {
  PROJECTION_MONTHS,
  byCategoryReport,
  byCostCenterReport,
  byCounterpartyReport,
  cashFlowReport,
  dreReport,
  projectionReport,
} from "../services/reports.js";

export async function reportsRoutes(app: FastifyInstance) {
  app.get("/reports/cash-flow", async (request) => {
    const query = parse(cashFlowQuerySchema, request.query);
    return cashFlowReport(app.prisma, request.user.organizationId, query.year);
  });

  app.get("/reports/by-category", async (request) => {
    const query = parse(byCategoryQuerySchema, request.query);
    return byCategoryReport(app.prisma, request.user.organizationId, query.month);
  });

  app.get("/reports/by-counterparty", async (request) => {
    const query = parse(byCounterpartyQuerySchema, request.query);
    return byCounterpartyReport(app.prisma, request.user.organizationId, query.month);
  });

  app.get("/reports/projection", async (request) => {
    const query = parse(projectionQuerySchema, request.query);
    return projectionReport(app.prisma, request.user.organizationId, query.months ?? PROJECTION_MONTHS);
  });

  app.get("/reports/dre", async (request) => {
    const query = parse(dreQuerySchema, request.query);
    return dreReport(app.prisma, request.user.organizationId, query.month);
  });

  app.post("/reports/close-period", async (request) => {
    assertAdmin(request);
    const input = parse(closePeriodSchema, request.body);
    const closedThroughMonth = await setClosedThroughMonth(app.prisma, request.user.organizationId, input.month);
    return { closedThroughMonth };
  });

  app.get("/reports/cost-centers", async (request) => {
    const query = parse(costCenterReportQuerySchema, request.query);
    return byCostCenterReport(app.prisma, request.user.organizationId, query.month);
  });
}
