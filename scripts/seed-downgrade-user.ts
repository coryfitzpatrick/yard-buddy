/**
 * Seed a Home Basic user with 5 active yards so the
 * YardLimitExceededModal renders on next login. Simulates a Pro
 * subscriber who downgraded to Basic at renewal.
 *
 * Run with: npx tsx scripts/seed-downgrade-user.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EMAIL = "yardanalyzer+downgrade@gmail.com";

const YARDS = [
  { slug: "main-residence", name: "Main Residence", zipCode: "78701" },
  { slug: "rental-east", name: "Rental East", zipCode: "78702" },
  { slug: "rental-west", name: "Rental West", zipCode: "78703" },
  { slug: "lake-house", name: "Lake House", zipCode: "78641" },
  { slug: "parents-house", name: "Parents' House", zipCode: "75201" },
];

const FAR_FUTURE = new Date("2099-12-31T23:59:59Z");

async function main() {
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//[credentials]@")}`);

  const user = await db.user.upsert({
    where: { email: EMAIL },
    update: {
      plan: "home_basic",
      planStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: FAR_FUTURE,
    },
    create: {
      email: EMAIL,
      plan: "home_basic",
      planStatus: "active",
      currentPeriodEnd: FAR_FUTURE,
    },
  });
  console.log(`✓ user ${EMAIL} → home_basic/active (id: ${user.id})`);

  // Make sure existing yards aren't archived from a prior run; archived yards
  // wouldn't trigger the modal.
  await db.yard.updateMany({
    where: { userId: user.id, archivedAt: { not: null } },
    data: { archivedAt: null },
  });

  for (const y of YARDS) {
    const yard = await db.yard.upsert({
      where: { userId_slug: { userId: user.id, slug: y.slug } },
      update: { name: y.name, zipCode: y.zipCode, archivedAt: null },
      create: { userId: user.id, slug: y.slug, name: y.name, zipCode: y.zipCode },
    });
    console.log(`  ↳ yard ${yard.name} (${yard.slug})`);
  }

  const activeCount = await db.yard.count({
    where: { userId: user.id, archivedAt: null },
  });
  console.log(
    `\n→ ${EMAIL} is now home_basic with ${activeCount} active yards.`,
  );
  console.log(`→ Sign in as this account and the YardLimitExceededModal should block the dashboard until you pick 1 yard or upgrade.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
