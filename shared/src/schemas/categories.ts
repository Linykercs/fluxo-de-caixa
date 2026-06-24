import { z } from "zod";
import { categoryKindSchema } from "./common.js";

/** GET /categories?kind= */
export const categoryListQuerySchema = z.object({
  kind: categoryKindSchema.optional(),
});
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

/** POST /categories */
export const createCategorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  kind: categoryKindSchema,
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/** PATCH /categories/:id — renomear e/ou arquivar/desarquivar. */
export const updateCategorySchema = z
  .object({
    name: z.string().min(1).optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
