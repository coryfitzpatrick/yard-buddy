-- AlterTable
ALTER TABLE "Yard" ADD COLUMN     "wateringDaysPerWeek" INTEGER,
ADD COLUMN     "wateringMinutesPerSession" INTEGER;

-- AlterTable
ALTER TABLE "YardSection" ADD COLUMN     "wateringDeviates" BOOLEAN,
ADD COLUMN     "wateringSchedule" TEXT;
