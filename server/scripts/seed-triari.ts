import "dotenv/config";
import { parseArgs } from "node:util";
import { createPrisma } from "../src/lib/prisma.js";

const prisma = createPrisma();

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    costCenters: { type: "string" },
    bankAccounts: { type: "string" },
  },
});

function usage(): never {
  console.error(
    "Uso: tsx scripts/seed-triari.ts --email=dono@dominio.com " +
      '--costCenters="Obra A,Obra B" ' +
      '--bankAccounts=\'[{"name":"Banco","initialBalanceCents":0}]\'',
  );
  process.exit(1);
}

if (!values.email || !values.costCenters || !values.bankAccounts) {
  usage();
}

const ownerEmail = values.email;
const costCenterNames = values.costCenters.split(",").map((s) => s.trim()).filter(Boolean);

let bankAccounts: { name: string; initialBalanceCents: number }[];
try {
  bankAccounts = JSON.parse(values.bankAccounts);
} catch {
  console.error("--bankAccounts precisa ser um JSON válido.");
  usage();
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    throw new Error(`Usuário ${ownerEmail} não encontrado. Execute org:create primeiro.`);
  }
  const orgId = owner.organizationId;

  const existing = await prisma.category.count({ where: { organizationId: orgId } });
  if (existing > 0) {
    throw new Error(`Organização já tem ${existing} categorias. Seed abortado para evitar duplicatas.`);
  }

  console.log(`Seedando organização ${orgId}...`);

  // Categorias de despesa (FILTRO da planilha)
  const despesas = [
    "Mão de Obra",
    "Material",
    "Equipamentos",
    "Locação de Canteiro",
    "Cesta Básica",
    "Folha de Pagamento",
    "Vale Alimentação e Transporte",
    "Contabilidade",
    "Reembolso Pago",
    "Adiantamento",
    "Encargos de Folha",
    "Simples Nacional",
    "Confraternização Equipe",
    "Retirada de Lucros",
    "Taxas",
    "Reembolso a Receber",
    "Comissões de Vendas",
    "Rescisão",
    "Provisão 13º",
    "Provisão Férias",
    "Despesas Administrativas",
    "Internet",
  ];

  // Categorias de receita
  const receitas = [
    "Receita do Mês",
    "Receita Mês Anterior",
    "Reembolso Recebido",
    "Venda de Material",
    "Gratificação",
    "Juros Recebidos",
    "Outras Receitas",
  ];

  for (const name of despesas) {
    await prisma.category.create({ data: { organizationId: orgId, name, kind: "EXPENSE" } });
  }
  console.log(`${despesas.length} categorias de despesa criadas.`);

  for (const name of receitas) {
    await prisma.category.create({ data: { organizationId: orgId, name, kind: "INCOME" } });
  }
  console.log(`${receitas.length} categorias de receita criadas.`);

  // Centros de custo (obras ativas)
  for (const name of costCenterNames) {
    await prisma.costCenter.create({ data: { organizationId: orgId, name } });
  }
  console.log(`${costCenterNames.length} centros de custo criados.`);

  // Contas bancárias com saldo inicial
  await prisma.bankAccount.createMany({
    data: bankAccounts.map((b) => ({ organizationId: orgId, name: b.name, initialBalanceCents: b.initialBalanceCents })),
  });
  console.log(`${bankAccounts.length} contas bancárias criadas.`);

  console.log("Seed concluido!");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
