// Baixa e estorno (spec §5/§6): transação atômica nos services, rota só
// valida, traduz datas e serializa a resposta.
import type { FastifyInstance } from "fastify";
import { settleEntrySchema } from "@fluxo/shared";
import { toDate } from "../lib/dates.js";
import { parse } from "../lib/validation.js";
import { reverseSettlement, settleEntry } from "../services/settlements.js";
import { serializeSettlement } from "./serializers.js";

export async function settlementsRoutes(app: FastifyInstance) {
  app.post("/entries/:id/settle", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parse(settleEntrySchema, request.body);

    const settlement = await settleEntry(app.prisma, {
      organizationId: request.user.organizationId,
      entryId: id,
      amountCents: input.amountCents,
      settledAt: toDate(input.settledAt),
      bankAccountId: input.bankAccountId,
      userId: request.user.sub,
      notes: input.notes,
    });
    reply.code(201);
    return serializeSettlement(settlement);
  });

  app.post("/settlements/:id/reverse", async (request, reply) => {
    const { id } = request.params as { id: string };
    const reversal = await reverseSettlement(app.prisma, {
      organizationId: request.user.organizationId,
      settlementId: id,
      userId: request.user.sub,
    });
    reply.code(201);
    return serializeSettlement(reversal);
  });
}
