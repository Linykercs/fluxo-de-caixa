// Categorias (spec §6): CRUD com tipo e arquivamento.
import type { FastifyInstance } from "fastify";
import { categoryListQuerySchema, createCategorySchema, updateCategorySchema } from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { parse } from "../lib/validation.js";
import { createCategory, listCategories, updateCategory } from "../services/categories.js";

export async function categoriesRoutes(app: FastifyInstance) {
  app.get("/categories", async (request) => {
    const query = parse(categoryListQuerySchema, request.query);
    return listCategories(app.prisma, request.user.organizationId, query.kind);
  });

  app.post("/categories", async (request, reply) => {
    assertAdmin(request);
    const input = parse(createCategorySchema, request.body);
    const category = await createCategory(app.prisma, {
      organizationId: request.user.organizationId,
      name: input.name,
      kind: input.kind,
    });
    reply.code(201);
    return category;
  });

  app.patch("/categories/:id", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    const input = parse(updateCategorySchema, request.body);
    return updateCategory(app.prisma, request.user.organizationId, id, input);
  });
}
