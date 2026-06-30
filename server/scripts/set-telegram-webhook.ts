// Rodar uma vez (ou de novo se a URL pública mudar):
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... npx tsx scripts/set-telegram-webhook.ts https://fluxoserver-production.up.railway.app
import "dotenv/config";

const publicUrl = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!publicUrl || !token || !secret) {
  console.error("Uso: npx tsx scripts/set-telegram-webhook.ts <url-publica-do-servidor>");
  console.error("Requer TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET no ambiente.");
  process.exit(1);
}

const webhookUrl = `${publicUrl.replace(/\/$/, "")}/telegram/webhook/${secret}`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl }),
});
console.log(res.status, await res.text());
