import { z } from "zod";
import { competenceMonthSchema } from "./common.js";

/** GET /dashboard?month=YYYY-MM */
export const dashboardQuerySchema = z.object({
  month: competenceMonthSchema,
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/** GET /reports/cash-flow?year=YYYY */
export const cashFlowQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2999),
});
export type CashFlowQuery = z.infer<typeof cashFlowQuerySchema>;

/** GET /reports/by-category?month=YYYY-MM */
export const byCategoryQuerySchema = z.object({
  month: competenceMonthSchema,
});
export type ByCategoryQuery = z.infer<typeof byCategoryQuerySchema>;

/** GET /reports/by-counterparty?month=YYYY-MM */
export const byCounterpartyQuerySchema = z.object({
  month: competenceMonthSchema,
});
export type ByCounterpartyQuery = z.infer<typeof byCounterpartyQuerySchema>;

/** GET /reports/projection?months=N */
export const projectionQuerySchema = z.object({
  months: z.coerce.number().int().min(1).optional(),
});
export type ProjectionQuery = z.infer<typeof projectionQuerySchema>;

/** GET /reports/dre?month=YYYY-MM */
export const dreQuerySchema = z.object({
  month: competenceMonthSchema,
});
export type DreQuery = z.infer<typeof dreQuerySchema>;

/** POST /reports/close-period */
export const closePeriodSchema = z.object({
  month: competenceMonthSchema,
});
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;

/** GET /reports/cost-centers?month=YYYY-MM */
export const costCenterReportQuerySchema = z.object({
  month: competenceMonthSchema,
});
export type CostCenterReportQuery = z.infer<typeof costCenterReportQuerySchema>;

/** GET /dashboard/chart?months=N */
export const chartReportQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});
export type ChartReportQuery = z.infer<typeof chartReportQuerySchema>;
