-- Numero de WhatsApp passa a ser por usuario (nao mais por organizacao):
-- cada pessoa cadastra o proprio numero de destino em Notificacoes.
ALTER TABLE "User" ADD COLUMN "whatsappPhoneNumber" TEXT;

-- Preserva o numero que ja existia: todo usuario da organizacao herda o
-- numero compartilhado como valor inicial (podem trocar/limpar depois).
UPDATE "User"
SET "whatsappPhoneNumber" = (
  SELECT "Organization"."whatsappPhoneNumber"
  FROM "Organization"
  WHERE "Organization"."id" = "User"."organizationId"
)
WHERE EXISTS (
  SELECT 1 FROM "Organization"
  WHERE "Organization"."id" = "User"."organizationId"
  AND "Organization"."whatsappPhoneNumber" IS NOT NULL
);

ALTER TABLE "Organization" DROP COLUMN "whatsappPhoneNumber";
