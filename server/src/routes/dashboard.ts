// Painel (spec §5/§6): garante o horizonte de recorrência antes de agregar.
import type { FastifyInstance } from "fastify";
import { chartReportQuerySchema, dashboardQuerySchema } from "@fluxo/shared";
import { parse } from "../lib/validation.js";
import { ensureHorizon } from "../services/recurrences.js";
import { chartReport, dashboard } from "../services/reports.js";

const DEFAULT_CHART_MONTHS = 6;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async (request) => {
    const query = parse(dashboardQuerySchema, request.query);
    const organizationId = request.user.organizationId;
    await ensureHorizon(app.prisma, organizationId);
    return dashboard(app.prisma, organizationId, query.month);
  });

  app.get("/dashboard/chart", async (request) => {
    const query = parse(chartReportQuerySchema, request.query);
    return chartReport(app.prisma, request.user.organizationId, query.months ?? DEFAULT_CHART_MONTHS);
  });
}
