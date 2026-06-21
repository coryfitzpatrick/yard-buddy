-- AlterTable
ALTER TABLE "Yard" ADD COLUMN     "mowingDaysPerWeek" INTEGER,
ADD COLUMN     "mowingHeightInches" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "YardSection" ADD COLUMN     "wateringDaysPerWeek" INTEGER,
ADD COLUMN     "wateringMinutesPerSession" INTEGER,
ADD COLUMN     "mowingDaysPerWeek" INTEGER,
ADD COLUMN     "mowingHeightInches" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LawnAnalysis" ADD COLUMN     "wateringSchedule" TEXT,
ADD COLUMN     "wateringDeviates" BOOLEAN,
ADD COLUMN     "wateringSuggestedDaysPerWeek" INTEGER,
ADD COLUMN     "wateringSuggestedMinutesPerSession" INTEGER,
ADD COLUMN     "wateringRecommendationDismissedAt" TIMESTAMP(3),
ADD COLUMN     "mowingSchedule" TEXT,
ADD COLUMN     "mowingDeviates" BOOLEAN,
ADD COLUMN     "mowingSuggestedDaysPerWeek" INTEGER,
ADD COLUMN     "mowingSuggestedHeightInches" DOUBLE PRECISION,
ADD COLUMN     "mowingRecommendationDismissedAt" TIMESTAMP(3);
