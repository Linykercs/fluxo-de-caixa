import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { startReminderScheduler } from "./lib/scheduler.js";
import { initWhatsApp } from "./services/whatsapp.js";

// whatsapp-web.js dispara promises internas sem await/catch (ex: requestPairingCode
// chamado dentro do próprio client.initialize()); uma rejeição não tratada aí
// derrubaria o processo inteiro — inclusive todo o resto do app — sem esse handler.
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled rejection (processo continua no ar)", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception (processo continua no ar)", err);
});

const app = buildApp();

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

startReminderScheduler(app.prisma);
initWhatsApp();
