/*
  Warnings:

  - You are about to drop the column `dueDate` on the `LawnTask` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LawnTask" DROP COLUMN "dueDate",
ADD COLUMN     "overdueNote" TEXT,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "scheduledStart" TIMESTAMP(3),
ADD COLUMN     "stillWorthDoing" BOOLEAN,
ADD COLUMN     "weatherCondition" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Yard" ADD COLUMN     "weatherRefreshedAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "YardSection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "LawnAnalysis_yardProfileId_idx" RENAME TO "LawnAnalysis_yardSectionId_idx";

-- RenameIndex
ALTER INDEX "LawnTask_yardProfileId_idx" RENAME TO "LawnTask_yardSectionId_idx";
