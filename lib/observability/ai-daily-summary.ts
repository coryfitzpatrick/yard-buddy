// lib/observability/ai-daily-summary.ts
import { db } from "@/lib/db";
import { emitAiDailySummary, type AiDailySummary } from "./events";

export type { AiDailySummary };

export async function buildAiDailySummary(date: string): Promise<AiDailySummary> {
  const [y, m, d] = date.split("-").map(Number);
  const gte = new Date(Date.UTC(y, m - 1, d));
  const lt = new Date(Date.UTC(y, m - 1, d + 1));
  const where = { createdAt: { gte, lt } };

  const [byFeatureRows, byUserRows, allRows, totalAgg] = await Promise.all([
    db.aiUsageEvent.groupBy({
      by: ["feature"],
      where,
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    db.aiUsageEvent.groupBy({
      by: ["userId"],
      where: { ...where, userId: { not: null } },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    db.aiUsageEvent.findMany({ where, select: { success: true } }),
    db.aiUsageEvent.aggregate({ where, _sum: { costUsd: true }, _count: { _all: true } }),
  ]);

  const calls = totalAgg._count._all;
  const failures = allRows.filter((r) => !r.success).length;
  // Number() coerces Prisma's Decimal(10, 6) to a JS double. Safe for daily
  // aggregates up to ~$9B/day before precision loss; sub-$100/month at
  // current scale. Revisit if AI spend ever approaches that ceiling.
  const costUsd = Number(totalAgg._sum.costUsd ?? 0);

  const byFeature: Record<string, { calls: number; costUsd: number }> = {};
  for (const r of byFeatureRows) {
    byFeature[r.feature] = { calls: r._count._all, costUsd: Number(r._sum.costUsd ?? 0) };
  }

  const topUsers = byUserRows
    .map((r) => ({
      userId: r.userId as string,
      calls: r._count._all,
      costUsd: Number(r._sum.costUsd ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd)
    // Top 10 for dashboard convenience — not a privacy boundary. userIds in
    // AiDailySummary are not redacted (they're stable internal identifiers).
    .slice(0, 10);

  return { date, totals: { calls, failures, costUsd }, byFeature, topUsers };
}

export async function emitYesterdaysAiSummary(now: Date = new Date()): Promise<void> {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const date = yesterday.toISOString().slice(0, 10);
  const summary = await buildAiDailySummary(date);
  emitAiDailySummary(summary);
}
