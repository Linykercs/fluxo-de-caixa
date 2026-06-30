import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { startReminderScheduler } from "./lib/scheduler.js";

const app = buildApp();

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

startReminderScheduler(app.prisma);
