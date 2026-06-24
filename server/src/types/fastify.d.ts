import type { Prisma } from "../lib/prisma";

declare module "fastify" {
  interface FastifyInstance {
    prisma: Prisma;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      organizationId: string;
      name: string;
      email: string;
      role: string;
    };
    user: {
      sub: string;
      organizationId: string;
      name: string;
      email: string;
      role: string;
    };
  }
}
