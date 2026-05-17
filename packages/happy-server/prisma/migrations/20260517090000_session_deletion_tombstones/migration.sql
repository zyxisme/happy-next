-- Tombstones for sessions deleted while other clients are offline.
CREATE TABLE "SessionDeletion" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionDeletion_accountId_sessionId_key" ON "SessionDeletion"("accountId", "sessionId");
CREATE INDEX "SessionDeletion_accountId_deletedAt_idx" ON "SessionDeletion"("accountId", "deletedAt" ASC);

ALTER TABLE "SessionDeletion"
ADD CONSTRAINT "SessionDeletion_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
