-- AlterTable
ALTER TABLE "OrchestratorExecution" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrchestratorExecution_taskId_idempotencyKey_key" ON "OrchestratorExecution"("taskId", "idempotencyKey");
