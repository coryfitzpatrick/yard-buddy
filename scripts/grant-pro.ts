/**
 * Grant admin/active status to specific accounts.
 * Run with: npx tsx scripts/grant-pro.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EMAILS = [
  "yardanalyzer+demo@gmail.com",
  "demo@yardanalyzer.com",
  "demo@yardbuddy.app",
  "fitzmx6@gmail.com",
];

const FAR_FUTURE = new Date("2099-12-31T23:59:59Z");

async function main() {
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//[credentials]@")}`);
  for (const email of EMAILS) {
    const user = await db.user.upsert({
      where: { email },
      update: {
        plan: "admin",
        planStatus: "active",
        trialEndsAt: null,
        currentPeriodEnd: FAR_FUTURE,
      },
      create: {
        email,
        plan: "admin",
        planStatus: "active",
        currentPeriodEnd: FAR_FUTURE,
      },
    });
    console.log(`✓ ${email} → admin/active (id: ${user.id})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
