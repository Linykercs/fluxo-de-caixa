// Seed conforme spec seção 9: 1 org, 2 users, 2 contas, 8 categorias e ~6 meses
// de lançamentos (mar–ago/2026) cobrindo pagas, recebidas, em aberto, vencidas,
// parcial, 1 estorno, parcelamento 6x, 2 recorrências e 1 transferência.
// Idempotente por reconstrução: apaga tudo e recria o mesmo estado.
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { calendarDate, spDayStart } from "../src/lib/dates";
import { assertDbWipeAllowed } from "../src/lib/db-guard";
import { createPrisma } from "../src/lib/prisma";

const prisma = createPrisma();

type Direction = "PAYABLE" | "RECEIVABLE";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const movementDay = (date: Date) => spDayStart(calendarDate(date));

/** "2026-03" + 2 → "2026-05" */
function addMonths(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = (y as number) * 12 + ((m as number) - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Vencimento da recorrência no mês, com clamp para meses curtos. */
function dueDateInMonth(month: string, dueDay: number): Date {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y as number, m as number, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return d(`${month}-${String(day).padStart(2, "0")}`);
}

async function wipe() {
  await prisma.movement.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.recurrence.deleteMany();
  await prisma.category.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  assertDbWipeAllowed();
  await wipe();

  const org = await prisma.organization.create({
    data: { name: "Oficina Criativa Ltda" },
  });
  const orgId = org.id;

  const passwordHash = await argon2.hash("senha123");
  const ana = await prisma.user.create({
    data: { organizationId: orgId, name: "Ana Souza", email: "ana@empresa.com.br", passwordHash },
  });
  const bruno = await prisma.user.create({
    data: { organizationId: orgId, name: "Bruno Lima", email: "bruno@empresa.com.br", passwordHash },
  });

  const itau = await prisma.bankAccount.create({
    data: { organizationId: orgId, name: "Itaú PJ", initialBalanceCents: 1_500_000 },
  });
  const nubank = await prisma.bankAccount.create({
    data: { organizationId: orgId, name: "Nubank PJ", initialBalanceCents: 450_000 },
  });

  const cats = Object.fromEntries(
    await Promise.all(
      (
        [
          ["Aluguel", "EXPENSE"],
          ["Fornecedores", "EXPENSE"],
          ["Impostos", "EXPENSE"],
          ["Utilidades", "EXPENSE"],
          ["Salários", "EXPENSE"],
          ["Vendas", "INCOME"],
          ["Serviços", "INCOME"],
          ["Outros", "EXPENSE"],
        ] as const
      ).map(async ([name, kind]) => {
        const c = await prisma.category.create({
          data: { organizationId: orgId, name, kind },
        });
        return [name, c] as const;
      }),
    ),
  );

  // --- helpers de criação ---

  async function createEntry(data: {
    direction: Direction;
    description: string;
    counterparty: string;
    categoryId: string;
    amountCents: number;
    competenceMonth: string;
    dueDate: Date;
    notes?: string;
    recurrenceId?: string;
    installmentGroupId?: string;
    installmentNumber?: number;
    installmentTotal?: number;
  }) {
    return prisma.entry.create({ data: { organizationId: orgId, ...data } });
  }

  /** Baixa: Settlement + Movement com sinal pela direção (regra do spec §5). */
  async function settle(
    entry: { id: string; direction: string; description: string },
    opts: { amountCents: number; settledAt: Date; bankAccountId: string; userId: string; notes?: string },
  ) {
    const sign = entry.direction === "PAYABLE" ? -1 : 1;
    const settlement = await prisma.settlement.create({
      data: {
        organizationId: orgId,
        entryId: entry.id,
        amountCents: opts.amountCents,
        settledAt: opts.settledAt,
        bankAccountId: opts.bankAccountId,
        userId: opts.userId,
        notes: opts.notes,
      },
    });
    await prisma.movement.create({
      data: {
        organizationId: orgId,
        bankAccountId: opts.bankAccountId,
        amountCents: sign * opts.amountCents,
        type: "SETTLEMENT",
        settlementId: settlement.id,
        userId: opts.userId,
        description: `Baixa: ${entry.description}`,
        createdAt: movementDay(opts.settledAt),
      },
    });
    return settlement;
  }

  /** Estorno: settlement negativa vinculada + movement oposto (spec §5). */
  async function reverse(
    original: { id: string; entryId: string; amountCents: number; bankAccountId: string },
    entry: { direction: string; description: string },
    opts: { reversedAt: Date; userId: string },
  ) {
    const sign = entry.direction === "PAYABLE" ? -1 : 1;
    const reversal = await prisma.settlement.create({
      data: {
        organizationId: orgId,
        entryId: original.entryId,
        amountCents: -original.amountCents,
        settledAt: opts.reversedAt,
        bankAccountId: original.bankAccountId,
        userId: opts.userId,
        reversalOfId: original.id,
      },
    });
    await prisma.settlement.update({
      where: { id: original.id },
      data: { reversedById: reversal.id },
    });
    await prisma.movement.create({
      data: {
        organizationId: orgId,
        bankAccountId: original.bankAccountId,
        amountCents: -sign * original.amountCents,
        type: "REVERSAL",
        settlementId: reversal.id,
        userId: opts.userId,
        description: `Estorno: ${entry.description}`,
        createdAt: movementDay(opts.reversedAt),
      },
    });
    return reversal;
  }

  // --- Recorrência 1 (despesa): aluguel, dia 5, mar/2026 em diante ---
  const recAluguel = await prisma.recurrence.create({
    data: {
      organizationId: orgId,
      direction: "PAYABLE",
      description: "Aluguel do escritório",
      counterparty: "Imobiliária Central",
      categoryId: cats["Aluguel"]!.id,
      amountCents: 350_000,
      dueDay: 5,
      startMonth: "2026-03",
    },
  });
  const aluguelEntries: Awaited<ReturnType<typeof createEntry>>[] = [];
  for (let i = 0; i < 12; i++) {
    const month = addMonths("2026-03", i);
    aluguelEntries.push(
      await createEntry({
        direction: "PAYABLE",
        description: "Aluguel do escritório",
        counterparty: "Imobiliária Central",
        categoryId: cats["Aluguel"]!.id,
        amountCents: 350_000,
        competenceMonth: month,
        dueDate: dueDateInMonth(month, 5),
        recurrenceId: recAluguel.id,
      }),
    );
  }
  // materializedUntil precisa cobrir as 12 entries já criadas acima, senão
  // ensureHorizon as duplica na primeira chamada (ela acha que está "atrasada").
  await prisma.recurrence.update({
    where: { id: recAluguel.id },
    data: { materializedUntil: addMonths("2026-03", 11) },
  });
  // mar–mai pagas; jun/2026 em aberto e vencida (hoje: 2026-06-12)
  await settle(aluguelEntries[0]!, { amountCents: 350_000, settledAt: d("2026-03-05"), bankAccountId: itau.id, userId: ana.id });
  await settle(aluguelEntries[1]!, { amountCents: 350_000, settledAt: d("2026-04-06"), bankAccountId: itau.id, userId: ana.id });
  await settle(aluguelEntries[2]!, { amountCents: 350_000, settledAt: d("2026-05-05"), bankAccountId: itau.id, userId: bruno.id });

  // --- Recorrência 2 (receita): mensalidade ACME, dia 15 ---
  const recAcme = await prisma.recurrence.create({
    data: {
      organizationId: orgId,
      direction: "RECEIVABLE",
      description: "Mensalidade de suporte — ACME",
      counterparty: "ACME Ltda",
      categoryId: cats["Serviços"]!.id,
      amountCents: 420_000,
      dueDay: 15,
      startMonth: "2026-03",
    },
  });
  const acmeEntries: Awaited<ReturnType<typeof createEntry>>[] = [];
  for (let i = 0; i < 12; i++) {
    const month = addMonths("2026-03", i);
    acmeEntries.push(
      await createEntry({
        direction: "RECEIVABLE",
        description: "Mensalidade de suporte — ACME",
        counterparty: "ACME Ltda",
        categoryId: cats["Serviços"]!.id,
        amountCents: 420_000,
        competenceMonth: month,
        dueDate: dueDateInMonth(month, 15),
        recurrenceId: recAcme.id,
      }),
    );
  }
  // ver comentário acima sobre materializedUntil
  await prisma.recurrence.update({
    where: { id: recAcme.id },
    data: { materializedUntil: addMonths("2026-03", 11) },
  });
  // mar–mai recebidas; jun em aberto (vence 15/06: alerta "próximos 7 dias")
  await settle(acmeEntries[0]!, { amountCents: 420_000, settledAt: d("2026-03-16"), bankAccountId: itau.id, userId: ana.id });
  await settle(acmeEntries[1]!, { amountCents: 420_000, settledAt: d("2026-04-15"), bankAccountId: itau.id, userId: ana.id });
  await settle(acmeEntries[2]!, { amountCents: 420_000, settledAt: d("2026-05-15"), bankAccountId: nubank.id, userId: bruno.id });

  // --- Parcelamento 6x: total R$ 6.500,00 → 5× 1083,33 + 1× 1083,35 ---
  const groupId = randomUUID();
  const total = 650_000;
  const n = 6;
  const base = Math.floor(total / n);
  const installments: Awaited<ReturnType<typeof createEntry>>[] = [];
  for (let i = 0; i < n; i++) {
    const month = addMonths("2026-04", i);
    const amount = i === n - 1 ? total - base * (n - 1) : base;
    installments.push(
      await createEntry({
        direction: "PAYABLE",
        description: `Notebooks Dell (${i + 1}/${n})`,
        counterparty: "Dell Computadores",
        categoryId: cats["Fornecedores"]!.id,
        amountCents: amount,
        competenceMonth: month,
        dueDate: dueDateInMonth(month, 15),
        installmentGroupId: groupId,
        installmentNumber: i + 1,
        installmentTotal: n,
      }),
    );
  }
  await settle(installments[0]!, { amountCents: installments[0]!.amountCents, settledAt: d("2026-04-15"), bankAccountId: itau.id, userId: ana.id });
  await settle(installments[1]!, { amountCents: installments[1]!.amountCents, settledAt: d("2026-05-15"), bankAccountId: itau.id, userId: ana.id });

  // --- Salários (mar–jun) ---
  const salarios = [
    { month: "2026-03", due: "2026-03-31", paidAt: "2026-03-31", by: ana },
    { month: "2026-04", due: "2026-04-30", paidAt: "2026-04-30", by: ana },
    { month: "2026-05", due: "2026-05-29", paidAt: "2026-05-29", by: bruno },
    { month: "2026-06", due: "2026-06-30", paidAt: null, by: null },
  ];
  for (const s of salarios) {
    const entry = await createEntry({
      direction: "PAYABLE",
      description: "Folha de pagamento",
      counterparty: "Equipe",
      categoryId: cats["Salários"]!.id,
      amountCents: 520_000,
      competenceMonth: s.month,
      dueDate: d(s.due),
    });
    if (s.paidAt && s.by) {
      await settle(entry, { amountCents: 520_000, settledAt: d(s.paidAt), bankAccountId: itau.id, userId: s.by.id });
    }
  }

  // --- Avulsas ---
  const energia = await createEntry({
    direction: "PAYABLE",
    description: "Energia elétrica",
    counterparty: "Enel",
    categoryId: cats["Utilidades"]!.id,
    amountCents: 38_750,
    competenceMonth: "2026-05",
    dueDate: d("2026-05-20"),
  });
  await settle(energia, { amountCents: 38_750, settledAt: d("2026-05-20"), bankAccountId: nubank.id, userId: bruno.id });

  await createEntry({
    direction: "PAYABLE",
    description: "DAS — Simples Nacional",
    counterparty: "Receita Federal",
    categoryId: cats["Impostos"]!.id,
    amountCents: 187_600,
    competenceMonth: "2026-06",
    dueDate: d("2026-06-20"),
  });

  // vencida em aberto
  await createEntry({
    direction: "PAYABLE",
    description: "Matéria-prima — pedido 1042",
    counterparty: "Fornecedor Gama",
    categoryId: cats["Fornecedores"]!.id,
    amountCents: 96_000,
    competenceMonth: "2026-05",
    dueDate: d("2026-05-28"),
  });

  // recebível com baixa parcial (vencida com resto)
  const projetoSite = await createEntry({
    direction: "RECEIVABLE",
    description: "Projeto site institucional",
    counterparty: "Cliente Beta",
    categoryId: cats["Vendas"]!.id,
    amountCents: 800_000,
    competenceMonth: "2026-05",
    dueDate: d("2026-05-30"),
  });
  await settle(projetoSite, {
    amountCents: 500_000,
    settledAt: d("2026-06-01"),
    bankAccountId: itau.id,
    userId: ana.id,
    notes: "Entrada de 62,5%; restante na entrega",
  });

  // estorno: paga da conta errada, estornada e paga da conta certa
  const internet = await createEntry({
    direction: "PAYABLE",
    description: "Internet fibra",
    counterparty: "Vivo Empresas",
    categoryId: cats["Utilidades"]!.id,
    amountCents: 25_000,
    competenceMonth: "2026-04",
    dueDate: d("2026-04-10"),
  });
  const sErrada = await settle(internet, { amountCents: 25_000, settledAt: d("2026-04-10"), bankAccountId: nubank.id, userId: bruno.id, notes: "Paga da conta errada" });
  await reverse(sErrada, internet, { reversedAt: d("2026-04-11"), userId: ana.id });
  await settle(internet, { amountCents: 25_000, settledAt: d("2026-04-11"), bankAccountId: itau.id, userId: ana.id });

  // competência maio recebida em junho (previsto x realizado em meses diferentes)
  const lote42 = await createEntry({
    direction: "RECEIVABLE",
    description: "Venda — lote 42",
    counterparty: "Cliente Delta",
    categoryId: cats["Vendas"]!.id,
    amountCents: 1_250_000,
    competenceMonth: "2026-05",
    dueDate: d("2026-05-31"),
  });
  await settle(lote42, { amountCents: 1_250_000, settledAt: d("2026-06-02"), bankAccountId: itau.id, userId: ana.id });

  // futuras
  await createEntry({
    direction: "RECEIVABLE",
    description: "Consultoria — fase 2",
    counterparty: "Cliente Épsilon",
    categoryId: cats["Serviços"]!.id,
    amountCents: 460_000,
    competenceMonth: "2026-07",
    dueDate: d("2026-07-10"),
  });
  await createEntry({
    direction: "PAYABLE",
    description: "Seguro empresarial anual",
    counterparty: "Porto Seguro",
    categoryId: cats["Outros"]!.id,
    amountCents: 134_000,
    competenceMonth: "2026-08",
    dueDate: d("2026-08-05"),
  });

  // --- Transferência entre contas: Itaú → Nubank ---
  const transfer = await prisma.transfer.create({
    data: {
      organizationId: orgId,
      fromAccountId: itau.id,
      toAccountId: nubank.id,
      amountCents: 200_000,
      date: d("2026-06-01"),
      userId: ana.id,
      notes: "Reforço de saldo para débitos automáticos",
    },
  });
  await prisma.movement.create({
    data: {
      organizationId: orgId,
      bankAccountId: itau.id,
      amountCents: -200_000,
      type: "TRANSFER_OUT",
      transferId: transfer.id,
      userId: ana.id,
      description: "Transferência para Nubank PJ",
      createdAt: spDayStart("2026-06-01"),
    },
  });
  await prisma.movement.create({
    data: {
      organizationId: orgId,
      bankAccountId: nubank.id,
      amountCents: 200_000,
      type: "TRANSFER_IN",
      transferId: transfer.id,
      userId: ana.id,
      description: "Transferência de Itaú PJ",
      createdAt: spDayStart("2026-06-01"),
    },
  });

  // --- resumo ---
  const counts = {
    entries: await prisma.entry.count(),
    settlements: await prisma.settlement.count(),
    movements: await prisma.movement.count(),
    recurrences: await prisma.recurrence.count(),
    transfers: await prisma.transfer.count(),
  };
  console.log("Seed concluído:", counts);
  console.log("Login: ana@empresa.com.br / bruno@empresa.com.br — senha: senha123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
