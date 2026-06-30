// Scheduler em processo, sem dependência externa: roda os lembretes 1x/hora.
// Não usar dentro de buildApp() — isso rodaria também nos testes.
import { config } from "./config.js";
import type { Prisma } from "./prisma.js";
import { runReminders } from "../services/reminders.js";

const HOUR_MS = 60 * 60 * 1000;

export function startReminderScheduler(prisma: Prisma, intervalMs: number = HOUR_MS): NodeJS.Timeout | null {
  if (!config.telegramBotToken) {
    console.warn("[reminders] TELEGRAM_BOT_TOKEN não configurado; lembretes desativados.");
    return null;
  }

  const tick = () => {
    runReminders(prisma).catch((err) => {
      console.error("[reminders] falha ao processar lembretes", err);
    });
  };

  tick();
  return setInterval(tick, intervalMs);
}
