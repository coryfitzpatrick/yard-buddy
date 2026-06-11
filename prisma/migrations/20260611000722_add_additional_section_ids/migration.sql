-- AlterTable
ALTER TABLE "LawnTask" ADD COLUMN     "additionalSectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
