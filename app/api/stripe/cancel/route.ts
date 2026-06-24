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
    select: { stripeSubscriptionId: true, planStatus: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  if (user.planStatus === "canceled") {
    return NextResponse.json({ error: "Subscription is already canceled" }, { status: 400 });
  }

  // Release any pending plan change so it doesn't try to fire at the same moment
  // cancellation takes effect. The subscription itself keeps running on its
  // current price until period end.
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
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
