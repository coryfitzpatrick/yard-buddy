import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const planParam = searchParams.get("plan");
  const periodParam = searchParams.get("period") ?? "monthly";

  // Validate inputs against explicit allowlists — never trust raw user input
  if (!isValidPlan(planParam) || !isValidPeriod(periodParam)) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[planParam][periodParam];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured" }, { status: 500 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, stripeSubscriptionId: true, name: true, email: true },
  });

  // Prevent creating a checkout session if the user already has an active subscription
  if (user.stripeSubscriptionId) {
    return NextResponse.redirect(new URL("/settings", req.url));
  }

  // Create or retrieve Stripe customer — always use our DB record, never a param
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      name: user.name ?? undefined,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await db.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/settings?billing=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
    subscription_data: {
      metadata: { userId: session.user.id, plan: planParam },
    },
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.redirect(checkoutSession.url);
}
