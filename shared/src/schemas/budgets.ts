import { z } from "zod";
import { competenceMonthSchema, positiveAmountCentsSchema } from "./common.js";

/** GET /budgets/report?month= */
export const budgetReportQuerySchema = z.object({
  month: competenceMonthSchema,
});
export type BudgetReportQuery = z.infer<typeof budgetReportQuerySchema>;

/** POST /budgets */
export const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  amountCents: positiveAmountCentsSchema("Valor deve ser maior que zero"),
  startMonth: competenceMonthSchema,
  endMonth: competenceMonthSchema.optional(),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

/** PATCH /budgets/:id — muda o valor a partir de effectiveMonth. */
export const updateBudgetSchema = z.object({
  amountCents: positiveAmountCentsSchema("Valor deve ser maior que zero"),
  effectiveMonth: competenceMonthSchema,
});
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

/** DELETE /budgets/:id?effectiveMonth= — encerra a regra a partir desse mês. */
export const cancelBudgetQuerySchema = z.object({
  effectiveMonth: competenceMonthSchema,
});
export type CancelBudgetQuery = z.infer<typeof cancelBudgetQuerySchema>;
