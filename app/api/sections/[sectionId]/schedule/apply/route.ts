import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitWateringApplied, emitMowingApplied } from "@/lib/observability/events";
import { isEffectivelyExpired } from "@/lib/subscription";
import { triggerEngagementBonusCheck } from "@/lib/engagement-trigger";

const DAY = z.enum(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const TIME = z.string().regex(/^\d{2}:\d{2}$/).nullable();

const bodySchema = z.object({
  watering: z.object({
    days: z.array(DAY),
    time: TIME,
    minutesPerSession: z.number().int().min(1).max(120).nullable(),
  }),
  mowing: z.object({
    days: z.array(DAY),
    time: TIME,
    heightInches: z.number().min(1).max(6).nullable(),
  }),
  applyToYard: z.boolean(),
});

export const POST = withAxiom(async (req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { watering, mowing } = parsed.data;

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

  const canOverride = canSetSectionSchedule(section.yard.user.plan);
  const target: "yard" | "section" = canOverride && !parsed.data.applyToYard ? "section" : "yard";

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await db.$transaction(async (tx) => {
    const data = {
      wateringDays: watering.days,
      wateringTime: watering.time,
      wateringMinutesPerSession: watering.minutesPerSession,
      mowingDays: mowing.days,
      mowingTime: mowing.time,
      mowingHeightInches: mowing.heightInches,
    };
    if (target === "yard") {
      await tx.yard.update({ where: { id: section.yardId }, data });
    } else {
      await tx.yardSection.update({ where: { id: sectionId }, data });
    }
    if (latest) {
      await tx.lawnAnalysis.update({
        where: { id: latest.id },
        data: {
          wateringRecommendationDismissedAt: null,
          mowingRecommendationDismissedAt: null,
        },
      });
    }
  });

  emitWateringApplied({ sectionId, plan: section.yard.user.plan, target });
  emitMowingApplied({ sectionId, plan: section.yard.user.plan, target });
  logger.info("schedule applied", { sectionId, target });

  triggerEngagementBonusCheck(session.user.id);

  return NextResponse.json({ target, watering, mowing });
});
