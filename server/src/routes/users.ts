import type { FastifyInstance } from "fastify";
import { changeUserRoleSchema, createUserSchema, updateProfileSchema } from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { BusinessError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";
import { changeUserRole, createUser, listUsers, updateProfile } from "../services/users.js";

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users", async (request) => {
    return listUsers(app.prisma, request.user.organizationId);
  });

  app.post("/users", async (request, reply) => {
    assertAdmin(request);
    const input = parse(createUserSchema, request.body);
    const user = await createUser(app.prisma, request.user.organizationId, input);
    reply.code(201);
    return user;
  });

  app.patch("/users/me", async (request) => {
    const input = parse(updateProfileSchema, request.body);
    return updateProfile(app.prisma, request.user.sub, input);
  });

  app.patch("/users/:id/role", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    if (id === request.user.sub) {
      throw new BusinessError("FORBIDDEN", "Não é possível alterar o próprio perfil.");
    }
    const input = parse(changeUserRoleSchema, request.body);
    return changeUserRole(app.prisma, request.user.organizationId, id, input.role);
  });
}
