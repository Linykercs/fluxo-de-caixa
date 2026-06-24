// Banco SQLite temporário por arquivo de teste, com as migrations reais
// aplicadas. Roda com cwd = server/ (vitest via npm -w server).
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrisma } from "../../src/lib/prisma";
import { toDate, todaySP } from "../../src/lib/dates";
import { createSingleEntry, getEntryOrThrow } from "../../src/services/entries";
import { createRecurrence } from "../../src/services/recurrences";
import { settleEntry } from "../../src/services/settlements";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tmpDir = path.join(serverRoot, ".tmp-test");

export async function createTestDb() {
  mkdirSync(tmpDir, { recursive: true });
  const name = `${randomUUID()}.db`;
  const prisma = createPrisma(`file:./.tmp-test/${name}`);

  const migrationsDir = path.join(serverRoot, "prisma", "migrations");
  const folders = readdirSync(migrationsDir)
    .filter((f) => existsSync(path.join(migrationsDir, f, "migration.sql")))
    .sort();
  for (const folder of folders) {
    const sql = readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }

  async function cleanup() {
    await prisma.$disconnect();
    for (const target of [name, `${name}-journal`, `${name}-wal`, `${name}-shm`]) {
      try {
        rmSync(path.join(tmpDir, target), { force: true });
      } catch {
        // Windows pode manter o arquivo travado por alguns instantes; a pasta
        // .tmp-test é gitignorada e pode ser limpa manualmente se necessário.
      }
    }
  }
  return { prisma, cleanup };
}

type TestPrisma = Awaited<ReturnType<typeof createTestDb>>["prisma"];

/** Org + user + 2 contas + categorias base, para os cenários dos services. */
export async function makeFixture(prisma: TestPrisma) {
  const org = await prisma.organization.create({ data: { name: "Org Teste" } });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: "Tester",
      email: `tester-${randomUUID()}@teste.dev`,
      passwordHash: "x",
    },
  });
  const account = await prisma.bankAccount.create({
    data: { organizationId: org.id, name: "Conta A", initialBalanceCents: 100_000 },
  });
  const account2 = await prisma.bankAccount.create({
    data: { organizationId: org.id, name: "Conta B", initialBalanceCents: 50_000 },
  });
  const expenseCat = await prisma.category.create({
    data: { organizationId: org.id, name: "Despesas gerais", kind: "EXPENSE" },
  });
  const incomeCat = await prisma.category.create({
    data: { organizationId: org.id, name: "Receitas gerais", kind: "INCOME" },
  });
  return { org, user, account, account2, expenseCat, incomeCat };
}

/**
 * Organização completa para testes de isolamento entre tenants: tudo de
 * `makeFixture` (renomeando a organização para `name`) + 1 CostCenter, 1
 * Entry em aberto (PAYABLE), 1 Entry (RECEIVABLE) com baixa ativa, e 1
 * Recurrence com sua entry do mês corrente materializada.
 */
export async function makeFullFixture(prisma: TestPrisma, name: string) {
  const base = await makeFixture(prisma);
  const org = await prisma.organization.update({ where: { id: base.org.id }, data: { name } });

  const costCenter = await prisma.costCenter.create({
    data: { organizationId: org.id, name: "Centro de custo" },
  });

  const openEntry = await createSingleEntry(prisma, {
    organizationId: org.id,
    direction: "PAYABLE",
    description: "Conta em aberto",
    counterparty: "Fornecedor",
    categoryId: base.expenseCat.id,
    amountCents: 10_000,
    dueDate: toDate("2026-07-10"),
  });

  const receivable = await createSingleEntry(prisma, {
    organizationId: org.id,
    direction: "RECEIVABLE",
    description: "Recebível baixado",
    counterparty: "Cliente",
    categoryId: base.incomeCat.id,
    amountCents: 5_000,
    dueDate: toDate("2026-07-10"),
  });
  const settlement = await settleEntry(prisma, {
    organizationId: org.id,
    entryId: receivable.id,
    amountCents: 5_000,
    settledAt: toDate("2026-06-10"),
    bankAccountId: base.account.id,
    userId: base.user.id,
  });
  const settledEntry = await getEntryOrThrow(prisma, org.id, receivable.id);

  const recurrence = await createRecurrence(prisma, {
    organizationId: org.id,
    direction: "PAYABLE",
    description: "Assinatura mensal",
    counterparty: "SaaS Ltda",
    categoryId: base.expenseCat.id,
    amountCents: 1_000,
    dueDay: 10,
    startMonth: todaySP().slice(0, 7),
  });
  const recurrenceEntry = await prisma.entry.findFirstOrThrow({
    where: { recurrenceId: recurrence.id, deletedAt: null },
    orderBy: { competenceMonth: "asc" },
  });

  return { ...base, org, costCenter, openEntry, settledEntry, settlement, recurrence, recurrenceEntry };
}
