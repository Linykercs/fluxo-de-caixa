-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "telegramLinkToken" TEXT;
CREATE UNIQUE INDEX "Organization_telegramLinkToken_key" ON "Organization"("telegramLinkToken");

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN "dueSoonNotifiedAt" DATETIME;
ALTER TABLE "Entry" ADD COLUMN "dueTodayNotifiedAt" DATETIME;
