// Integração com o Bot API do Telegram (lembretes de vencimento, spec da feature "fluxo de caixa").
import { randomUUID } from "node:crypto";
import { config } from "../lib/config.js";
import { BusinessError } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";

function botApiUrl(method: string): string {
  if (!config.telegramBotToken) {
    throw new BusinessError("TELEGRAM_NOT_CONFIGURED", "TELEGRAM_BOT_TOKEN não configurado no servidor");
  }
  return `https://api.telegram.org/bot${config.telegramBotToken}/${method}`;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const res = await fetch(botApiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BusinessError("TELEGRAM_SEND_FAILED", `Falha ao enviar mensagem no Telegram: ${body}`);
  }
}

/** Gera (ou reaproveita) o token que a organização usa no /start do bot. */
export async function getOrCreateLinkToken(db: Db, organizationId: string): Promise<string> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (organization.telegramLinkToken) return organization.telegramLinkToken;

  const token = randomUUID().replace(/-/g, "");
  await db.organization.update({ where: { id: organizationId }, data: { telegramLinkToken: token } });
  return token;
}

/** Força a geração de um novo token (invalida o anterior). */
export async function regenerateLinkToken(db: Db, organizationId: string): Promise<string> {
  const token = randomUUID().replace(/-/g, "");
  await db.organization.update({ where: { id: organizationId }, data: { telegramLinkToken: token } });
  return token;
}

export async function unlinkTelegram(db: Db, organizationId: string): Promise<void> {
  await db.organization.update({ where: { id: organizationId }, data: { telegramChatId: null } });
}

export interface TelegramStatus {
  linked: boolean;
  linkToken: string | null;
}

export async function getTelegramStatus(db: Db, organizationId: string): Promise<TelegramStatus> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return {
    linked: organization.telegramChatId !== null,
    linkToken: organization.telegramChatId ? null : organization.telegramLinkToken,
  };
}

/** chatId vinculado da organização, ou null se ainda não conectou o bot. */
export async function getLinkedChatId(db: Db, organizationId: string): Promise<string | null> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return organization.telegramChatId;
}

/** Processa um update recebido no webhook: só reage a "/start <token>". */
export async function handleTelegramUpdate(db: Db, update: unknown): Promise<void> {
  const message = (update as { message?: { text?: string; chat?: { id?: number | string } } }).message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  if (!text || chatId === undefined) return;

  const match = /^\/start\s+(\S+)$/.exec(text);
  if (!match) return;

  const token = match[1];
  const organization = await db.organization.findUnique({ where: { telegramLinkToken: token } });
  if (!organization) {
    await sendTelegramMessage(String(chatId), "Código inválido ou expirado. Gere um novo link na tela de Notificações do FluxoCaixa.");
    return;
  }

  await db.organization.update({
    where: { id: organization.id },
    data: { telegramChatId: String(chatId), telegramLinkToken: null },
  });
  await sendTelegramMessage(
    String(chatId),
    `Conectado! A partir de agora o FluxoCaixa vai te avisar por aqui sobre os lançamentos de "${organization.name}" perto do vencimento.`,
  );
}
