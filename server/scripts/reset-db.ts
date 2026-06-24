import "dotenv/config";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { applyMigrations } from "./apply-migrations.js";
import { assertDbWipeAllowed } from "../src/lib/db-guard.js";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

function removeSqliteFiles(url: string) {
  if (!url.startsWith("file:")) {
    throw new Error("db:reset only supports local SQLite file: URLs.");
  }

  const dbPath = path.resolve(url.slice("file:".length));
  for (const target of [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(target)) {
      rmSync(target, { force: true });
    }
  }
}

assertDbWipeAllowed();
removeSqliteFiles(databaseUrl);
await applyMigrations(databaseUrl);
