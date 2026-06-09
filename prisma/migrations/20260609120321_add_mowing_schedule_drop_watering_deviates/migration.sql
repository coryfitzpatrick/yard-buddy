/*
  Warnings:

  - You are about to drop the column `wateringDeviates` on the `YardSection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "YardSection" DROP COLUMN "wateringDeviates",
ADD COLUMN     "mowingSchedule" TEXT;
