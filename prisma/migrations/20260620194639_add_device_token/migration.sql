-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match the project-wide convention: lock down PostgREST access via RLS with
-- no policies. The app accesses this table via Prisma with the postgres role,
-- which bypasses RLS.
ALTER TABLE "DeviceToken" ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: zod enforces this at the API boundary, but the DB-level
-- CHECK catches any out-of-band insertion (e.g. direct SQL via admin tools).
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_platform_check"
  CHECK ("platform" IN ('ios', 'android'));
