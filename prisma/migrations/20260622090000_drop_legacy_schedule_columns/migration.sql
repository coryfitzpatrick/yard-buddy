-- Drop legacy schedule columns now that structured fields are wired everywhere.

-- AlterTable
ALTER TABLE "Yard" DROP COLUMN "wateringDaysPerWeek",
DROP COLUMN "mowingDaysPerWeek",
DROP COLUMN "wateringSchedule",
DROP COLUMN "mowingSchedule";

-- AlterTable
ALTER TABLE "YardSection" DROP COLUMN "wateringDaysPerWeek",
DROP COLUMN "mowingDaysPerWeek",
DROP COLUMN "wateringSchedule",
DROP COLUMN "mowingSchedule";
