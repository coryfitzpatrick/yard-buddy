import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { withAxiom, logger } from "@/lib/observability/logger";

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

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const scheduleId = subscription.schedule
    ? (typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule.id)
    : null;

  if (!scheduleId) {
    return NextResponse.json({ error: "No pending change to cancel" }, { status: 400 });
  }

  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (err) {
    logger.error("cancel-pending: stripe release failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Couldn't cancel the pending change. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
