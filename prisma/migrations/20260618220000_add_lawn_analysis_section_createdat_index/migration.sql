-- Replace the single-column [yardSectionId] index with a composite that
-- covers both the lookup and the createdAt range filter used by the
-- monthly quota check in app/api/analyze/route.ts. The leading column
-- still serves single-column queries, so the standalone index is redundant.

-- DropIndex
DROP INDEX IF EXISTS "LawnAnalysis_yardSectionId_idx";

-- CreateIndex
CREATE INDEX "LawnAnalysis_yardSectionId_createdAt_idx" ON "LawnAnalysis"("yardSectionId", "createdAt");
