import "dotenv/config";
import { parseArgs } from "node:util";
import { createOrganizationSchema, createUserSchema } from "@fluxo/shared";
import { parse } from "../src/lib/validation.js";
import { createPrisma } from "../src/lib/prisma.js";
import { createOrganizationWithOwner } from "../src/services/organizations.js";

const { values } = parseArgs({
  options: {
    org: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
  },
});

const { name: orgName } = parse(createOrganizationSchema, { name: values.org });
const { name, email, password } = parse(createUserSchema, {
  name: values.name,
  email: values.email,
  password: values.password,
});

const prisma = createPrisma();

try {
  const result = await createOrganizationWithOwner(prisma, {
    organizationName: orgName,
    name,
    email,
    password,
  });
  console.log(`Organização criada: ${result.organization.name} (id: ${result.organization.id})`);
  console.log(`Usuário owner criado: ${result.user.name} <${result.user.email}>`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
