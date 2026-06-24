import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient, type Prisma as PrismaNS } from "../generated/prisma/client";

// Services aceitam tanto o client quanto um client transacional.
export type Db = PrismaClient | PrismaNS.TransactionClient;

// Testes criam instâncias próprias apontando para um arquivo temporário.
export function createPrisma(
  url = process.env.DATABASE_URL ?? "file:./prisma/dev.db",
) {
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

export type Prisma = ReturnType<typeof createPrisma>;

export const prisma = createPrisma();
