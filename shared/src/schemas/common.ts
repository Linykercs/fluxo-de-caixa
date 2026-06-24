import { z } from "zod";

/** Data-calendário "YYYY-MM-DD" (sem horário). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (esperado AAAA-MM-DD)");

/** Competência "YYYY-MM". */
export const competenceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida (esperado AAAA-MM)");

export const entryDirectionSchema = z.enum(["PAYABLE", "RECEIVABLE"]);
export const entryStatusSchema = z.enum(["OPEN", "SETTLED", "OVERDUE"]);
export const categoryKindSchema = z.enum(["EXPENSE", "INCOME"]);
