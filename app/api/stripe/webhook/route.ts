import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";
import { resend, buildPaymentFailedEmail } from "@/lib/email";
import { withAxiom, logger } from "@/lib/observability/logger";
import { getPlanLimits } from "@/lib/subscription";

export async function updateUserFromSubscription(sub: Stripe.Subscription) {
  // Look up user by our stored customerId — never trust payload userId directly
  const user = await db.user.findUnique({
    where: { stripeCustomerId: sub.customer as string },
    select: {
      id: true,
      plan: true,
      planStatus: true,
      currentPeriodEnd: true,
      stripeSubscriptionId: true,
    },
  });
  if (!user) return; // Customer exists in Stripe but not in our DB; skip

  const priceId = sub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId);
  if (!plan) {
    throw new Error(`Unrecognized priceId ${priceId} for customer ${sub.customer} — check STRIPE_PRICE_* env vars`);
  }

  let planStatus: string;
  switch (sub.status) {
    case "trialing":  planStatus = "trialing";  break;
    case "active":    planStatus = "active";    break;
    case "past_due":  planStatus = "past_due";  break;
    case "canceled":  planStatus = "canceled";  break;
    default:
      // Any Stripe status we haven't explicitly enumerated lands here:
      // paused, incomplete, incomplete_expired, unpaid, or anything Stripe
      // adds in the future. The previous default was "expired", which
      // silently started the 30-day account-deletion clock — never the
      // right answer for a state we don't understand. We map to past_due
      // (the non-destructive "billing is unwell" bucket) and log loudly so
      // we know to add real handling next time it shows up.
      logger.warn("Unrecognized Stripe subscription status; mapping to past_due", {
        subscriptionId: sub.id,
        stripeStatus: sub.status,
        customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      });
      planStatus = "past_due";
  }

  // In the v2 Stripe API, current_period_end lives on the subscription item
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;
  const newPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;

  // Idempotency guard: skip the DB write only when EVERY synced field matches.
  // A renewal advances current_period_end without changing plan or planStatus,
  // so we must compare period end here too — otherwise the "Next charge on
  // [date]" copy in the UI sticks at the old date.
  const periodEndMatches =
    (user.currentPeriodEnd?.getTime() ?? null) === (newPeriodEnd?.getTime() ?? null);
  const subscriptionIdMatches = user.stripeSubscriptionId === sub.id;
  if (
    user.plan === plan &&
    user.planStatus === planStatus &&
    periodEndMatches &&
    subscriptionIdMatches
  ) {
    return;
  }

  // Trial → paid: reset the analysis-quota cutoff so trial usage doesn't
  // count against the new plan's first calendar month. Naturally drops off
  // once the calendar month rolls over (startOfMonth > resetAt). planFromPriceId
  // only returns paid plans, so any trial-stored user transitioning here is a
  // trial → paid event.
  const isTrialToPaid = user.plan === "trial";

  // Atomic user update + (optional) auto-restore of archived yards on tier-up.
  // Wrapping both in one transaction guarantees we never leave the user on the
  // new plan with stale archives that should have been brought back.
  const newLimits = getPlanLimits({ plan, planStatus, trialEndsAt: null });
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        plan,
        planStatus,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd: newPeriodEnd,
        ...(isTrialToPaid ? { analysisQuotaResetAt: new Date() } : {}),
      },
    });

    if (newLimits.maxYards !== -1 && newLimits.maxYards > 0) {
      const activeCount = await tx.yard.count({
        where: { userId: user.id, archivedAt: null },
      });
      const restoreCount = newLimits.maxYards - activeCount;
      if (restoreCount > 0) {
        const archived = await tx.yard.findMany({
          where: { userId: user.id, archivedAt: { not: null } },
          orderBy: { archivedAt: "desc" },
          take: restoreCount,
          select: { id: true },
        });
        if (archived.length > 0) {
          await tx.yard.updateMany({
            where: { id: { in: archived.map((y) => y.id) } },
            data: { archivedAt: null },
          });
        }
      }
    }
  });
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
