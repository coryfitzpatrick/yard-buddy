import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlanLimits, getActiveYardCount } from "@/lib/subscription";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async (_req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true },
  });

  const limits = getPlanLimits(user);
  if (limits.maxYards <= 0) {
    return NextResponse.json({ ok: true, restored: 0 });
  }

  const activeCount = await getActiveYardCount(session.user.id);
  const restoreCount = Math.max(0, limits.maxYards === -1 ? Number.MAX_SAFE_INTEGER : limits.maxYards - activeCount);
  if (restoreCount === 0) {
    return NextResponse.json({ ok: true, restored: 0 });
  }

  const archived = await db.yard.findMany({
    where: { userId: session.user.id, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    take: restoreCount === Number.MAX_SAFE_INTEGER ? undefined : restoreCount,
    select: { id: true },
  });
  if (archived.length === 0) {
    return NextResponse.json({ ok: true, restored: 0 });
  }

  const result = await db.yard.updateMany({
    where: { id: { in: archived.map((y) => y.id) } },
    data: { archivedAt: null },
  });

  return NextResponse.json({ ok: true, restored: result.count });
});
