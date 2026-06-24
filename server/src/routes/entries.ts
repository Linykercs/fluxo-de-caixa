// Rotas de lançamentos (spec §6): /payables e /receivables compartilham a
// mesma implementação, diferindo só pela direction; /entries/:id é
// direction-agnóstico (a direção vem do registro encontrado).
import type { FastifyInstance } from "fastify";
import { createEntrySchema, entryListQuerySchema, recurrenceScopeSchema, updateEntrySchema } from "@fluxo/shared";
import { toDate } from "../lib/dates.js";
import { parse } from "../lib/validation.js";
import {
  createInstallments,
  createSingleEntry,
  deleteEntry,
  getEntryOrThrow,
  listEntries,
  updateEntry,
} from "../services/entries.js";
import { createRecurrence, ensureHorizon, updateRecurrenceFromEntry } from "../services/recurrences.js";
import { serializeEntry, serializeEntryDetail } from "./serializers.js";

function registerDirectionRoutes(app: FastifyInstance, direction: "PAYABLE" | "RECEIVABLE", path: string) {
  app.get(path, async (request) => {
    const organizationId = request.user.organizationId;
    await ensureHorizon(app.prisma, organizationId);

    const query = parse(entryListQuerySchema, request.query);
    const entries = await listEntries(app.prisma, {
      organizationId,
      direction,
      month: query.month,
      status: query.status,
      categoryId: query.categoryId,
      costCenterId: query.costCenterId,
      bankAccountId: query.bankAccountId,
    });
    return entries.map((entry) => serializeEntry(entry));
  });

  app.post(path, async (request, reply) => {
    const organizationId = request.user.organizationId;
    const input = parse(createEntrySchema, request.body);

    if (input.kind === "single") {
      const entry = await createSingleEntry(app.prisma, {
        organizationId,
        direction,
        description: input.description,
        counterparty: input.counterparty,
        notes: input.notes,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId,
        amountCents: input.amountCents,
        competenceMonth: input.competenceMonth,
        dueDate: toDate(input.dueDate),
      });
      reply.code(201);
      return { entry: serializeEntry({ ...entry, settlements: [] }) };
    }

    if (input.kind === "installments") {
      const entries = await createInstallments(app.prisma, {
        organizationId,
        direction,
        description: input.description,
        counterparty: input.counterparty,
        notes: input.notes,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId,
        totalCents: input.totalCents,
        installmentTotal: input.installmentTotal,
        firstDueDate: toDate(input.firstDueDate),
        firstCompetenceMonth: input.firstCompetenceMonth,
      });
      reply.code(201);
      return { entries: entries.map((entry) => serializeEntry({ ...entry, settlements: [] })) };
    }

    const recurrence = await createRecurrence(app.prisma, {
      organizationId,
      direction,
      description: input.description,
      counterparty: input.counterparty,
      categoryId: input.categoryId,
      costCenterId: input.costCenterId,
      amountCents: input.amountCents,
      dueDay: input.dueDay,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
    reply.code(201);
    return { recurrence };
  });
}

export async function entriesRoutes(app: FastifyInstance) {
  registerDirectionRoutes(app, "PAYABLE", "/payables");
  registerDirectionRoutes(app, "RECEIVABLE", "/receivables");

  app.get("/entries/:id", async (request) => {
    const organizationId = request.user.organizationId;
    const { id } = request.params as { id: string };
    const entry = await getEntryOrThrow(app.prisma, organizationId, id);
    return serializeEntryDetail(entry);
  });

  app.patch("/entries/:id", async (request) => {
    const organizationId = request.user.organizationId;
    const { id } = request.params as { id: string };
    const changes = parse(updateEntrySchema, request.body);
    await updateEntry(app.prisma, organizationId, id, {
      description: changes.description,
      counterparty: changes.counterparty,
      notes: changes.notes,
      categoryId: changes.categoryId,
      costCenterId: changes.costCenterId,
      amountCents: changes.amountCents,
      dueDate: changes.dueDate ? toDate(changes.dueDate) : undefined,
      competenceMonth: changes.competenceMonth,
    });
    const entry = await getEntryOrThrow(app.prisma, organizationId, id);
    return serializeEntryDetail(entry);
  });

  app.delete("/entries/:id", async (request) => {
    const organizationId = request.user.organizationId;
    const { id } = request.params as { id: string };
    await deleteEntry(app.prisma, organizationId, id);
    return { ok: true };
  });

  app.patch("/entries/:id/recurrence-scope", async (request) => {
    const organizationId = request.user.organizationId;
    const { id } = request.params as { id: string };
    const { scope, ...changes } = parse(recurrenceScopeSchema, request.body);

    if (scope === "only_this") {
      await updateRecurrenceFromEntry(app.prisma, { organizationId, entryId: id, scope: "only_this", changes });
    } else {
      await updateRecurrenceFromEntry(app.prisma, { organizationId, entryId: id, scope: "this_and_future", changes });
    }

    const entry = await getEntryOrThrow(app.prisma, organizationId, id);
    return serializeEntryDetail(entry);
  });
}
