-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initialBalanceCents" INTEGER NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "notes" TEXT,
    "categoryId" TEXT NOT NULL,
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
    CONSTRAINT "Entry_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "settledAt" DATETIME NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notes" TEXT,
    "reversalOfId" TEXT,
    "reversedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Settlement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Settlement_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "Settlement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recurrence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Recurrence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "settlementId" TEXT,
    "transferId" TEXT,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Movement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Movement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Movement_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "BankAccount_organizationId_idx" ON "BankAccount"("organizationId");

-- CreateIndex
CREATE INDEX "Category_organizationId_idx" ON "Category"("organizationId");

-- CreateIndex
CREATE INDEX "Entry_organizationId_competenceMonth_idx" ON "Entry"("organizationId", "competenceMonth");

-- CreateIndex
CREATE INDEX "Entry_organizationId_dueDate_idx" ON "Entry"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "Entry_organizationId_direction_idx" ON "Entry"("organizationId", "direction");

-- CreateIndex
CREATE INDEX "Entry_recurrenceId_idx" ON "Entry"("recurrenceId");

-- CreateIndex
CREATE INDEX "Entry_installmentGroupId_idx" ON "Entry"("installmentGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reversalOfId_key" ON "Settlement"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reversedById_key" ON "Settlement"("reversedById");

-- CreateIndex
CREATE INDEX "Settlement_entryId_idx" ON "Settlement"("entryId");

-- CreateIndex
CREATE INDEX "Settlement_organizationId_settledAt_idx" ON "Settlement"("organizationId", "settledAt");

-- CreateIndex
CREATE INDEX "Settlement_bankAccountId_idx" ON "Settlement"("bankAccountId");

-- CreateIndex
CREATE INDEX "Recurrence_organizationId_idx" ON "Recurrence"("organizationId");

-- CreateIndex
CREATE INDEX "Movement_bankAccountId_createdAt_idx" ON "Movement"("bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "Movement_organizationId_idx" ON "Movement"("organizationId");

-- CreateIndex
CREATE INDEX "Movement_settlementId_idx" ON "Movement"("settlementId");

-- CreateIndex
CREATE INDEX "Movement_transferId_idx" ON "Movement"("transferId");

-- CreateIndex
CREATE INDEX "Transfer_organizationId_idx" ON "Transfer"("organizationId");
