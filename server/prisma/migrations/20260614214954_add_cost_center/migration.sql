-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCenter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "notes" TEXT,
    "categoryId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "competenceMonth" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "recurrenceId" TEXT,
    "installmentGroupId" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Entry_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("amountCents", "categoryId", "competenceMonth", "counterparty", "createdAt", "deletedAt", "description", "direction", "dueDate", "id", "installmentGroupId", "installmentNumber", "installmentTotal", "notes", "organizationId", "recurrenceId", "updatedAt") SELECT "amountCents", "categoryId", "competenceMonth", "counterparty", "createdAt", "deletedAt", "description", "direction", "dueDate", "id", "installmentGroupId", "installmentNumber", "installmentTotal", "notes", "organizationId", "recurrenceId", "updatedAt" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_organizationId_competenceMonth_idx" ON "Entry"("organizationId", "competenceMonth");
CREATE INDEX "Entry_organizationId_dueDate_idx" ON "Entry"("organizationId", "dueDate");
CREATE INDEX "Entry_organizationId_direction_idx" ON "Entry"("organizationId", "direction");
CREATE INDEX "Entry_recurrenceId_idx" ON "Entry"("recurrenceId");
CREATE INDEX "Entry_installmentGroupId_idx" ON "Entry"("installmentGroupId");
CREATE TABLE "new_Recurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "materializedUntil" TEXT,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recurrence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Recurrence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Recurrence_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recurrence" ("amountCents", "canceledAt", "categoryId", "counterparty", "createdAt", "description", "direction", "dueDay", "endMonth", "id", "materializedUntil", "organizationId", "startMonth", "updatedAt") SELECT "amountCents", "canceledAt", "categoryId", "counterparty", "createdAt", "description", "direction", "dueDay", "endMonth", "id", "materializedUntil", "organizationId", "startMonth", "updatedAt" FROM "Recurrence";
DROP TABLE "Recurrence";
ALTER TABLE "new_Recurrence" RENAME TO "Recurrence";
CREATE INDEX "Recurrence_organizationId_idx" ON "Recurrence"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CostCenter_organizationId_idx" ON "CostCenter"("organizationId");
