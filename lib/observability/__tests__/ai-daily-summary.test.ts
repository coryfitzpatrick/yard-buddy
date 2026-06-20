// lib/observability/__tests__/ai-daily-summary.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    aiUsageEvent: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { buildAiDailySummary } from "@/lib/observability/ai-daily-summary";

describe("buildAiDailySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates totals, byFeature, and topUsers for the given day", async () => {
    // 3 events on 2026-06-19:
    //   user u1, analyze, $0.50, success
    //   user u1, analyze, $0.20, success
    //   user u2, identify-grass, $0.10, failure
    (db.aiUsageEvent.groupBy as ReturnType<typeof vi.fn>).mockImplementation(async (q: { by: string[] }) => {
      if (q.by.includes("feature")) {
        return [
          { feature: "analyze", _sum: { costUsd: 0.7 }, _count: { _all: 2 } },
          { feature: "identify-grass", _sum: { costUsd: 0.1 }, _count: { _all: 1 } },
        ];
      }
      if (q.by.includes("userId")) {
        return [
          { userId: "u1", _sum: { costUsd: 0.7 }, _count: { _all: 2 } },
          { userId: "u2", _sum: { costUsd: 0.1 }, _count: { _all: 1 } },
        ];
      }
      return [];
    });
    (db.aiUsageEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { success: true }, { success: true }, { success: false },
    ]);

    const summary = await buildAiDailySummary("2026-06-19");

    expect(summary.date).toBe("2026-06-19");
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.failures).toBe(1);
    expect(summary.totals.costUsd).toBeCloseTo(0.8, 3);
    expect(summary.byFeature.analyze).toEqual({ calls: 2, costUsd: 0.7 });
    expect(summary.topUsers[0]).toEqual({ userId: "u1", calls: 2, costUsd: 0.7 });
  });
});
