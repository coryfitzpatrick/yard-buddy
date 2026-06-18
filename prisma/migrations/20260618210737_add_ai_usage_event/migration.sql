-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Match the project-wide convention: lock down PostgREST access via RLS with
-- no policies. The app accesses this table via Prisma with the postgres role,
-- which bypasses RLS.
ALTER TABLE "AiUsageEvent" ENABLE ROW LEVEL SECURITY;
