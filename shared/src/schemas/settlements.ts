import { z } from "zod";
import { isoDateSchema } from "./common.js";

/** POST /entries/:id/settle */
export const settleEntrySchema = z.object({
  amountCents: z.number().int().positive("Valor deve ser maior que zero"),
  settledAt: isoDateSchema,
  bankAccountId: z.string().min(1, "Conta bancária é obrigatória"),
  notes: z.string().optional(),
});
export type SettleEntryInput = z.infer<typeof settleEntrySchema>;
