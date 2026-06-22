ALTER TABLE "User"
  ADD COLUMN "trialEngagementBonusGrantedAt" TIMESTAMP(3),
  ADD COLUMN "day5NudgeSentAt" TIMESTAMP(3),
  ADD COLUMN "day10NudgeSentAt" TIMESTAMP(3),
  ADD COLUMN "day14SecondAnalysisPromptSentAt" TIMESTAMP(3),
  ADD COLUMN "graceDay14EmailSentAt" TIMESTAMP(3),
  ADD COLUMN "graceDay7EmailSentAt" TIMESTAMP(3),
  ADD COLUMN "graceDay2EmailSentAt" TIMESTAMP(3),
  ADD COLUMN "gracePush7SentAt" TIMESTAMP(3),
  ADD COLUMN "gracePush1SentAt" TIMESTAMP(3),
  ADD COLUMN "trialEndedPushSentAt" TIMESTAMP(3);
