import { z } from "zod";
import { competenceMonthSchema, entryStatusSchema, isoDateSchema } from "./common.js";

/** Filtros de GET /payables e /receivables. */
export const entryListQuerySchema = z.object({
  month: competenceMonthSchema.optional(),
  status: entryStatusSchema.optional(),
  categoryId: z.string().min(1).optional(),
  costCenterId: z.string().min(1).optional(),
  bankAccountId: z.string().min(1).optional(),
});
export type EntryListQuery = z.infer<typeof entryListQuerySchema>;

const baseFields = {
  description: z.string().min(1, "Descrição é obrigatória"),
  counterparty: z.string().min(1, "Contraparte é obrigatória"),
  notes: z.string().optional(),
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  costCenterId: z.string().min(1).optional().nullable(),
};

/** Lançamento único; direção vem da rota (/payables ou /receivables). */
export const createSingleEntrySchema = z.object({
  kind: z.literal("single"),
  ...baseFields,
  amountCents: z.number().int().positive("Valor deve ser maior que zero"),
  dueDate: isoDateSchema,
  competenceMonth: competenceMonthSchema.optional(),
});

/** Parcelamento: N entries com vencimentos/competências mensais consecutivos. */
export const createInstallmentsEntrySchema = z.object({
  kind: z.literal("installments"),
  ...baseFields,
  totalCents: z.number().int().positive("Valor total deve ser maior que zero"),
  installmentTotal: z.number().int().min(2, "Parcelamento exige 2 ou mais parcelas"),
  firstDueDate: isoDateSchema,
  firstCompetenceMonth: competenceMonthSchema,
});

/** Recorrência: materializa ocorrências mensais a partir de startMonth. */
export const createRecurrenceEntrySchema = z.object({
  kind: z.literal("recurrence"),
  description: z.string().min(1, "Descrição é obrigatória"),
  counterparty: z.string().min(1, "Contraparte é obrigatória"),
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  costCenterId: z.string().min(1).optional().nullable(),
  amountCents: z.number().int().positive("Valor deve ser maior que zero"),
  dueDay: z.number().int().min(1).max(31),
  startMonth: competenceMonthSchema,
  endMonth: competenceMonthSchema.optional(),
});

export const createEntrySchema = z.discriminatedUnion("kind", [
  createSingleEntrySchema,
  createInstallmentsEntrySchema,
  createRecurrenceEntrySchema,
]);
export type CreateEntryInput = z.infer<typeof createEntrySchema>;

/** PATCH /entries/:id — campos permitidos dependem do status (validado no service). */
export const updateEntrySchema = z
  .object({
    description: z.string().min(1).optional(),
    counterparty: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
    categoryId: z.string().min(1).optional(),
    costCenterId: z.string().min(1).optional().nullable(),
    amountCents: z.number().int().positive("Valor deve ser maior que zero").optional(),
    dueDate: isoDateSchema.optional(),
    competenceMonth: competenceMonthSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** PATCH /entries/:id/recurrence-scope — edição de série estilo agenda. */
export const recurrenceScopeSchema = z.object({
  scope: z.enum(["only_this", "this_and_future"]),
  description: z.string().min(1).optional(),
  counterparty: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  costCenterId: z.string().min(1).optional().nullable(),
  amountCents: z.number().int().positive("Valor deve ser maior que zero").optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
});
export type RecurrenceScopeInput = z.infer<typeof recurrenceScopeSchema>;
