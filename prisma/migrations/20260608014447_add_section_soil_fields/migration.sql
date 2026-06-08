-- AlterTable
ALTER TABLE "YardSection" ADD COLUMN     "nitrogenPpm" DOUBLE PRECISION,
ADD COLUMN     "organicMatterPct" DOUBLE PRECISION,
ADD COLUMN     "phosphorusPpm" DOUBLE PRECISION,
ADD COLUMN     "potassiumPpm" DOUBLE PRECISION,
ADD COLUMN     "soilTestSource" TEXT,
ADD COLUMN     "soilTestedAt" TIMESTAMP(3);
