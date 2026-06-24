import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const migrationsDir = path.resolve("prisma", "migrations");

function ensureSqliteDir(url: string) {
  if (!url.startsWith("file:")) return;
  const dbPath = url.slice("file:".length);
  if (!dbPath || dbPath === ":memory:") return;
  const dir = path.dirname(path.resolve(dbPath));
  mkdirSync(dir, { recursive: true });
}

function splitSql(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function applyMigrations(url = databaseUrl) {
  ensureSqliteDir(url);

  const client = createClient({ url });
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_fluxo_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = await client.execute(`SELECT "name" FROM "_fluxo_migrations"`);
  const appliedNames = new Set(applied.rows.map((row) => String(row.name)));

  const folders = readdirSync(migrationsDir)
    .filter((folder) => existsSync(path.join(migrationsDir, folder, "migration.sql")))
    .sort();

  for (const folder of folders) {
    if (appliedNames.has(folder)) continue;

    const sql = readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8");
    await client.execute("BEGIN");
    try {
      for (const statement of splitSql(sql)) {
        await client.execute(statement);
      }
      await client.execute({
        sql: `INSERT INTO "_fluxo_migrations" ("name") VALUES (?)`,
        args: [folder],
      });
      await client.execute("COMMIT");
      console.log(`Migration applied: ${folder}`);
    } catch (error) {
      await client.execute("ROLLBACK");
      throw error;
    }
  }

  if (folders.every((folder) => appliedNames.has(folder))) {
    console.log("No pending migrations.");
  }

  client.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyMigrations().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
