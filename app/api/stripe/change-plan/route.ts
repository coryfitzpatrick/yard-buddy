import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { plan, period } = body;

  if (!isValidPlan(plan) || !isValidPeriod(period)) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[plan][period];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured" }, { status: 500 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true, plan: true, planStatus: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  if (user.planStatus === "canceled") {
    return NextResponse.json({ error: "Subscription is canceled" }, { status: 400 });
  }

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    return NextResponse.json({ error: "Subscription item not found" }, { status: 500 });
  }

  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "always_invoice",
  });

  await db.user.update({
    where: { id: session.user.id },
    data: { plan },
  });

  return NextResponse.json({ ok: true });
});
