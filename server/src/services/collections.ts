// Régua de cobrança automática: quando um "a receber" vencido (ainda em
// aberto) tem um cliente vinculado, manda cobrança pro CLIENTE (não pro
// dono da organização, diferente de reminders.ts) por Telegram e/ou
// WhatsApp, uma vez só por lançamento (Entry.collectionSentAt).
import { todaySP, toDate } from "../lib/dates.js";
import type { Db } from "../lib/prisma.js";
import { deriveEntry } from "./entries.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface OverdueEntryForMessage {
  description: string;
  amountCents: number;
  dueDate: Date;
}

function buildCollectionMessage(counterpartyName: string, entries: OverdueEntryForMessage[]): string {
  const lines = entries.map((e) => {
    const due = e.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/");
    return `• ${e.description} — ${formatCents(e.amountCents)} (venceu ${due})`;
  });
  const total = entries.reduce((sum, e) => sum + e.amountCents, 0);
  return [
    `Olá, ${counterpartyName}! Consta em aberto:`,
    "",
    ...lines,
    "",
    `Total: ${formatCents(total)}`,
    "",
    "Se já pagou, desconsidere este aviso.",
  ].join("\n");
}

interface NotifiableCounterparty {
  id: string;
  name: string;
  telegramChatId: string | null;
  phoneNumber: string | null;
}

async function deliver(counterparty: NotifiableCounterparty, text: string): Promise<number> {
  let sent = 0;
  if (counterparty.telegramChatId) {
    try {
      await sendTelegramMessage(counterparty.telegramChatId, text);
      sent += 1;
    } catch (err) {
      console.error(`[collections] falha ao enviar Telegram (counterparty ${counterparty.id})`, err);
    }
  }
  if (counterparty.phoneNumber) {
    try {
      await sendWhatsAppMessage(counterparty.phoneNumber, text);
      sent += 1;
    } catch (err) {
      console.error(`[collections] falha ao enviar WhatsApp (counterparty ${counterparty.id})`, err);
    }
  }
  return sent;
}

export interface CollectionResult {
  countersPartiesChecked: number;
  messagesSent: number;
}

/** Roda a régua de cobrança pra todos os clientes com lançamento vencido. Seguro de rodar repetidas vezes. */
export async function runCollections(db: Db, today: string = todaySP()): Promise<CollectionResult> {
  const overdueEntries = await db.entry.findMany({
    where: {
      direction: "RECEIVABLE",
      deletedAt: null,
      collectionSentAt: null,
      counterpartyId: { not: null },
      dueDate: { lt: toDate(today) },
    },
    include: {
      settlements: true,
      counterpartyRef: true,
    },
  });

  const openByCounterparty = new Map<
    string,
    { counterparty: NotifiableCounterparty; entries: (OverdueEntryForMessage & { id: string })[] }
  >();

  for (const entry of overdueEntries) {
    if (!entry.counterpartyRef) continue;
    if (deriveEntry(entry, today).remainingCents <= 0) continue;
    if (!entry.counterpartyRef.telegramChatId && !entry.counterpartyRef.phoneNumber) continue;

    const bucket = openByCounterparty.get(entry.counterpartyRef.id) ?? {
      counterparty: entry.counterpartyRef,
      entries: [],
    };
    bucket.entries.push({ id: entry.id, description: entry.description, amountCents: entry.amountCents, dueDate: entry.dueDate });
    openByCounterparty.set(entry.counterpartyRef.id, bucket);
  }

  let messagesSent = 0;
  for (const { counterparty, entries } of openByCounterparty.values()) {
    try {
      const text = buildCollectionMessage(counterparty.name, entries);
      messagesSent += await deliver(counterparty, text);
    } catch (err) {
      console.error(`[collections] falha ao processar cliente ${counterparty.id}`, err);
    }
  }

  // Marca TODAS as vencidas com cliente vinculado como processadas nessa rodada
  // (mesmo as que não geraram mensagem, ex: cliente sem canal configurado),
  // pra não ficar reavaliando o mesmo lançamento toda hora.
  if (overdueEntries.length > 0) {
    await db.entry.updateMany({
      where: { id: { in: overdueEntries.map((entry) => entry.id) } },
      data: { collectionSentAt: new Date() },
    });
  }

  return { countersPartiesChecked: openByCounterparty.size, messagesSent };
}
