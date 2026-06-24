import argon2 from "argon2";
import type { CreateUserInput, UpdateProfileInput } from "@fluxo/shared";
import { BusinessError } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";

export async function listUsers(db: Db, organizationId: string) {
  return db.user.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createUser(db: Db, organizationId: string, input: CreateUserInput) {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new BusinessError("USER_EMAIL_EXISTS", "Ja existe um usuario com este e-mail");
  }

  return db.user.create({
    data: {
      organizationId,
      name: input.name,
      email: input.email,
      passwordHash: await argon2.hash(input.password),
      role: input.role ?? "OPERATOR",
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function changeUserRole(db: Db, organizationId: string, userId: string, role: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.organizationId !== organizationId) {
    throw new BusinessError("NOT_FOUND", "Usuário não encontrado");
  }
  return db.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function updateProfile(db: Db, userId: string, input: UpdateProfileInput) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw new BusinessError("INVALID_CREDENTIALS", "Senha atual incorreta");
  }

  if (input.email && input.email !== user.email) {
    const existing = await db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new BusinessError("USER_EMAIL_EXISTS", "Ja existe um usuario com este e-mail");
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.newPassword !== undefined) data.passwordHash = await argon2.hash(input.newPassword);

  return db.user.update({
    where: { id: userId },
    data,
    select: { id: true, organizationId: true, name: true, email: true },
  });
}
