import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";
import type { StripePlan, StripePeriod } from "@/lib/stripe";
import { getPlanLimits, getActiveYardCount, isTierDowngrade, isTierUpgrade } from "@/lib/subscription";
import { withAxiom, logger } from "@/lib/observability/logger";

function detectCurrentPeriod(priceId: string): StripePeriod | null {
  for (const prices of Object.values(STRIPE_PRICES)) {
    if (prices.monthly === priceId) return "monthly";
    if (prices.annual === priceId) return "annual";
  }
  return null;
}

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { plan?: string; period?: string; archiveYardIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { plan, period, archiveYardIds } = body;

  if (archiveYardIds !== undefined && (!Array.isArray(archiveYardIds) || !archiveYardIds.every((id) => typeof id === "string"))) {
    return NextResponse.json({ error: "archiveYardIds must be a string array" }, { status: 400 });
  }

  if (plan === "trial") {
    return NextResponse.json({ error: "Cannot switch to trial" }, { status: 400 });
  }

  if (!isValidPlan(plan) || !isValidPeriod(period)) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[plan][period];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured" }, { status: 500 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true, plan: true, planStatus: true, stripeCustomerId: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  if (user.planStatus === "canceled") {
    return NextResponse.json({ error: "Subscription is canceled" }, { status: 400 });
  }

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  const currentPriceId = subscription.items.data[0]?.price.id ?? "";
  if (!itemId) {
    return NextResponse.json({ error: "Subscription item not found" }, { status: 500 });
  }

  const currentPeriod = detectCurrentPeriod(currentPriceId);
  const isAnnualToMonthly = currentPeriod === "annual" && period === "monthly";
  const isTierChange = user.plan !== plan;
  const isUpgrade = isTierUpgrade(user.plan, plan);
  const isDowngrade = isTierDowngrade(user.plan, plan);

  // "You get what you paid for." Any tier downgrade while on annual waits
  // for renewal, as does any pure annual→monthly switch (the 12-month
  // commitment). Annual + upgrade is always immediate at the annual rate;
  // if the user is also moving to monthly, the cadence flip schedules for
  // renewal but the tier upgrade still happens today.
  const isAnnualDowngrade = currentPeriod === "annual" && isTierChange && isDowngrade;
  const needsSchedule = currentPeriod === "annual" && (
    isAnnualToMonthly ||
    isAnnualDowngrade
  );

  // Tier flips today for upgrades and for monthly tier changes. The only
  // time a tier change is held is when the whole change is deferred, which
  // happens for annual downgrades. (A combined annual upgrade + monthly
  // target still flips tier today on annual cadence.)
  const tierAppliesNow = isTierChange && !isAnnualDowngrade;
  const newLimits = getPlanLimits({
    plan,
    planStatus: user.planStatus,
    trialEndsAt: null,
  });
  const activeCount = await getActiveYardCount(session.user.id);
  const overLimit = tierAppliesNow && activeCount > newLimits.maxYards && newLimits.maxYards > 0;
  const requiredCount = Math.max(0, activeCount - newLimits.maxYards);

  if (overLimit && (!archiveYardIds || archiveYardIds.length === 0)) {
    return NextResponse.json(
      { error: "Need to archive yards first", code: "archive_required", requiredCount },
      { status: 400 },
    );
  }

  if (overLimit && archiveYardIds && archiveYardIds.length !== requiredCount) {
    return NextResponse.json(
      { error: "Wrong number of yards to archive", code: "archive_count_mismatch", requiredCount },
      { status: 400 },
    );
  }

  if (overLimit && archiveYardIds) {
    const ownedActive = await db.yard.findMany({
      where: { id: { in: archiveYardIds }, userId: session.user.id, archivedAt: null },
      select: { id: true },
    });
    if (ownedActive.length !== archiveYardIds.length) {
      return NextResponse.json(
        { error: "One or more yards are invalid or already archived", code: "archive_invalid_ids" },
        { status: 400 },
      );
    }
  }

  try {
    if (needsSchedule) {
      // For a combined upgrade with cadence change (e.g. Basic annual →
      // Plus monthly), the tier change applies today on the existing annual
      // cadence; phase 1 then mirrors the new tier's annual price. For
      // pure cadence flips and annual downgrades, phase 1 mirrors the
      // current subscription (no immediate change).
      const phase1PriceId = tierAppliesNow
        ? STRIPE_PRICES[plan as StripePlan][currentPeriod as StripePeriod]
        : currentPriceId;

      if (tierAppliesNow) {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          items: [{ id: itemId, price: phase1PriceId }],
          proration_behavior: "always_invoice",
        });
      }

      const refreshed = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const existingScheduleId = refreshed.schedule
        ? (typeof refreshed.schedule === "string" ? refreshed.schedule : refreshed.schedule.id)
        : null;
      if (existingScheduleId) {
        await stripe.subscriptionSchedules.release(existingScheduleId);
      }

      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: user.stripeSubscriptionId,
      });
      const phase1 = schedule.phases[0];
      const phase2Duration = period === "monthly"
        ? { interval: "month" as const, interval_count: 1 }
        : { interval: "year" as const, interval_count: 1 };
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: phase1PriceId, quantity: 1 }],
            start_date: phase1.start_date,
            end_date: phase1.end_date,
          },
          {
            items: [{ price: priceId, quantity: 1 }],
            duration: phase2Duration,
          },
        ],
      });
    } else {
      const existingScheduleId = subscription.schedule
        ? (typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule.id)
        : null;
      if (existingScheduleId) {
        await stripe.subscriptionSchedules.release(existingScheduleId);
      }
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "always_invoice",
      });
    }
  } catch (err) {
    logger.error("change-plan: stripe update failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Couldn't process the plan change. Check your payment method and try again." }, { status: 402 });
  }

  // When the tier change is deferred, our DB plan stays on the current value
  // until the schedule fires at renewal. The webhook picks up the price flip
  // and updates the plan then.
  const persistPlanNow = tierAppliesNow;

  try {
    await db.$transaction([
      ...(overLimit && archiveYardIds && persistPlanNow
        ? [
            db.yard.updateMany({
              where: { id: { in: archiveYardIds }, userId: session.user.id },
              data: { archivedAt: new Date() },
            }),
          ]
        : []),
      ...(persistPlanNow
        ? [db.user.update({ where: { id: session.user.id }, data: { plan } })]
        : []),
    ]);
  } catch (err) {
    logger.error("change-plan: prisma transaction failed after stripe succeeded", {
      userId: session.user.id,
      plan,
      overLimit,
      archiveYardIdsCount: archiveYardIds?.length ?? 0,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Plan updated in Stripe but our records failed. Refresh to retry." }, { status: 500 });
  }

  // Auto-restore most recently archived yards if this is an upgrade. Mirrors
  // the webhook auto-restore. The webhook's idempotency guard short-circuits
  // when change-plan has already written the new plan to the DB, so this
  // path needs its own restore.
  const currentPlanLimits = getPlanLimits({
    plan: user.plan,
    planStatus: user.planStatus,
    trialEndsAt: null,
  });
  const restoreEligible = tierAppliesNow
    && newLimits.maxYards > 0
    && currentPlanLimits.maxYards > 0
    && newLimits.maxYards > currentPlanLimits.maxYards;
  if (restoreEligible) {
    const postChangeActiveCount = await db.yard.count({
      where: { userId: session.user.id, archivedAt: null },
    });
    const restoreCount = newLimits.maxYards - postChangeActiveCount;
    if (restoreCount > 0) {
      const archived = await db.yard.findMany({
        where: { userId: session.user.id, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: restoreCount,
        select: { id: true },
      });
      if (archived.length > 0) {
        await db.yard.updateMany({
          where: { id: { in: archived.map((y) => y.id) } },
          data: { archivedAt: null },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, deferred: needsSchedule });
});
