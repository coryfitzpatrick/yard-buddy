-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "LawnAnalysis" (
    "id" TEXT NOT NULL,
    "yardSectionId" TEXT NOT NULL,
    "imageUrls" TEXT[],
    "healthScore" INTEGER NOT NULL,
    "issues" TEXT[],
    "summary" TEXT NOT NULL,
    "rawResponse" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LawnAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawnTask" (
    "id" TEXT NOT NULL,
    "yardSectionId" TEXT NOT NULL,
    "analysisId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "product" TEXT,
    "applicationRate" TEXT,
    "spreaderSetting" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawnTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Yard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Property',
    "zipCode" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Yard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YardSection" (
    "id" TEXT NOT NULL,
    "yardId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Front Yard',
    "areaType" TEXT,
    "yardSizeSqft" INTEGER,
    "grassType" TEXT NOT NULL DEFAULT 'unknown',
    "soilPh" DOUBLE PRECISION,
    "soilMoisture" TEXT,
    "spreaderType" TEXT,
    "spreaderModel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YardSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId" ASC);

-- CreateIndex
CREATE INDEX "LawnAnalysis_yardProfileId_idx" ON "LawnAnalysis"("yardSectionId" ASC);

-- CreateIndex
CREATE INDEX "LawnTask_analysisId_idx" ON "LawnTask"("analysisId" ASC);

-- CreateIndex
CREATE INDEX "LawnTask_yardProfileId_idx" ON "LawnTask"("yardSectionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken" ASC);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE INDEX "Yard_userId_idx" ON "Yard"("userId" ASC);

-- CreateIndex
CREATE INDEX "YardSection_yardId_idx" ON "YardSection"("yardId" ASC);

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawnAnalysis" ADD CONSTRAINT "LawnAnalysis_yardSectionId_fkey" FOREIGN KEY ("yardSectionId") REFERENCES "YardSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawnTask" ADD CONSTRAINT "LawnTask_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "LawnAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawnTask" ADD CONSTRAINT "LawnTask_yardSectionId_fkey" FOREIGN KEY ("yardSectionId") REFERENCES "YardSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Yard" ADD CONSTRAINT "Yard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardSection" ADD CONSTRAINT "YardSection_yardId_fkey" FOREIGN KEY ("yardId") REFERENCES "Yard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
