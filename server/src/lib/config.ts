// Constantes da v1 (spec seção 2): Brasil fixo. Trocar aqui quando houver
// fuso/moeda configurável por organização.
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("Variável de ambiente JWT_SECRET é obrigatória em produção.");
}

export const config = {
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  port: Number(process.env.PORT ?? 3333),
  host: process.env.HOST ?? "127.0.0.1",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-apenas-local",
  cookieName: "fluxo_session",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  isProduction,
  serveWeb: process.env.SERVE_WEB === "true" || isProduction,
  webDistPath: process.env.WEB_DIST_PATH ?? "../web/dist",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? null,
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
  // Sessão única e global do WhatsApp não-oficial (Baileys, protocolo direto via
  // WebSocket); opt-in mesmo com as outras variáveis presentes.
  whatsappEnabled: process.env.WHATSAPP_ENABLED === "true",
  whatsappSessionPath: process.env.WHATSAPP_SESSION_PATH ?? "./.whatsapp-session",
  // Se setado, usa pareamento por código (digitado no celular) em vez de QR code
  // pra vincular a sessão. Esse é o número do CELULAR QUE VAI SER O BOT, não o
  // de nenhuma organização cliente.
  whatsappPairingPhoneNumber: process.env.WHATSAPP_PAIRING_PHONE_NUMBER ?? null,
} as const;
