import { z } from "zod";

/** POST /counterparties */
export const createCounterpartySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  phoneNumber: z.string().optional(),
});
export type CreateCounterpartyInput = z.infer<typeof createCounterpartySchema>;

/** PATCH /counterparties/:id */
export const updateCounterpartySchema = z
  .object({
    name: z.string().min(1).optional(),
    phoneNumber: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");
export type UpdateCounterpartyInput = z.infer<typeof updateCounterpartySchema>;
