// lib/observability/ai-daily-summary.ts
import { db } from "@/lib/db";
import { emitAiDailySummary } from "./events";

export interface AiDailySummary {
  date: string;
  totals: { calls: number; failures: number; costUsd: number };
  byFeature: Record<string, { calls: number; costUsd: number }>;
  topUsers: Array<{ userId: string; calls: number; costUsd: number }>;
}

export async function buildAiDailySummary(date: string): Promise<AiDailySummary> {
  const [y, m, d] = date.split("-").map(Number);
  const gte = new Date(Date.UTC(y, m - 1, d));
  const lt = new Date(Date.UTC(y, m - 1, d + 1));
  const where = { createdAt: { gte, lt } };

  const [byFeatureRows, byUserRows, allRows] = await Promise.all([
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
  ]);

  const calls = allRows.length;
  const failures = allRows.filter((r) => !r.success).length;
  const costUsd = byFeatureRows.reduce((acc, r) => acc + Number(r._sum.costUsd ?? 0), 0);

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
    .slice(0, 10);

  return { date, totals: { calls, failures, costUsd }, byFeature, topUsers };
}

export async function emitYesterdaysAiSummary(now: Date = new Date()): Promise<void> {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const date = yesterday.toISOString().slice(0, 10);
  const summary = await buildAiDailySummary(date);
  emitAiDailySummary(summary);
}
