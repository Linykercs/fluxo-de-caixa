import type { FastifyRequest } from "fastify";
import { BusinessError } from "./errors.js";

export function assertAdmin(request: FastifyRequest): void {
  if (request.user.role !== "ADMIN") {
    throw new BusinessError("FORBIDDEN", "Acesso restrito a administradores.");
  }
}
