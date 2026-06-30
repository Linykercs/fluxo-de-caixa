import type { FastifyInstance } from "fastify";
import { assertAdmin } from "../lib/auth.js";
import { config } from "../lib/config.js";
import { BusinessError } from "../lib/errors.js";
import {
  getLinkedChatId,
  getOrCreateLinkToken,
  getTelegramStatus,
  regenerateLinkToken,
  sendTelegramMessage,
  unlinkTelegram,
} from "../services/telegram.js";

export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/notifications/telegram", async (request) => {
    const organizationId = request.user.organizationId;
    const status = await getTelegramStatus(app.prisma, organizationId);
    if (!status.linked && !status.linkToken) {
      status.linkToken = await getOrCreateLinkToken(app.prisma, organizationId);
    }
    return { ...status, botUsername: config.telegramBotUsername };
  });

  app.post("/notifications/telegram/regenerate-token", async (request) => {
    assertAdmin(request);
    const linkToken = await regenerateLinkToken(app.prisma, request.user.organizationId);
    return { linkToken };
  });

  app.post("/notifications/telegram/unlink", async (request) => {
    assertAdmin(request);
    await unlinkTelegram(app.prisma, request.user.organizationId);
    return { linked: false };
  });

  app.post("/notifications/telegram/test", async (request) => {
    assertAdmin(request);
    const chatId = await getLinkedChatId(app.prisma, request.user.organizationId);
    if (!chatId) {
      throw new BusinessError("TELEGRAM_NOT_LINKED", "Vincule o Telegram antes de testar o envio");
    }
    await sendTelegramMessage(chatId, "🔔 Mensagem de teste do FluxoCaixa. Se você recebeu isso, está tudo certo!");
    return { ok: true };
  });
}
