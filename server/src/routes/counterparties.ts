import type { FastifyInstance } from "fastify";
import { createCounterpartySchema, updateCounterpartySchema } from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { config } from "../lib/config.js";
import { BusinessError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import {
  createCounterparty,
  getOrCreateLinkToken,
  getTelegramStatus,
  listCounterparties,
  regenerateLinkToken,
  unlinkTelegram,
  updateCounterparty,
} from "../services/counterparties.js";
import { sendTelegramMessage } from "../services/telegram.js";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

export async function counterpartiesRoutes(app: FastifyInstance) {
  app.get("/counterparties", async (request) => {
    return listCounterparties(app.prisma, request.user.organizationId);
  });

  app.post("/counterparties", async (request, reply) => {
    assertAdmin(request);
    const input = parse(createCounterpartySchema, request.body);
    const counterparty = await createCounterparty(app.prisma, { organizationId: request.user.organizationId, ...input });
    reply.code(201);
    return counterparty;
  });

  app.patch("/counterparties/:id", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const input = parse(updateCounterpartySchema, request.body);
    return updateCounterparty(app.prisma, request.user.organizationId, id, input);
  });

  app.get("/counterparties/:id/telegram", async (request) => {
    const { id } = request.params as { id: string };
    const status = await getTelegramStatus(app.prisma, request.user.organizationId, id);
    if (!status.linked && !status.linkToken) {
      status.linkToken = await getOrCreateLinkToken(app.prisma, request.user.organizationId, id);
    }
    return { ...status, botUsername: config.telegramBotUsername };
  });

  app.post("/counterparties/:id/telegram/regenerate-token", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const linkToken = await regenerateLinkToken(app.prisma, request.user.organizationId, id);
    return { linkToken };
  });

  app.post("/counterparties/:id/telegram/unlink", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    await unlinkTelegram(app.prisma, request.user.organizationId, id);
    return { linked: false };
  });

  app.post("/counterparties/:id/telegram/test", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const status = await getTelegramStatus(app.prisma, request.user.organizationId, id);
    if (!status.linked) {
      throw new BusinessError("TELEGRAM_NOT_LINKED", "Vincule o Telegram do cliente antes de testar o envio");
    }
    const counterparty = await app.prisma.counterparty.findFirstOrThrow({
      where: { id, organizationId: request.user.organizationId },
    });
    await sendTelegramMessage(counterparty.telegramChatId!, "🔔 Mensagem de teste do FluxoCaixa.");
    return { ok: true };
  });

  app.post("/counterparties/:id/whatsapp/test", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const counterparty = await app.prisma.counterparty.findFirstOrThrow({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!counterparty.phoneNumber) {
      throw new BusinessError("PHONE_NOT_SET", "Cadastre um número de WhatsApp pra esse cliente antes de testar");
    }
    await sendWhatsAppMessage(counterparty.phoneNumber, "🔔 Mensagem de teste do FluxoCaixa.");
    return { ok: true };
  });
}
