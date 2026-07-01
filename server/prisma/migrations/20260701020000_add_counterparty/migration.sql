-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "telegramChatId" TEXT,
    "telegramLinkToken" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Counterparty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Counterparty_telegramLinkToken_key" ON "Counterparty"("telegramLinkToken");

-- CreateIndex
CREATE INDEX "Counterparty_organizationId_idx" ON "Counterparty"("organizationId");

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN "counterpartyId" TEXT;
ALTER TABLE "Entry" ADD COLUMN "collectionSentAt" DATETIME;

-- CreateIndex
CREATE INDEX "Entry_counterpartyId_idx" ON "Entry"("counterpartyId");
