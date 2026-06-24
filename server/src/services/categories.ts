// Categorias (spec §6): CRUD simples com tipo e arquivamento.
import { NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";

export async function listCategories(db: Db, organizationId: string, kind?: "EXPENSE" | "INCOME") {
  return db.category.findMany({
    where: { organizationId, ...(kind ? { kind } : {}) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export interface CreateCategoryInput {
  organizationId: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
}

export async function createCategory(db: Db, input: CreateCategoryInput) {
  return db.category.create({ data: input });
}

export interface UpdateCategoryChanges {
  name?: string;
  archived?: boolean;
}

/** Renomear e/ou arquivar/desarquivar. */
export async function updateCategory(db: Db, organizationId: string, categoryId: string, changes: UpdateCategoryChanges) {
  const category = await db.category.findFirst({ where: { id: categoryId, organizationId } });
  if (!category) {
    throw new NotFoundError("CATEGORY_NOT_FOUND", "Categoria não encontrada");
  }
  return db.category.update({
    where: { id: categoryId },
    data: {
      name: changes.name,
      archivedAt: changes.archived === undefined ? undefined : changes.archived ? new Date() : null,
    },
  });
}
