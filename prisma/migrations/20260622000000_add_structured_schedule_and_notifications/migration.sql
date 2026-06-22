-- AlterTable
ALTER TABLE "Yard" ADD COLUMN     "wateringDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "wateringTime" TEXT,
ADD COLUMN     "mowingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mowingTime" TEXT;

-- AlterTable
ALTER TABLE "YardSection" ADD COLUMN     "wateringDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "wateringTime" TEXT,
ADD COLUMN     "mowingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mowingTime" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskPushEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schedulePushEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weatherEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weatherPushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Data migrate JSON wateringSchedule/mowingSchedule -> structured columns

UPDATE "Yard"
SET
  "wateringDays" = COALESCE(ARRAY(SELECT jsonb_array_elements_text(("wateringSchedule"::jsonb)->'days')), ARRAY[]::TEXT[]),
  "wateringTime" = ("wateringSchedule"::jsonb)->>'time',
  "wateringMinutesPerSession" = COALESCE("wateringMinutesPerSession", NULLIF(("wateringSchedule"::jsonb)->>'inches', '')::int)
WHERE "wateringSchedule" IS NOT NULL AND "wateringSchedule" ~ '^\s*\{';

UPDATE "Yard"
SET
  "mowingDays" = COALESCE(ARRAY(SELECT jsonb_array_elements_text(("mowingSchedule"::jsonb)->'days')), ARRAY[]::TEXT[]),
  "mowingTime" = ("mowingSchedule"::jsonb)->>'time',
  "mowingHeightInches" = COALESCE("mowingHeightInches", NULLIF(("mowingSchedule"::jsonb)->>'inches', '')::float)
WHERE "mowingSchedule" IS NOT NULL AND "mowingSchedule" ~ '^\s*\{';

UPDATE "YardSection"
SET
  "wateringDays" = COALESCE(ARRAY(SELECT jsonb_array_elements_text(("wateringSchedule"::jsonb)->'days')), ARRAY[]::TEXT[]),
  "wateringTime" = ("wateringSchedule"::jsonb)->>'time',
  "wateringMinutesPerSession" = COALESCE("wateringMinutesPerSession", NULLIF(("wateringSchedule"::jsonb)->>'inches', '')::int)
WHERE "wateringSchedule" IS NOT NULL AND "wateringSchedule" ~ '^\s*\{';

UPDATE "YardSection"
SET
  "mowingDays" = COALESCE(ARRAY(SELECT jsonb_array_elements_text(("mowingSchedule"::jsonb)->'days')), ARRAY[]::TEXT[]),
  "mowingTime" = ("mowingSchedule"::jsonb)->>'time',
  "mowingHeightInches" = COALESCE("mowingHeightInches", NULLIF(("mowingSchedule"::jsonb)->>'inches', '')::float)
WHERE "mowingSchedule" IS NOT NULL AND "mowingSchedule" ~ '^\s*\{';
