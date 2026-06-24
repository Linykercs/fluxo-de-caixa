// Transferência entre contas (spec §5/§6).
import type { FastifyInstance } from "fastify";
import { createTransferSchema } from "@fluxo/shared";
import { calendarDate, toDate } from "../lib/dates.js";
import { parse } from "../lib/validation.js";
import { createTransfer } from "../services/transfers.js";

export async function transfersRoutes(app: FastifyInstance) {
  app.post("/transfers", async (request, reply) => {
    const input = parse(createTransferSchema, request.body);

    const transfer = await createTransfer(app.prisma, {
      organizationId: request.user.organizationId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountCents: input.amountCents,
      date: toDate(input.date),
      userId: request.user.sub,
      notes: input.notes,
    });

    reply.code(201);
    return {
      id: transfer.id,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amountCents: transfer.amountCents,
      date: calendarDate(transfer.date),
      notes: transfer.notes,
      createdAt: transfer.createdAt,
    };
  });
}
