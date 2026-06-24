// Conferência rápida do seed (substitui a checagem manual via prisma studio).
import { createPrisma } from "../src/lib/prisma";

const p = createPrisma();

async function main() {
  const entries = await p.entry.count();
  for (const a of await p.bankAccount.findMany()) {
    const sum = await p.movement.aggregate({
      where: { bankAccountId: a.id },
      _sum: { amountCents: true },
    });
    console.log(
      `${a.name}: inicial ${a.initialBalanceCents} | saldo derivado ${a.initialBalanceCents + (sum._sum.amountCents ?? 0)}`,
    );
  }
  const parc = await p.entry.aggregate({
    where: { installmentGroupId: { not: null } },
    _sum: { amountCents: true },
    _count: true,
  });
  console.log(`entries: ${entries} | parcelas: ${parc._count} somando ${parc._sum.amountCents}`);
  const reversals = await p.settlement.count({ where: { reversalOfId: { not: null } } });
  const negatives = await p.settlement.count({ where: { amountCents: { lt: 0 } } });
  console.log(`estornos: ${reversals} | settlements negativas: ${negatives}`);
}

main().finally(() => p.$disconnect());
