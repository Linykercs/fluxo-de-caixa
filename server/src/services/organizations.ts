// Fechamento de mês (spec §8/F6): cursor único por organização.
import argon2 from "argon2";
import { BusinessError } from "../lib/errors.js";
import type { Db, Prisma } from "../lib/prisma.js";

/** Mês até o qual lançamentos estão bloqueados ("YYYY-MM"), ou null se nenhum. */
export async function getClosedThroughMonth(db: Db, organizationId: string): Promise<string | null> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return organization.closedThroughMonth;
}

/** Define o cursor de fechamento; um mês anterior ao atual "reabre" os meses entre os dois. */
export async function setClosedThroughMonth(
  db: Db,
  organizationId: string,
  month: string,
): Promise<string | null> {
  const organization = await db.organization.update({
    where: { id: organizationId },
    data: { closedThroughMonth: month },
  });
  return organization.closedThroughMonth;
}

/** Cria uma nova organização com seu usuário owner em uma única transação. */
export async function createOrganizationWithOwner(
  prisma: Prisma,
  input: { organizationName: string; name: string; email: string; password: string },
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new BusinessError("USER_EMAIL_EXISTS", "Ja existe um usuario com este e-mail");
  }

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: input.organizationName } });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        email: input.email,
        passwordHash: await argon2.hash(input.password),
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        email: true,
      },
    });
    return { organization, user };
  });
}
