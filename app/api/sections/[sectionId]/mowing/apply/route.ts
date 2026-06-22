import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyTargetForPlan } from "@/lib/schedules/apply-handler";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitMowingApplied } from "@/lib/observability/events";
import { isEffectivelyExpired, triggerEngagementBonusCheck } from "@/lib/subscription";

const optionalBody = z.object({
  days: z.array(z.enum(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
}).partial();

export const POST = withAxiom(async (req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { include: { user: { select: { id: true, plan: true, planStatus: true, trialEndsAt: true } } } } },
  });
  if (!section || section.yard.user.id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isEffectivelyExpired(section.yard.user)) {
    return NextResponse.json({ error: "Trial expired" }, { status: 403 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to apply" }, { status: 404 });

  const height = latest.mowingSuggestedHeightInches;
  if (height == null) {
    return NextResponse.json({ error: "No structured suggestion available" }, { status: 400 });
  }

  let extra: { days?: string[]; time?: string | null } = {};
  try {
    const json = await req.json();
    const parsed = optionalBody.safeParse(json);
    if (parsed.success) extra = parsed.data;
  } catch {
    // empty body or non-JSON: fall through with extra={}
  }

  const target = applyTargetForPlan(section.yard.user.plan);
  await db.$transaction(async (tx) => {
    const data: { mowingHeightInches: number; mowingDays?: string[]; mowingTime?: string | null } = {
      mowingHeightInches: height,
    };
    if (extra.days !== undefined) data.mowingDays = extra.days;
    if (extra.time !== undefined) data.mowingTime = extra.time;

    if (target === "yard") {
      await tx.yard.update({
        where: { id: section.yardId },
        data,
      });
    } else {
      await tx.yardSection.update({
        where: { id: sectionId },
        data,
      });
    }
    await tx.lawnAnalysis.update({
      where: { id: latest.id },
      data: { mowingRecommendationDismissedAt: null },
    });
  });

  emitMowingApplied({ sectionId, plan: section.yard.user.plan, target });
  logger.info("mowing applied", { sectionId, target });

  triggerEngagementBonusCheck(session.user.id);

  return NextResponse.json({
    target,
    heightInches: height,
    ...(extra.days !== undefined && { days: extra.days }),
    ...(extra.time !== undefined && { time: extra.time }),
  });
});
