-- CreateTable
CREATE TABLE "BiometricRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BiometricRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BiometricRefreshToken_tokenHash_key" ON "BiometricRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BiometricRefreshToken_userId_idx" ON "BiometricRefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "BiometricRefreshToken" ADD CONSTRAINT "BiometricRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match the project-wide convention: lock down PostgREST access via RLS with
-- no policies. The app accesses this table via Prisma with the postgres role,
-- which bypasses RLS.
ALTER TABLE "BiometricRefreshToken" ENABLE ROW LEVEL SECURITY;
