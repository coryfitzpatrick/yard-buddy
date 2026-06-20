// lib/observability/__tests__/ai-daily-summary.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    aiUsageEvent: { groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
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
    (db.aiUsageEvent.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { costUsd: 0.8 },
      _count: { _all: 3 },
    });

    const summary = await buildAiDailySummary("2026-06-19");

    expect(summary.date).toBe("2026-06-19");
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.failures).toBe(1);
    expect(summary.totals.costUsd).toBeCloseTo(0.8, 3);
    expect(summary.byFeature.analyze).toEqual({ calls: 2, costUsd: 0.7 });
    expect(summary.topUsers[0]).toEqual({ userId: "u1", calls: 2, costUsd: 0.7 });
  });

  it("returns zero totals and empty maps for a day with no events", async () => {
    (db.aiUsageEvent.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.aiUsageEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.aiUsageEvent.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { costUsd: 0 }, _count: { _all: 0 } });

    const summary = await buildAiDailySummary("2026-01-01");
    expect(summary.totals).toEqual({ calls: 0, failures: 0, costUsd: 0 });
    expect(summary.byFeature).toEqual({});
    expect(summary.topUsers).toEqual([]);
  });

  it("includes null-userId rows in totals but excludes them from topUsers", async () => {
    // 2 events: one with userId u1, one with userId null
    (db.aiUsageEvent.groupBy as ReturnType<typeof vi.fn>).mockImplementation(async (q: { by: string[] }) => {
      if (q.by.includes("feature")) {
        return [{ feature: "analyze", _sum: { costUsd: 0.4 }, _count: { _all: 2 } }];
      }
      if (q.by.includes("userId")) {
        // groupBy with userId: { not: null } filter — only u1
        return [{ userId: "u1", _sum: { costUsd: 0.2 }, _count: { _all: 1 } }];
      }
      return [];
    });
    (db.aiUsageEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { success: true }, { success: true },
    ]);
    (db.aiUsageEvent.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { costUsd: 0.4 }, _count: { _all: 2 } });

    const summary = await buildAiDailySummary("2026-06-19");
    expect(summary.totals.calls).toBe(2);                  // both events counted
    expect(summary.totals.costUsd).toBeCloseTo(0.4, 3);    // both costs summed
    expect(summary.topUsers).toEqual([{ userId: "u1", calls: 1, costUsd: 0.2 }]);  // null-userId absent
  });

  it("caps topUsers at 10 entries even when more users exist", async () => {
    const fifteenUsers = Array.from({ length: 15 }, (_, i) => ({
      userId: `u${i}`,
      _sum: { costUsd: 1 - i * 0.01 },   // descending so u0 is highest
      _count: { _all: 1 },
    }));
    (db.aiUsageEvent.groupBy as ReturnType<typeof vi.fn>).mockImplementation(async (q: { by: string[] }) => {
      if (q.by.includes("feature")) return [{ feature: "analyze", _sum: { costUsd: 14 }, _count: { _all: 15 } }];
      if (q.by.includes("userId")) return fifteenUsers;
      return [];
    });
    (db.aiUsageEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(Array(15).fill({ success: true }));
    (db.aiUsageEvent.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { costUsd: 14 }, _count: { _all: 15 } });

    const summary = await buildAiDailySummary("2026-06-19");
    expect(summary.topUsers.length).toBe(10);
    expect(summary.topUsers[0].userId).toBe("u0");                 // highest cost first
    expect(summary.topUsers[9].userId).toBe("u9");                 // bottom of top 10
  });
});
