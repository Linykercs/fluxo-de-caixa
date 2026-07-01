import type { FastifyInstance } from "fastify";
import { config } from "../lib/config.js";
import * as counterparties from "../services/counterparties.js";
import { handleTelegramUpdate, sendTelegramMessage } from "../services/telegram.js";

// Pública (Telegram não manda cookie de sessão): protegida pelo segredo na própria URL.
export async function telegramWebhookRoutes(app: FastifyInstance) {
  app.post("/telegram/webhook/:secret", async (request, reply) => {
    const { secret } = request.params as { secret: string };
    if (!config.telegramWebhookSecret || secret !== config.telegramWebhookSecret) {
      return reply.status(404).send();
    }

    try {
      // Organização e cliente (Counterparty) usam o mesmo /start <token>;
      // tenta casar com uma organização primeiro, depois com um cliente.
      const matchedOrg = await handleTelegramUpdate(app.prisma, request.body);
      if (!matchedOrg) {
        const matchedCounterparty = await counterparties.handleTelegramUpdate(app.prisma, request.body);
        if (!matchedCounterparty) {
          const body = request.body as { message?: { text?: string; chat?: { id?: number | string } } };
          const text = body.message?.text?.trim();
          const chatId = body.message?.chat?.id;
          if (text && /^\/start\s+\S+$/.test(text) && chatId !== undefined) {
            await sendTelegramMessage(
              String(chatId),
              "Código inválido ou expirado. Peça um novo link pra quem te mandou.",
            );
          }
        }
      }
    } catch (err) {
      request.log.error(err, "falha ao processar update do Telegram");
    }

    // Sempre 200: evita que o Telegram fique reentregando o mesmo update.
    return reply.status(200).send({ ok: true });
  });
}
