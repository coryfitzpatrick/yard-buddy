-- Move spreaderType and spreaderModel from YardSection to Yard
ALTER TABLE "Yard" ADD COLUMN "spreaderType" TEXT;
ALTER TABLE "Yard" ADD COLUMN "spreaderModel" TEXT;

-- Drop from YardSection (data loss accepted — fields were optional/rarely filled)
ALTER TABLE "YardSection" DROP COLUMN IF EXISTS "spreaderType";
ALTER TABLE "YardSection" DROP COLUMN IF EXISTS "spreaderModel";
