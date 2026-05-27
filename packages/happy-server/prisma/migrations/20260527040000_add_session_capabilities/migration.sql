-- CreateTable
CREATE TABLE "SessionCapabilities" (
    "sessionId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionCapabilities_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "SessionCapabilities" ADD CONSTRAINT "SessionCapabilities_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
