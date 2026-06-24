// Centros de custo (Fase 11 F3): CRUD simples com arquivamento.
import { NotFoundError } from "../lib/errors";
import type { Db } from "../lib/prisma";

export async function listCostCenters(db: Db, organizationId: string) {
  return db.costCenter.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export interface CreateCostCenterInput {
  organizationId: string;
  name: string;
}

export async function createCostCenter(db: Db, input: CreateCostCenterInput) {
  return db.costCenter.create({ data: input });
}

export interface UpdateCostCenterChanges {
  name?: string;
  archived?: boolean;
}

/** Renomear e/ou arquivar/desarquivar. */
export async function updateCostCenter(db: Db, organizationId: string, costCenterId: string, changes: UpdateCostCenterChanges) {
  const costCenter = await db.costCenter.findFirst({ where: { id: costCenterId, organizationId } });
  if (!costCenter) {
    throw new NotFoundError("COST_CENTER_NOT_FOUND", "Centro de custo não encontrado");
  }
  return db.costCenter.update({
    where: { id: costCenterId },
    data: {
      name: changes.name,
      archivedAt: changes.archived === undefined ? undefined : changes.archived ? new Date() : null,
    },
  });
}
