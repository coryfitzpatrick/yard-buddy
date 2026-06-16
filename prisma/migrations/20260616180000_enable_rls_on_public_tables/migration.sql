-- Supabase Postgres exposes a PostgREST API on top of the public schema. Without
-- Row-Level Security, anyone holding the anon key (shipped to the browser via
-- NEXT_PUBLIC_SUPABASE_ANON_KEY) can read these tables through that API.
-- The app does all DB access via Prisma over DATABASE_URL using the postgres
-- role, which bypasses RLS — so enabling RLS with no policies denies external
-- API access while leaving app queries untouched.

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailChangeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GddRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LawnAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LawnTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Yard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YardSection" ENABLE ROW LEVEL SECURITY;

-- Prisma's internal migrations table also lives in public; lock it down too.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
