// Saldo é derivado, nunca editado: inicial + Σ movimentações (spec §3.2).
import { addDays, calendarDate, spDayStart } from "../lib/dates";
import { NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";

export async function getAccountBalanceCents(db: Db, organizationId: string, bankAccountId: string): Promise<number> {
  const account = await db.bankAccount.findFirst({ where: { id: bankAccountId, organizationId } });
  if (!account) {
    throw new NotFoundError("BANK_ACCOUNT_NOT_FOUND", "Conta bancária não encontrada");
  }
  const sum = await db.movement.aggregate({
    where: { bankAccountId },
    _sum: { amountCents: true },
  });
  return account.initialBalanceCents + (sum._sum.amountCents ?? 0);
}

/** Contas da organização com saldo derivado (arquivadas opcionais). */
export async function listAccountsWithBalances(
  db: Db,
  organizationId: string,
  opts: { includeArchived?: boolean } = {},
) {
  const accounts = await db.bankAccount.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
  const sums = await db.movement.groupBy({
    by: ["bankAccountId"],
    where: { organizationId },
    _sum: { amountCents: true },
  });
  const byAccount = new Map(sums.map((s) => [s.bankAccountId, s._sum.amountCents ?? 0]));
  return accounts.map((a) => ({
    ...a,
    balanceCents: a.initialBalanceCents + (byAccount.get(a.id) ?? 0),
  }));
}

/** Soma dos saldos derivados das contas ativas da organização (spec §5). */
export async function getTotalBalanceCents(db: Db, organizationId: string): Promise<number> {
  const accounts = await listAccountsWithBalances(db, organizationId);
  return accounts.reduce((sum, a) => sum + a.balanceCents, 0);
}

export interface CreateBankAccountInput {
  organizationId: string;
  name: string;
  initialBalanceCents: number;
}

export async function createBankAccount(db: Db, input: CreateBankAccountInput) {
  return db.bankAccount.create({ data: input });
}

export interface UpdateBankAccountChanges {
  name?: string;
  archived?: boolean;
}

/** Renomear e/ou arquivar/desarquivar (spec §6: "renomear / arquivar"). */
export async function updateBankAccount(db: Db, organizationId: string, bankAccountId: string, changes: UpdateBankAccountChanges) {
  const account = await db.bankAccount.findFirst({ where: { id: bankAccountId, organizationId } });
  if (!account) {
    throw new NotFoundError("BANK_ACCOUNT_NOT_FOUND", "Conta bancária não encontrada");
  }
  return db.bankAccount.update({
    where: { id: bankAccountId },
    data: {
      name: changes.name,
      archivedAt: changes.archived === undefined ? undefined : changes.archived ? new Date() : null,
    },
  });
}

export interface StatementLine {
  id: string;
  date: string;
  type: string;
  amountCents: number;
  description: string;
  balanceCents: number;
}

export interface Statement {
  accountId: string;
  accountName: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  lines: StatementLine[];
}

/** Extrato com saldo corrente (spec §6): movimentações no período, acumulando a partir do saldo de abertura. */
export async function getStatement(
  db: Db,
  organizationId: string,
  bankAccountId: string,
  opts: { from?: string; to?: string } = {},
): Promise<Statement> {
  const account = await db.bankAccount.findFirst({ where: { id: bankAccountId, organizationId } });
  if (!account) {
    throw new NotFoundError("BANK_ACCOUNT_NOT_FOUND", "Conta bancária não encontrada");
  }

  let openingBalanceCents = account.initialBalanceCents;
  if (opts.from) {
    const before = await db.movement.aggregate({
      where: { bankAccountId, createdAt: { lt: spDayStart(opts.from) } },
      _sum: { amountCents: true },
    });
    openingBalanceCents += before._sum.amountCents ?? 0;
  }

  const createdAtFilter: { gte?: Date; lt?: Date } = {};
  if (opts.from) createdAtFilter.gte = spDayStart(opts.from);
  if (opts.to) createdAtFilter.lt = spDayStart(addDays(opts.to, 1));

  const movements = await db.movement.findMany({
    where: {
      bankAccountId,
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  let balanceCents = openingBalanceCents;
  const lines = movements.map((m) => {
    balanceCents += m.amountCents;
    return {
      id: m.id,
      date: calendarDate(m.createdAt),
      type: m.type,
      amountCents: m.amountCents,
      description: m.description,
      balanceCents,
    };
  });

  return {
    accountId: account.id,
    accountName: account.name,
    openingBalanceCents,
    closingBalanceCents: balanceCents,
    lines,
  };
}
