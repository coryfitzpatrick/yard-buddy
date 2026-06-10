ALTER TABLE "User" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "User" ADD COLUMN "planStatus" TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pausedUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- Backfill trialEndsAt for existing users based on their signup date
UPDATE "User" SET "trialEndsAt" = "createdAt" + INTERVAL '14 days' WHERE "trialEndsAt" IS NULL;
