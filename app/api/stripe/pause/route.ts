import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { canPause } from "@/lib/subscription";
import { withAxiom, logger } from "@/lib/observability/logger";

function isAnnualPrice(priceId: string): boolean {
  for (const prices of Object.values(STRIPE_PRICES)) {
    if (prices.annual === priceId) return true;
  }
  return false;
}

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const months = Number(body.months);
  if (!Number.isInteger(months) || months < 1 || months > 6) {
    return NextResponse.json({ error: "months must be an integer between 1 and 6" }, { status: 400 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      stripeSubscriptionId: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      pausedUntil: true,
    },
  });

  if (!canPause(user)) {
    return NextResponse.json(
      { error: "Pause is not available for your current plan or status" },
      { status: 403 }
    );
  }

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  const resumesAt = new Date();
  resumesAt.setMonth(resumesAt.getMonth() + months);
  const pauseStartedAt = new Date();

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const currentPriceId = subscription.items.data[0]?.price.id ?? "";
  const currentPeriodEndSec = subscription.items.data[0]?.current_period_end;
  const isAnnual = isAnnualPrice(currentPriceId);

  try {
    if (isAnnual && currentPeriodEndSec) {
      // Annual users already paid for the year, so pausing collection alone
      // does nothing for them. Push the renewal date out by the requested
      // pause duration via trial_end so they recover the time. We mark this
      // with metadata so the webhook can distinguish a pause extension from
      // a real free trial.
      const pauseSec = Math.floor((resumesAt.getTime() - pauseStartedAt.getTime()) / 1000);
      const extendedTrialEnd = currentPeriodEndSec + pauseSec;

      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        pause_collection: {
          behavior: "keep_as_draft",
          resumes_at: Math.floor(resumesAt.getTime() / 1000),
        },
        trial_end: extendedTrialEnd,
        proration_behavior: "none",
        metadata: { pauseExtension: "true" },
      });

      await db.user.update({
        where: { id: session.user.id },
        data: {
          planStatus: "paused",
          pausedUntil: resumesAt,
          pauseStartedAt,
          pauseOriginalPeriodEnd: new Date(currentPeriodEndSec * 1000),
        },
      });
    } else {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        pause_collection: {
          behavior: "keep_as_draft",
          resumes_at: Math.floor(resumesAt.getTime() / 1000),
        },
      });

      await db.user.update({
        where: { id: session.user.id },
        data: { planStatus: "paused", pausedUntil: resumesAt },
      });
    }
  } catch (err) {
    logger.error("pause: stripe update failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Couldn't pause billing. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resumesAt: resumesAt.toISOString() });
});

export const DELETE = withAxiom(async (_req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      stripeSubscriptionId: true,
      planStatus: true,
      pauseStartedAt: true,
      pauseOriginalPeriodEnd: true,
    },
  });

  if (user.planStatus !== "paused") {
    return NextResponse.json({ error: "Subscription is not paused" }, { status: 400 });
  }

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  try {
    if (user.pauseStartedAt && user.pauseOriginalPeriodEnd) {
      // Annual pause: shorten the renewal extension to the actual time used.
      const actualPauseSec = Math.floor((Date.now() - user.pauseStartedAt.getTime()) / 1000);
      const originalEndSec = Math.floor(user.pauseOriginalPeriodEnd.getTime() / 1000);
      const adjustedTrialEnd = originalEndSec + actualPauseSec;

      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        pause_collection: null,
        trial_end: adjustedTrialEnd,
        proration_behavior: "none",
        metadata: { pauseExtension: "true" },
      });

      await db.user.update({
        where: { id: session.user.id },
        data: {
          planStatus: "active",
          pausedUntil: null,
          pauseStartedAt: null,
          pauseOriginalPeriodEnd: null,
        },
      });
    } else {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        pause_collection: null,
      });

      await db.user.update({
        where: { id: session.user.id },
        data: { planStatus: "active", pausedUntil: null },
      });
    }
  } catch (err) {
    logger.error("pause: stripe resume failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Couldn't resume billing. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
