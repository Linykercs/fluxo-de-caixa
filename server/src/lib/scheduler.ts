// Scheduler em processo, sem dependência externa: roda os lembretes e a
// régua de cobrança 1x/hora. Não usar dentro de buildApp() — isso rodaria
// também nos testes.
import { config } from "./config.js";
import type { Prisma } from "./prisma.js";
import { runCollections } from "../services/collections.js";
import { runReminders } from "../services/reminders.js";

const HOUR_MS = 60 * 60 * 1000;

export function startReminderScheduler(prisma: Prisma, intervalMs: number = HOUR_MS): NodeJS.Timeout | null {
  if (!config.telegramBotToken && !config.whatsappEnabled) {
    console.warn("[reminders] nenhum canal (Telegram/WhatsApp) configurado; lembretes e cobrança desativados.");
    return null;
  }

  const tick = () => {
    runReminders(prisma).catch((err) => {
      console.error("[reminders] falha ao processar lembretes", err);
    });
    runCollections(prisma).catch((err) => {
      console.error("[collections] falha ao processar cobrança automática", err);
    });
  };

  tick();
  return setInterval(tick, intervalMs);
}
