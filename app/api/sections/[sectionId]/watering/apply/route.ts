import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyTargetForPlan } from "@/lib/schedules/apply-handler";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitWateringApplied } from "@/lib/observability/events";

export const POST = withAxiom(async (_req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { include: { user: { select: { id: true, plan: true } } } } },
  });
  if (!section || section.yard.user.id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to apply" }, { status: 404 });

  const days = latest.wateringSuggestedDaysPerWeek;
  const mins = latest.wateringSuggestedMinutesPerSession;
  if (days == null || mins == null) {
    return NextResponse.json({ error: "No structured suggestion available" }, { status: 400 });
  }

  const target = applyTargetForPlan(section.yard.user.plan);
  await db.$transaction(async (tx) => {
    if (target === "yard") {
      await tx.yard.update({
        where: { id: section.yardId },
        data: { wateringDaysPerWeek: days, wateringMinutesPerSession: mins },
      });
    } else {
      await tx.yardSection.update({
        where: { id: sectionId },
        data: { wateringDaysPerWeek: days, wateringMinutesPerSession: mins },
      });
    }
    await tx.lawnAnalysis.update({
      where: { id: latest.id },
      data: { wateringRecommendationDismissedAt: null },
    });
  });

  emitWateringApplied({ sectionId, plan: section.yard.user.plan, target });
  logger.info("watering applied", { sectionId, target });

  return NextResponse.json({ target, daysPerWeek: days, minutesPerSession: mins });
});
