-- AlterTable
ALTER TABLE "LawnTask" ADD COLUMN     "bestDay" TIMESTAMP(3),
ADD COLUMN     "gddThreshold" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gddBestDayReminderDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gddNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "GddRecord" (
    "id" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "cumulativeGdd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preEmergentFired" BOOLEAN NOT NULL DEFAULT false,
    "grubsFired" BOOLEAN NOT NULL DEFAULT false,
    "overseedingFired" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GddRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GddRecord_yardId_year_key" ON "GddRecord"("yardId", "year");

-- AddForeignKey
ALTER TABLE "GddRecord" ADD CONSTRAINT "GddRecord_yardId_fkey" FOREIGN KEY ("yardId") REFERENCES "Yard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
