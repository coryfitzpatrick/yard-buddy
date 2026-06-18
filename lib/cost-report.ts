import { db } from "@/lib/db";

export const PLAN_MONTHLY_REVENUE_USD: Record<string, number> = {
  trial:        0,
  admin:        0,
  expired:      0,
  home_basic:   4.99,
  home_plus:    9.99,
  professional: 19.99,
};

export interface UserCostRow {
  userId: string;
  email: string;
  plan: string;
  calls: number;
  costUsd: number;
  revenueUsd: number;
  marginUsd: number;
  marginPct: number; // marginUsd / revenueUsd; 0 when revenueUsd === 0
}

export interface CostReport {
  month: string;
  rows: UserCostRow[];
  totals: {
    costUsd: number;
    revenueUsd: number;
    netUsd: number;
    usersUnderwater: number;
  };
}

export const DEFAULT_COST_REPORT_RECIPIENT = "yardanalyzer@gmail.com";

export async function buildCostReport(month: string): Promise<CostReport> {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1; // 0-based for Date.UTC
  const gte = new Date(Date.UTC(year, monthIdx, 1));
  const lt = new Date(Date.UTC(year, monthIdx + 1, 1));

  const groups = await db.aiUsageEvent.groupBy({
    by: ["userId"],
    where: { createdAt: { gte, lt }, userId: { not: null } },
    _sum: { costUsd: true },
    _count: { _all: true },
  });

  const userIds = groups.map((g) => g.userId).filter((id): id is string => !!id);
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, plan: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows: UserCostRow[] = groups.map((g) => {
    const u = userById.get(g.userId!);
    const plan = u?.plan ?? "unknown";
    const revenueUsd = PLAN_MONTHLY_REVENUE_USD[plan] ?? 0;
    const costUsd = Number(g._sum.costUsd ?? 0);
    const marginUsd = revenueUsd - costUsd;
    const marginPct = revenueUsd === 0 ? 0 : marginUsd / revenueUsd;
    return {
      userId: g.userId!,
      email: u?.email ?? "(deleted user)",
      plan,
      calls: g._count._all,
      costUsd,
      revenueUsd,
      marginUsd,
      marginPct,
    };
  });

  // Worst margin first so the email surfaces problems at the top.
  rows.sort((a, b) => a.marginUsd - b.marginUsd);

  const totals = rows.reduce(
    (acc, r) => ({
      costUsd: acc.costUsd + r.costUsd,
      revenueUsd: acc.revenueUsd + r.revenueUsd,
      netUsd: acc.netUsd + r.marginUsd,
      usersUnderwater: acc.usersUnderwater + (r.marginUsd < 0 ? 1 : 0),
    }),
    { costUsd: 0, revenueUsd: 0, netUsd: 0, usersUnderwater: 0 },
  );

  return { month, rows, totals };
}
