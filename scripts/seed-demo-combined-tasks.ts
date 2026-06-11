/**
 * Links demo account tasks across sections to showcase the combined task feature.
 * Run with: npx tsx scripts/seed-demo-combined-tasks.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//[credentials]@")}`);

  const user = await db.user.findUnique({
    where: { email: "demo@yardbuddy.app" },
    select: { id: true },
  });
  if (!user) { console.log("demo@yardbuddy.app not found"); return; }

  const yards = await db.yard.findMany({
    where: { userId: user.id },
    include: {
      sections: {
        include: {
          tasks: { select: { id: true, title: true, additionalSectionIds: true } },
        },
      },
    },
  });

  for (const yard of yards) {
    console.log(`\nYard: ${yard.name}`);
    const sectionMap = new Map(yard.sections.map((s) => [s.name, s]));

    if (yard.name === "Henderson Property") {
      const frontYard = sectionMap.get("Front Yard");
      const backYard = sectionMap.get("Back Yard");
      const leftSide = sectionMap.get("Left Side Yard");

      // Link "Apply pre-emergent herbicide" (Front Yard) → also applies to Back Yard
      const preEmergent = frontYard?.tasks.find((t) => t.title.toLowerCase().includes("pre-emergent"));
      if (preEmergent && backYard && !preEmergent.additionalSectionIds.includes(backYard.id)) {
        await db.lawnTask.update({
          where: { id: preEmergent.id },
          data: { additionalSectionIds: { push: backYard.id } },
        });
        console.log(`  ✓ Linked "${preEmergent.title}" → Back Yard`);
      }

      // Link "Starter fertilizer" (Front Yard) → also applies to Back Yard
      const starterFert = frontYard?.tasks.find((t) => t.title.toLowerCase().includes("starter fertilizer"));
      if (starterFert && backYard && !starterFert.additionalSectionIds.includes(backYard.id)) {
        await db.lawnTask.update({
          where: { id: starterFert.id },
          data: { additionalSectionIds: { push: backYard.id } },
        });
        console.log(`  ✓ Linked "${starterFert.title}" → Back Yard`);
      }

      // Link "Lime application" (Left Side) → also applies to Back Yard
      const lime = leftSide?.tasks.find((t) => t.title.toLowerCase().includes("lime"));
      if (lime && backYard && !lime.additionalSectionIds.includes(backYard.id)) {
        await db.lawnTask.update({
          where: { id: lime.id },
          data: { additionalSectionIds: { push: backYard.id } },
        });
        console.log(`  ✓ Linked "${lime.title}" → Back Yard`);
      }
    }

    if (yard.name === "Rivera Property") {
      const frontYard = sectionMap.get("Front Yard");
      const backYard = sectionMap.get("Back Yard");

      // Link "Post-emergent broadleaf weed control" (Front) → also applies to Back Yard
      const weedControl = frontYard?.tasks.find((t) => t.title.toLowerCase().includes("weed control"));
      if (weedControl && backYard && !weedControl.additionalSectionIds.includes(backYard.id)) {
        await db.lawnTask.update({
          where: { id: weedControl.id },
          data: { additionalSectionIds: { push: backYard.id } },
        });
        console.log(`  ✓ Linked "${weedControl.title}" → Back Yard`);
      }
    }
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
