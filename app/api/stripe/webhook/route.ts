import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";

async function updateUserFromSubscription(sub: Stripe.Subscription) {
  // Look up user by our stored customerId — never trust payload userId directly
  const user = await db.user.findUnique({
    where: { stripeCustomerId: sub.customer as string },
    select: { id: true, plan: true, planStatus: true },
  });
  if (!user) return; // Customer exists in Stripe but not in our DB; skip

  const priceId = sub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId);
  if (!plan) {
    console.warn(`Webhook: unrecognized priceId ${priceId} for customer ${sub.customer}`);
    return;
  }

  let planStatus: string;
  switch (sub.status) {
    case "trialing": planStatus = "trialing"; break;
    case "active":   planStatus = "active";   break;
    case "paused":   planStatus = "paused";   break;
    case "canceled": planStatus = "canceled"; break;
    default:         planStatus = "expired";
  }

  const pausedUntil = sub.pause_collection?.resumes_at
    ? new Date(sub.pause_collection.resumes_at * 1000)
    : null;

  // Skip update if nothing changed (idempotency guard)
  if (user.plan === plan && user.planStatus === planStatus && !sub.pause_collection) {
    return;
  }

  // In the v2 Stripe API, current_period_end lives on the subscription item
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;

  await db.user.update({
    where: { id: user.id },
    data: {
      plan,
      planStatus,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      pausedUntil,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        if (checkoutSession.mode === "subscription" && checkoutSession.subscription) {
          const subId =
            typeof checkoutSession.subscription === "string"
              ? checkoutSession.subscription
              : checkoutSession.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await updateUserFromSubscription(sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await updateUserFromSubscription(sub);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionDetails = invoice.parent?.subscription_details;
        if (subscriptionDetails) {
          const subId =
            typeof subscriptionDetails.subscription === "string"
              ? subscriptionDetails.subscription
              : subscriptionDetails.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await updateUserFromSubscription(sub);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`Webhook processing failed for event ${event.type}:`, err);
    // Return 200 to prevent Stripe from retrying events we've already partially processed
    return NextResponse.json({ received: true, error: "Processing error" });
  }

  return NextResponse.json({ received: true });
}
