import { z } from "zod";
import { isoDateSchema, positiveAmountCentsSchema } from "./common.js";

/**
 * POST /transfers — contas iguais não são rejeitadas aqui: o service emite
 * 422 TRANSFER_SAME_ACCOUNT (spec §5), mantendo um único lugar para a regra.
 */
export const createTransferSchema = z.object({
  fromAccountId: z.string().min(1, "Conta de origem é obrigatória"),
  toAccountId: z.string().min(1, "Conta de destino é obrigatória"),
  amountCents: positiveAmountCentsSchema("Valor deve ser maior que zero"),
  date: isoDateSchema,
  notes: z.string().optional(),
});
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
