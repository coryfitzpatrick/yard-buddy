import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async (_req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  // Read live state from Stripe rather than our cached planStatus — webhook
  // delivery delays mean our DB can lag behind Stripe's actual subscription
  // state. Use Stripe as the source of truth for "is this already canceled"
  // and "is cancellation already scheduled."
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

  if (subscription.status === "canceled") {
    return NextResponse.json({ error: "Subscription is already canceled" }, { status: 400 });
  }

  if (subscription.cancel_at_period_end) {
    return NextResponse.json({ error: "Cancellation is already scheduled" }, { status: 400 });
  }

  // Release any pending plan change so it doesn't try to fire at the same moment
  // cancellation takes effect. The subscription itself keeps running on its
  // current price until period end.
  const scheduleId = subscription.schedule
    ? (typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule.id)
    : null;
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(scheduleId);
  }

  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  return NextResponse.json({ ok: true });
});
