-- Adiciona perfil de acesso ao usuário: "ADMIN" (acesso total) ou "OPERATOR" (lançamentos e consultas).
-- Usuários existentes ficam como ADMIN (são todos donos).
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN';
