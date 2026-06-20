import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { resend, buildCardExpiringEmail } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { DAY_MS, DAYS_30_MS } from "@/lib/time";
import { mapWithConcurrency } from "@/lib/cron/concurrency";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";
import Stripe from "stripe";

export const maxDuration = 300;
// Bounded to stay well under Stripe's 100 req/sec limit (each subscriber does
// 2 Stripe calls: customer retrieve + portal session). 5 × 2 = 10 in-flight.
const STRIPE_CONCURRENCY = 5;

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  let warned = 0;
  let failed = 0;

  try {
    const today = startOfToday();
    const expiryWarnCutoff = new Date(Date.now() - 25 * DAY_MS);
    const upcomingBillingCutoff = new Date(Date.now() + DAYS_30_MS);

    const activeSubscribers = await db.user.findMany({
      where: {
        planStatus: { in: ["active", "past_due"] },
        stripeCustomerId: { not: null },
        stripeSubscriptionId: { not: null },
        currentPeriodEnd: { lte: upcomingBillingCutoff, gte: today },
        OR: [
          { cardExpiryWarningSentAt: null },
          { cardExpiryWarningSentAt: { lt: expiryWarnCutoff } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
        currentPeriodEnd: true,
      },
      take: 50,
    });

    await mapWithConcurrency(activeSubscribers, STRIPE_CONCURRENCY, async (subscriber) => {
      try {
        const customer = await stripe.customers.retrieve(subscriber.stripeCustomerId!, {
          expand: ["invoice_settings.default_payment_method"],
        });
        if (customer.deleted) return;

        const pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
        if (!pm || typeof pm === "string") return;
        if (pm.type !== "card" || !pm.card) return;

        const { exp_month, exp_year, last4 } = pm.card;
        const nextBilling = subscriber.currentPeriodEnd!;
        const billingYear = nextBilling.getUTCFullYear();
        const billingMonth = nextBilling.getUTCMonth() + 1;

        const cardExpiresBeforeBilling =
          exp_year < billingYear ||
          (exp_year === billingYear && exp_month < billingMonth);

        if (!cardExpiresBeforeBilling) return;

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: subscriber.stripeCustomerId!,
          return_url: `${process.env.NEXTAUTH_URL ?? "https://yardanalyzer.com"}/settings`,
        });

        const { subject, html } = buildCardExpiringEmail({
          userName: subscriber.name ?? subscriber.email,
          cardLast4: last4,
          expiryMonth: exp_month,
          expiryYear: exp_year,
          nextBillingDate: nextBilling,
          billingPortalUrl: portalSession.url,
        });

        await resend.emails.send({
          from: "Yard Analyzer <noreply@yardanalyzer.com>",
          to: subscriber.email,
          subject,
          html,
        });

        await db.user.update({
          where: { id: subscriber.id },
          data: { cardExpiryWarningSentAt: new Date() },
        });

        warned++;
        logger.info("card-expiry: warning sent", { userId: subscriber.id });
      } catch (err) {
        failed++;
        logger.error("card-expiry: check failed", {
          userId: subscriber.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    emitCronRun({
      route: "card-expiry",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { warned, failed },
    });
    return NextResponse.json({ ok: true, warned });
  } catch (err) {
    emitCronRun({
      route: "card-expiry",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { warned, failed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err;
  }
});
