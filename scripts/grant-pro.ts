/**
 * Grant professional_plus/active status to specific accounts.
 * Run with: npx tsx scripts/grant-pro.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EMAILS = [
  "demo@yardanalyzer.com",
  "fitzmx6@gmail.com",
];

const FAR_FUTURE = new Date("2099-12-31T23:59:59Z");

async function main() {
  for (const email of EMAILS) {
    const user = await db.user.upsert({
      where: { email },
      update: {
        plan: "professional_plus",
        planStatus: "active",
        trialEndsAt: null,
        currentPeriodEnd: FAR_FUTURE,
        pausedUntil: null,
      },
      create: {
        email,
        plan: "professional_plus",
        planStatus: "active",
        currentPeriodEnd: FAR_FUTURE,
      },
    });
    console.log(`✓ ${email} → professional_plus/active (id: ${user.id})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
