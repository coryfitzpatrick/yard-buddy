import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { canPause } from "@/lib/subscription";
import { withAxiom } from "@/lib/observability/logger";

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

  // Enforce: trials cannot pause, already-paused cannot pause again
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

  return NextResponse.json({ ok: true, resumesAt: resumesAt.toISOString() });
});

export const DELETE = withAxiom(async (_req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true, planStatus: true },
  });

  if (user.planStatus !== "paused") {
    return NextResponse.json({ error: "Subscription is not paused" }, { status: 400 });
  }

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    pause_collection: null,
  });

  await db.user.update({
    where: { id: session.user.id },
    data: { planStatus: "active", pausedUntil: null },
  });

  return NextResponse.json({ ok: true });
});
