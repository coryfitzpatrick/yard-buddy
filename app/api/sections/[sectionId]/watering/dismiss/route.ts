import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom } from "@/lib/observability/logger";
import { emitWateringDismissed } from "@/lib/observability/events";

export const POST = withAxiom(async (_req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { select: { userId: true } } },
  });
  if (!section || section.yard.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to dismiss" }, { status: 404 });
  if (latest.wateringDeviates !== true) {
    return NextResponse.json({ error: "Nothing to dismiss" }, { status: 409 });
  }

  await db.lawnAnalysis.update({
    where: { id: latest.id },
    data: { wateringRecommendationDismissedAt: new Date() },
  });

  emitWateringDismissed({ sectionId });
  return NextResponse.json({ ok: true });
});
