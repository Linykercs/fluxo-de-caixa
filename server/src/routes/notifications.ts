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
import { getUserPhoneNumber, getWhatsAppStatus, sendWhatsAppMessage, setUserPhoneNumber } from "../services/whatsapp.js";

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

  app.get("/notifications/whatsapp", async (request) => {
    const [phoneNumber, sessionStatus] = await Promise.all([
      getUserPhoneNumber(app.prisma, request.user.sub),
      Promise.resolve(getWhatsAppStatus()),
    ]);
    return { phoneNumber, ...sessionStatus };
  });

  // Número é preferência pessoal (cada usuário recebe no próprio celular),
  // por isso não exige admin — diferente do vínculo do Telegram, que ainda é por organização.
  app.post("/notifications/whatsapp/number", async (request) => {
    const { phoneNumber } = request.body as { phoneNumber: string | null };
    const saved = await setUserPhoneNumber(app.prisma, request.user.sub, phoneNumber);
    return { phoneNumber: saved };
  });

  app.post("/notifications/whatsapp/test", async (request) => {
    const phoneNumber = await getUserPhoneNumber(app.prisma, request.user.sub);
    if (!phoneNumber) {
      throw new BusinessError("WHATSAPP_NUMBER_NOT_SET", "Cadastre um número de WhatsApp antes de testar o envio");
    }
    await sendWhatsAppMessage(phoneNumber, "🔔 Mensagem de teste do FluxoCaixa. Se você recebeu isso, está tudo certo!");
    return { ok: true };
  });
}
