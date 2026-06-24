// Centros de custo (Fase 11 F3): CRUD com arquivamento.
import type { FastifyInstance } from "fastify";
import { createCostCenterSchema, updateCostCenterSchema } from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { parse } from "../lib/validation.js";
import { createCostCenter, listCostCenters, updateCostCenter } from "../services/cost-centers.js";

export async function costCentersRoutes(app: FastifyInstance) {
  app.get("/cost-centers", async (request) => {
    return listCostCenters(app.prisma, request.user.organizationId);
  });

  app.post("/cost-centers", async (request, reply) => {
    assertAdmin(request);
    const input = parse(createCostCenterSchema, request.body);
    const costCenter = await createCostCenter(app.prisma, {
      organizationId: request.user.organizationId,
      name: input.name,
    });
    reply.code(201);
    return costCenter;
  });

  app.patch("/cost-centers/:id", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const input = parse(updateCostCenterSchema, request.body);
    return updateCostCenter(app.prisma, request.user.organizationId, id, input);
  });
}
