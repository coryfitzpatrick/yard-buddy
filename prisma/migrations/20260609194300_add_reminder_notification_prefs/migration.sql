-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reminderDaysBefore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminderNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
