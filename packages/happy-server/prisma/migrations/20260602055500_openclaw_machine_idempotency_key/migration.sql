-- AlterTable
ALTER TABLE "OpenClawMachine" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OpenClawMachine_accountId_idempotencyKey_key" ON "OpenClawMachine"("accountId", "idempotencyKey");
