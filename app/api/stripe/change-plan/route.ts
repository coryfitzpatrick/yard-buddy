import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";
import { getPlanLimits, getActiveYardCount } from "@/lib/subscription";
import { withAxiom, logger } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { plan, period, archiveYardIds } = body as {
    plan?: string;
    period?: string;
    archiveYardIds?: string[];
  };

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

  // Downgrade gating
  const newLimits = getPlanLimits({
    plan,
    planStatus: user.planStatus,
    trialEndsAt: null,
  });
  const activeCount = await getActiveYardCount(session.user.id);
  const overLimit = activeCount > newLimits.maxYards && newLimits.maxYards > 0;
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

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    return NextResponse.json({ error: "Subscription item not found" }, { status: 500 });
  }

  try {
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    logger.error("change-plan: stripe update failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Couldn't process the plan change. Check your payment method and try again." }, { status: 402 });
  }

  await db.$transaction([
    ...(overLimit && archiveYardIds
      ? [
          db.yard.updateMany({
            where: { id: { in: archiveYardIds }, userId: session.user.id },
            data: { archivedAt: new Date() },
          }),
        ]
      : []),
    db.user.update({ where: { id: session.user.id }, data: { plan } }),
  ]);

  return NextResponse.json({ ok: true });
});
