// Cadastro de clientes/fornecedores: CRUD com arquivamento (igual cost centers)
// + vínculo de Telegram próprio por cliente, para a régua de cobrança
// automática (reaproveita o mesmo mecanismo /start <token> da organização,
// só que aqui o token identifica um Counterparty em vez da Organization).
import { randomUUID } from "node:crypto";
import { NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";
import { sendTelegramMessage } from "./telegram.js";
import { normalizePhoneNumber } from "./whatsapp.js";

export async function listCounterparties(db: Db, organizationId: string) {
  return db.counterparty.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export interface CreateCounterpartyInput {
  organizationId: string;
  name: string;
  phoneNumber?: string | null;
}

export async function createCounterparty(db: Db, input: CreateCounterpartyInput) {
  return db.counterparty.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      phoneNumber: input.phoneNumber ? normalizePhoneNumber(input.phoneNumber) : null,
    },
  });
}

export interface UpdateCounterpartyChanges {
  name?: string;
  phoneNumber?: string | null;
  archived?: boolean;
}

async function getCounterpartyOrThrow(db: Db, organizationId: string, counterpartyId: string) {
  const counterparty = await db.counterparty.findFirst({ where: { id: counterpartyId, organizationId } });
  if (!counterparty) {
    throw new NotFoundError("COUNTERPARTY_NOT_FOUND", "Cliente não encontrado");
  }
  return counterparty;
}

export async function updateCounterparty(
  db: Db,
  organizationId: string,
  counterpartyId: string,
  changes: UpdateCounterpartyChanges,
) {
  await getCounterpartyOrThrow(db, organizationId, counterpartyId);
  return db.counterparty.update({
    where: { id: counterpartyId },
    data: {
      name: changes.name,
      phoneNumber:
        changes.phoneNumber === undefined ? undefined : changes.phoneNumber ? normalizePhoneNumber(changes.phoneNumber) : null,
      archivedAt: changes.archived === undefined ? undefined : changes.archived ? new Date() : null,
    },
  });
}

export interface CounterpartyTelegramStatus {
  linked: boolean;
  linkToken: string | null;
}

export async function getTelegramStatus(db: Db, organizationId: string, counterpartyId: string): Promise<CounterpartyTelegramStatus> {
  const counterparty = await getCounterpartyOrThrow(db, organizationId, counterpartyId);
  return {
    linked: counterparty.telegramChatId !== null,
    linkToken: counterparty.telegramChatId ? null : counterparty.telegramLinkToken,
  };
}

export async function getOrCreateLinkToken(db: Db, organizationId: string, counterpartyId: string): Promise<string> {
  const counterparty = await getCounterpartyOrThrow(db, organizationId, counterpartyId);
  if (counterparty.telegramLinkToken) return counterparty.telegramLinkToken;

  const token = randomUUID().replace(/-/g, "");
  await db.counterparty.update({ where: { id: counterpartyId }, data: { telegramLinkToken: token } });
  return token;
}

export async function regenerateLinkToken(db: Db, organizationId: string, counterpartyId: string): Promise<string> {
  await getCounterpartyOrThrow(db, organizationId, counterpartyId);
  const token = randomUUID().replace(/-/g, "");
  await db.counterparty.update({ where: { id: counterpartyId }, data: { telegramLinkToken: token } });
  return token;
}

export async function unlinkTelegram(db: Db, organizationId: string, counterpartyId: string): Promise<void> {
  await getCounterpartyOrThrow(db, organizationId, counterpartyId);
  await db.counterparty.update({ where: { id: counterpartyId }, data: { telegramChatId: null } });
}

/** Processa um update do webhook do bot: só reage a "/start <token>" que bata com um Counterparty. */
export async function handleTelegramUpdate(db: Db, update: unknown): Promise<boolean> {
  const message = (update as { message?: { text?: string; chat?: { id?: number | string } } }).message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  if (!text || chatId === undefined) return false;

  const match = /^\/start\s+(\S+)$/.exec(text);
  if (!match) return false;

  const token = match[1];
  const counterparty = await db.counterparty.findUnique({ where: { telegramLinkToken: token } });
  if (!counterparty) return false;

  await db.counterparty.update({
    where: { id: counterparty.id },
    data: { telegramChatId: String(chatId), telegramLinkToken: null },
  });
  await sendTelegramMessage(
    String(chatId),
    `Conectado! A partir de agora "${counterparty.name}" pode receber avisos de cobrança por aqui quando um pagamento vencer.`,
  );
  return true;
}
