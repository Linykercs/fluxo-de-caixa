import "dotenv/config";
import { parseArgs } from "node:util";
import argon2 from "argon2";
import { z } from "zod";
import { parse } from "../src/lib/validation.js";
import { createPrisma } from "../src/lib/prisma.js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
  },
});

const { email } = parse(
  z.object({ email: z.string().trim().toLowerCase().email() }),
  { email: values.email },
);
const { password } = parse(
  z.object({ password: z.string().min(8).max(120) }),
  { password: values.password },
);

const prisma = createPrisma();

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`Usuário não encontrado: ${email}`);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await argon2.hash(password) },
  });
  console.log(`Senha redefinida com sucesso para ${user.name} <${user.email}>`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
