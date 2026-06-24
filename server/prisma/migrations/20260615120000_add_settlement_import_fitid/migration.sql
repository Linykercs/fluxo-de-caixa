-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN "importFitid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_bankAccountId_importFitid_key" ON "Settlement"("bankAccountId", "importFitid");
