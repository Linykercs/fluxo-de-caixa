import { z } from "zod";
import { isoDateSchema } from "./common.js";

/** POST /bank-accounts */
export const createBankAccountSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  initialBalanceCents: z.number().int(),
});
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;

/** PATCH /bank-accounts/:id — renomear e/ou arquivar/desarquivar. */
export const updateBankAccountSchema = z
  .object({
    name: z.string().min(1).optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

/** GET /bank-accounts/:id/statement */
export const statementQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type StatementQuery = z.infer<typeof statementQuerySchema>;
