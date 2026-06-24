import { z } from "zod";

/** POST /cost-centers */
export const createCostCenterSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});
export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>;

/** PATCH /cost-centers/:id — renomear e/ou arquivar/desarquivar. */
export const updateCostCenterSchema = z
  .object({
    name: z.string().min(1).optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");
export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>;
