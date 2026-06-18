import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGroupBy = vi.fn();
const mockUserFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    aiUsageEvent: { groupBy: mockGroupBy },
    user: { findMany: mockUserFindMany },
  },
}));

const { buildCostReport, PLAN_MONTHLY_REVENUE_USD } = await import("@/lib/cost-report");

beforeEach(() => {
  mockGroupBy.mockReset();
  mockUserFindMany.mockReset();
});

describe("buildCostReport", () => {
  it("groups by userId, joins email/plan, computes margin per row", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { userId: "u1", _sum: { costUsd: "14.2100" }, _count: { _all: 127 } },
      { userId: "u2", _sum: { costUsd: "2.8900" }, _count: { _all: 48 } },
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "u1", email: "alice@example.com", plan: "home_plus" },
      { id: "u2", email: "bob@example.com", plan: "home_basic" },
    ]);

    const report = await buildCostReport("2026-05");

    expect(report.month).toBe("2026-05");
    expect(report.rows).toHaveLength(2);

    // Sorted worst margin first: u1 home_plus ($9.99) - $14.21 = -$4.22
    expect(report.rows[0]).toMatchObject({
      userId: "u1",
      email: "alice@example.com",
      plan: "home_plus",
      calls: 127,
    });
    expect(report.rows[0].costUsd).toBeCloseTo(14.21, 2);
    expect(report.rows[0].marginUsd).toBeCloseTo(PLAN_MONTHLY_REVENUE_USD.home_plus - 14.21, 2);

    expect(report.rows[1].userId).toBe("u2");
  });

  it("returns 0% margin when revenue is 0 (trial / admin / unknown plan)", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { userId: "u1", _sum: { costUsd: "5.00" }, _count: { _all: 10 } },
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "u1", email: "trial@example.com", plan: "trial" },
    ]);
    const report = await buildCostReport("2026-05");
    expect(report.rows[0].revenueUsd).toBe(0);
    expect(report.rows[0].marginPct).toBe(0);
  });

  it("totals up cost, revenue, net, and underwater users", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { userId: "u1", _sum: { costUsd: "20.00" }, _count: { _all: 100 } }, // home_plus $9.99 -> -$10.01
      { userId: "u2", _sum: { costUsd: "1.00" },  _count: { _all: 5 } },   // home_basic $4.99 -> +$3.99
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "u1", email: "a@x.com", plan: "home_plus" },
      { id: "u2", email: "b@x.com", plan: "home_basic" },
    ]);
    const report = await buildCostReport("2026-05");
    expect(report.totals.costUsd).toBeCloseTo(21, 2);
    expect(report.totals.revenueUsd).toBeCloseTo(
      PLAN_MONTHLY_REVENUE_USD.home_plus + PLAN_MONTHLY_REVENUE_USD.home_basic,
      2,
    );
    expect(report.totals.usersUnderwater).toBe(1);
  });

  it("handles months with zero events", async () => {
    mockGroupBy.mockResolvedValueOnce([]);
    mockUserFindMany.mockResolvedValueOnce([]);
    const report = await buildCostReport("2026-05");
    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({
      costUsd: 0,
      revenueUsd: 0,
      netUsd: 0,
      usersUnderwater: 0,
    });
  });

  it("queries the right date range for a given month string", async () => {
    mockGroupBy.mockResolvedValueOnce([]);
    mockUserFindMany.mockResolvedValueOnce([]);
    await buildCostReport("2026-05");
    const where = mockGroupBy.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date(Date.UTC(2026, 4, 1)));
    expect(where.createdAt.lt).toEqual(new Date(Date.UTC(2026, 5, 1)));
  });
});
