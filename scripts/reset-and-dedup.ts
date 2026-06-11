/**
 * 1. Deletes all analyses + tasks for fitzmx6@gmail.com (fresh start).
 * 2. Deduplicates tasks for demo@yardbuddy.app — merges cross-section
 *    duplicates (fuzzy title match + compatible product) into one task
 *    using additionalSectionIds, then deletes the redundant copies.
 *
 * Run with: npx tsx scripts/reset-and-dedup.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const wordsA = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalize(b).split(/\s+/).filter(Boolean));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

async function resetAccount(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) { console.log(`  ✗ ${email} not found`); return; }

  const yards = await db.yard.findMany({
    where: { userId: user.id },
    select: { id: true, sections: { select: { id: true } } },
  });

  const sectionIds = yards.flatMap((y) => y.sections.map((s) => s.id));

  const deletedTasks = await db.lawnTask.deleteMany({ where: { yardSectionId: { in: sectionIds } } });
  const deletedAnalyses = await db.lawnAnalysis.deleteMany({ where: { yardSectionId: { in: sectionIds } } });

  console.log(`  ✓ deleted ${deletedTasks.count} tasks, ${deletedAnalyses.count} analyses`);
}

async function dedupAccount(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) { console.log(`  ✗ ${email} not found`); return; }

  const yards = await db.yard.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, sections: { select: { id: true, name: true } } },
  });

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const yard of yards) {
    const sectionIds = yard.sections.map((s) => s.id);
    const tasks = await db.lawnTask.findMany({
      where: { yardSectionId: { in: sectionIds }, status: { not: "skipped" } },
      select: { id: true, title: true, product: true, yardSectionId: true, additionalSectionIds: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Group tasks by fuzzy title + product compatibility
    // primary = first seen (oldest), duplicates = later ones with matching title+product
    const primaries: typeof tasks = [];
    const toDelete: string[] = [];

    for (const task of tasks) {
      const primary = primaries.find((p) => {
        if (p.yardSectionId === task.yardSectionId) return false;
        if (titleSimilarity(p.title, task.title) < 0.6) return false;
        const pp = p.product?.toLowerCase().trim() || null;
        const tp = task.product?.toLowerCase().trim() || null;
        return !pp || !tp || pp === tp;
      });

      if (primary) {
        // Add task's section to primary's additionalSectionIds if not already there
        const newIds = [...new Set([...primary.additionalSectionIds, task.yardSectionId])];
        await db.lawnTask.update({
          where: { id: primary.id },
          data: { additionalSectionIds: newIds },
        });
        toDelete.push(task.id);
        totalMerged++;
      } else {
        primaries.push(task);
      }
    }

    if (toDelete.length > 0) {
      await db.lawnTask.deleteMany({ where: { id: { in: toDelete } } });
      totalDeleted += toDelete.length;
    }
  }

  console.log(`  ✓ merged ${totalMerged} duplicates into primaries, deleted ${totalDeleted} redundant tasks`);
}

async function main() {
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//[credentials]@")}`);

  console.log("\nResetting fitzmx6@gmail.com...");
  await resetAccount("fitzmx6@gmail.com");

  console.log("\nDeduplicating demo@yardbuddy.app...");
  await dedupAccount("demo@yardbuddy.app");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
