import type { FastifyInstance } from "fastify";
import { config } from "../lib/config.js";
import { handleTelegramUpdate } from "../services/telegram.js";

// Pública (Telegram não manda cookie de sessão): protegida pelo segredo na própria URL.
export async function telegramWebhookRoutes(app: FastifyInstance) {
  app.post("/telegram/webhook/:secret", async (request, reply) => {
    const { secret } = request.params as { secret: string };
    if (!config.telegramWebhookSecret || secret !== config.telegramWebhookSecret) {
      return reply.status(404).send();
    }

    try {
      await handleTelegramUpdate(app.prisma, request.body);
    } catch (err) {
      request.log.error(err, "falha ao processar update do Telegram");
    }

    // Sempre 200: evita que o Telegram fique reentregando o mesmo update.
    return reply.status(200).send({ ok: true });
  });
}
