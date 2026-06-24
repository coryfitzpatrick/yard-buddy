import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";
import { resend, buildPaymentFailedEmail } from "@/lib/email";
import { withAxiom, logger } from "@/lib/observability/logger";
import { getPlanLimits } from "@/lib/subscription";

async function updateUserFromSubscription(sub: Stripe.Subscription) {
  // Look up user by our stored customerId — never trust payload userId directly
  const user = await db.user.findUnique({
    where: { stripeCustomerId: sub.customer as string },
    select: { id: true, plan: true, planStatus: true, pauseStartedAt: true },
  });
  if (!user) return; // Customer exists in Stripe but not in our DB; skip

  const priceId = sub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId);
  if (!plan) {
    throw new Error(`Unrecognized priceId ${priceId} for customer ${sub.customer} — check STRIPE_PRICE_* env vars`);
  }

  // A "trialing" status with metadata.pauseExtension means we set trial_end
  // to push a paid annual subscription's renewal out by the pause duration.
  // It is not a real trial — surface it as active/paused based on whether
  // pause_collection is currently in force.
  const isPauseExtension = sub.metadata?.pauseExtension === "true";

  let planStatus: string;
  switch (sub.status) {
    case "trialing":
      planStatus = isPauseExtension ? (sub.pause_collection ? "paused" : "active") : "trialing";
      break;
    case "active":    planStatus = "active";    break;
    case "past_due":  planStatus = "past_due";  break;
    case "paused":    planStatus = "paused";    break;
    case "canceled":  planStatus = "canceled";  break;
    default:          planStatus = "expired";
  }

  const pausedUntil = sub.pause_collection?.resumes_at
    ? new Date(sub.pause_collection.resumes_at * 1000)
    : null;

  // Skip update if nothing changed (idempotency guard). When a pause-extension
  // subscription naturally auto-resumes we still need to clear our pause
  // tracking fields, so allow the update through whenever pauseStartedAt is
  // set but Stripe no longer has pause_collection.
  const pauseStateNeedsReset = user.pauseStartedAt && !sub.pause_collection;
  if (
    user.plan === plan &&
    user.planStatus === planStatus &&
    !sub.pause_collection &&
    !pauseStateNeedsReset
  ) {
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
      // Auto-resume: pause_collection cleared by Stripe. We don't shorten the
      // trial_end here (the user used the whole pause), but we do clear our
      // tracking fields so a future user-initiated pause starts fresh.
      ...(pauseStateNeedsReset
        ? { pauseStartedAt: null, pauseOriginalPeriodEnd: null }
        : {}),
    },
  });

  // Auto-restore most recently archived yards if the new plan increases the limit.
  const newLimits = getPlanLimits({ plan, planStatus, trialEndsAt: null });
  if (newLimits.maxYards !== -1 && newLimits.maxYards > 0) {
    const activeCount = await db.yard.count({
      where: { userId: user.id, archivedAt: null },
    });
    const restoreCount = newLimits.maxYards - activeCount;
    if (restoreCount > 0) {
      const archived = await db.yard.findMany({
        where: { userId: user.id, archivedAt: { not: null } },
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
}

export const POST = withAxiom(async (req: NextRequest) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.error("Webhook signature verification failed", {
      err: err instanceof Error ? err.message : String(err),
    });
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
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const attemptCount = invoice.attempt_count ?? 1;

        const user = await db.user.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, email: true, name: true, planStatus: true, lastPaymentFailedInvoiceId: true },
        });
        if (!user) break;

        // Idempotency: skip if we already processed this exact invoice attempt
        if (user.lastPaymentFailedInvoiceId === invoice.id) break;

        const updates: Parameters<typeof db.user.update>[0]["data"] = {
          lastPaymentFailedInvoiceId: invoice.id,
        };

        // Only flip to past_due if currently active; re-retries leave status alone
        if (user.planStatus === "active") {
          updates.planStatus = "past_due";
        }

        await db.user.update({ where: { id: user.id }, data: updates });

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${process.env.NEXTAUTH_URL ?? "https://yardanalyzer.com"}/settings`,
        });

        const { subject, html } = buildPaymentFailedEmail({
          userName: user.name ?? user.email,
          billingPortalUrl: portalSession.url,
          attemptCount,
        });

        await resend.emails.send({
          from: "Yard Analyzer <noreply@yardanalyzer.com>",
          to: user.email,
          subject,
          html,
        });

        break;
      }
    }
  } catch (err) {
    logger.error("Webhook processing failed", {
      eventType: event.type,
      err: err instanceof Error ? err.message : String(err),
    });
    // Return 200 to prevent Stripe from retrying events we've already partially processed
    return NextResponse.json({ received: true, error: "Processing error" });
  }

  return NextResponse.json({ received: true });
});
