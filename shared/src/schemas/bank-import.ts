import { z } from "zod";
import { isoDateSchema } from "./common.js";

const rowBaseFields = {
  fitid: z.string().min(1),
  date: isoDateSchema,
  amountCents: z.number().int(),
  description: z.string(),
};

/** Dados do lançamento novo (POST .../import/confirm, action "create"). */
export const newEntryFromImportSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  counterparty: z.string().min(1, "Contraparte é obrigatória"),
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  costCenterId: z.string().min(1).optional(),
});

/** POST /bank-accounts/:id/import/confirm — uma linha do extrato revisada. */
export const importConfirmRowSchema = z.discriminatedUnion("action", [
  z.object({ ...rowBaseFields, action: z.literal("settle"), entryId: z.string().min(1, "Lançamento é obrigatório") }),
  z.object({ ...rowBaseFields, action: z.literal("create"), newEntry: newEntryFromImportSchema }),
  z.object({ ...rowBaseFields, action: z.literal("ignore") }),
]);
export type ImportConfirmRow = z.infer<typeof importConfirmRowSchema>;

export const importConfirmSchema = z.array(importConfirmRowSchema).min(1, "Nenhuma linha para confirmar");
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
