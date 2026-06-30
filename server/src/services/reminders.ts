// Lembretes de vencimento via Telegram e/ou WhatsApp: roda 1x/hora, mas só
// dispara mensagem uma vez por lançamento por janela (dueSoonNotifiedAt /
// dueTodayNotifiedAt). Erro num canal ou numa organização não trava as demais.
import { addDays, todaySP, toDate } from "../lib/dates.js";
import type { Db } from "../lib/prisma.js";
import { deriveEntry } from "./entries.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const DIRECTION_LABEL: Record<string, string> = { PAYABLE: "a pagar", RECEIVABLE: "a receber" };
const DIRECTION_ICON: Record<string, string> = { PAYABLE: "📤", RECEIVABLE: "📥" };

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildMessage(title: string, entries: { description: string; amountCents: number; direction: string }[]): string {
  const lines = entries.map(
    (e) => `${DIRECTION_ICON[e.direction] ?? "•"} ${e.description} — ${formatCents(e.amountCents)} (${DIRECTION_LABEL[e.direction] ?? e.direction})`,
  );
  return `${title}\n\n${lines.join("\n")}`;
}

export interface ReminderResult {
  organizationsChecked: number;
  messagesSent: number;
}

interface NotifiableOrg {
  id: string;
  telegramChatId: string | null;
  whatsappPhoneNumber: string | null;
}

/** Manda `text` por todos os canais configurados na org; uma falha num canal não impede o outro. */
async function deliver(org: NotifiableOrg, text: string): Promise<number> {
  let sent = 0;
  if (org.telegramChatId) {
    try {
      await sendTelegramMessage(org.telegramChatId, text);
      sent += 1;
    } catch (err) {
      console.error(`[reminders] falha ao enviar Telegram (org ${org.id})`, err);
    }
  }
  if (org.whatsappPhoneNumber) {
    try {
      await sendWhatsAppMessage(org.whatsappPhoneNumber, text);
      sent += 1;
    } catch (err) {
      console.error(`[reminders] falha ao enviar WhatsApp (org ${org.id})`, err);
    }
  }
  return sent;
}

/** Processa lembretes de todas as organizações com algum canal configurado. Seguro de rodar repetidas vezes. */
export async function runReminders(db: Db, today: string = todaySP()): Promise<ReminderResult> {
  const organizations = await db.organization.findMany({
    where: { OR: [{ telegramChatId: { not: null } }, { whatsappPhoneNumber: { not: null } }] },
  });
  let messagesSent = 0;

  for (const org of organizations) {
    try {
      const dueTodayEntries = await db.entry.findMany({
        where: { organizationId: org.id, deletedAt: null, dueDate: toDate(today), dueTodayNotifiedAt: null },
        include: { settlements: true },
      });
      const dueSoonEntries = await db.entry.findMany({
        where: { organizationId: org.id, deletedAt: null, dueDate: toDate(addDays(today, 1)), dueSoonNotifiedAt: null },
        include: { settlements: true },
      });

      const openDueToday = dueTodayEntries.filter((entry) => deriveEntry(entry, today).remainingCents > 0);
      const openDueSoon = dueSoonEntries.filter((entry) => deriveEntry(entry, today).remainingCents > 0);

      if (openDueToday.length > 0) {
        messagesSent += await deliver(org, buildMessage("📅 Vencendo hoje:", openDueToday));
      }
      if (openDueSoon.length > 0) {
        messagesSent += await deliver(org, buildMessage("⏰ Vencendo amanhã:", openDueSoon));
      }

      if (dueTodayEntries.length > 0) {
        await db.entry.updateMany({
          where: { id: { in: dueTodayEntries.map((entry) => entry.id) } },
          data: { dueTodayNotifiedAt: new Date() },
        });
      }
      if (dueSoonEntries.length > 0) {
        await db.entry.updateMany({
          where: { id: { in: dueSoonEntries.map((entry) => entry.id) } },
          data: { dueSoonNotifiedAt: new Date() },
        });
      }
    } catch (err) {
      console.error(`[reminders] falha ao processar organização ${org.id}`, err);
    }
  }

  return { organizationsChecked: organizations.length, messagesSent };
}
