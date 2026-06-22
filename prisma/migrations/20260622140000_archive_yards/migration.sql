ALTER TABLE "Yard" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Yard_userId_archivedAt_idx" ON "Yard"("userId", "archivedAt");
