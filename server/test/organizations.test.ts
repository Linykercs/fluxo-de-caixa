import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { createOrganizationWithOwner } from "../src/services/organizations";

describe("createOrganizationWithOwner", () => {
  it("cria organização e usuário owner em transação", async () => {
    const db = await createTestDb();
    try {
      const result = await createOrganizationWithOwner(db.prisma, {
        organizationName: "Empresa Teste",
        name: "Dono da Empresa",
        email: "dono@empresa.com",
        password: "senhasegura123",
      });
      expect(result.organization.name).toBe("Empresa Teste");
      expect(result.user.organizationId).toBe(result.organization.id);
      expect(result.user.email).toBe("dono@empresa.com");
      expect(result.user.name).toBe("Dono da Empresa");
    } finally {
      await db.cleanup();
    }
  });

  it("lança USER_EMAIL_EXISTS se e-mail já existe", async () => {
    const db = await createTestDb();
    try {
      await createOrganizationWithOwner(db.prisma, {
        organizationName: "Empresa A",
        name: "Usuário A",
        email: "duplicado@empresa.com",
        password: "senhasegura123",
      });
      await expect(
        createOrganizationWithOwner(db.prisma, {
          organizationName: "Empresa B",
          name: "Usuário B",
          email: "duplicado@empresa.com",
          password: "senhasegura456",
        }),
      ).rejects.toMatchObject({ code: "USER_EMAIL_EXISTS" });
    } finally {
      await db.cleanup();
    }
  });
});
