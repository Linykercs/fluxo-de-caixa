// Importação de extrato OFX (spec §6): preview (sem persistir) + confirm (linha a linha).
import type { FastifyInstance } from "fastify";
import { importConfirmSchema } from "@fluxo/shared";
import { assertAdmin } from "../lib/auth.js";
import { BusinessError, NotFoundError } from "../lib/errors.js";
import { parse, ValidationError } from "../lib/validation.js";
import { confirmImportRow, previewImport } from "../services/bank-import.js";
import { parseOfx } from "../services/ofx-parser.js";

async function getActiveBankAccount(app: FastifyInstance, organizationId: string, id: string) {
  const account = await app.prisma.bankAccount.findFirst({ where: { id, organizationId } });
  if (!account) {
    throw new NotFoundError("BANK_ACCOUNT_NOT_FOUND", "Conta bancária não encontrada");
  }
  if (account.archivedAt) {
    throw new BusinessError("BANK_ACCOUNT_ARCHIVED", "Conta bancária arquivada não importa extratos");
  }
  return account;
}

export async function bankImportRoutes(app: FastifyInstance) {
  app.post("/bank-accounts/:id/import/preview", async (request) => {
    const { id } = request.params as { id: string };
    await getActiveBankAccount(app, request.user.organizationId, id);

    const file = await request.file();
    if (!file) {
      throw new ValidationError("file", "Arquivo OFX é obrigatório");
    }
    const content = (await file.toBuffer()).toString("utf-8");

    return previewImport(app.prisma, {
      organizationId: request.user.organizationId,
      bankAccountId: id,
      transactions: parseOfx(content),
    });
  });

  app.post("/bank-accounts/:id/import/confirm", async (request) => {
    assertAdmin(request);
    const { id } = request.params as { id: string };
    await getActiveBankAccount(app, request.user.organizationId, id);
    const rows = parse(importConfirmSchema, request.body);

    const results = [];
    for (const row of rows) {
      results.push(
        await confirmImportRow(app.prisma, {
          organizationId: request.user.organizationId,
          bankAccountId: id,
          userId: request.user.sub,
          row,
        }),
      );
    }
    return results;
  });
}
