import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { resend, buildGracePeriodWarningEmail } from "@/lib/email";
import { mapWithConcurrency } from "@/lib/cron/concurrency";
import { sendPushToUser } from "@/lib/push/send";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";

export const maxDuration = 300;
const EMAIL_CONCURRENCY = 10;

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface Touchpoint {
  daysAfterExpiry: number; // grace days elapsed
  daysUntilDeletion: number; // 30 minus daysAfterExpiry
  flagField:
    | "graceDay14EmailSentAt"
    | "graceDay7EmailSentAt"
    | "graceDay2EmailSentAt";
  pushFlagField: "gracePush7SentAt" | "gracePush1SentAt" | null;
  push: { title: string; body: string } | null;
}

const TOUCHPOINTS: Touchpoint[] = [
  {
    daysAfterExpiry: 16,
    daysUntilDeletion: 14,
    flagField: "graceDay14EmailSentAt",
    pushFlagField: null,
    push: null,
  },
  {
    daysAfterExpiry: 23,
    daysUntilDeletion: 7,
    flagField: "graceDay7EmailSentAt",
    pushFlagField: "gracePush7SentAt",
    push: {
      title: "Last week to keep your Yard Analyzer data",
      body: "Upgrade now to save your schedule and analyses.",
    },
  },
  {
    daysAfterExpiry: 28,
    daysUntilDeletion: 2,
    flagField: "graceDay2EmailSentAt",
    pushFlagField: "gracePush1SentAt",
    push: {
      title: "Your data deletes in 2 days",
      body: "Upgrade to keep your yard records.",
    },
  },
];

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const today = startOfToday();
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const pricingUrl = `${baseUrl}/pricing`;

  let sent = 0;
  let failed = 0;

  try {
    for (const tp of TOUCHPOINTS) {
      // Users whose trial ended `tp.daysAfterExpiry` days ago.
      const expiryDay = addDays(today, -tp.daysAfterExpiry);
      const where: Record<string, unknown> = {
        OR: [
          { planStatus: "trialing", trialEndsAt: { gte: expiryDay, lt: addDays(expiryDay, 1) } },
          { planStatus: "expired", trialEndsAt: { gte: expiryDay, lt: addDays(expiryDay, 1) } },
        ],
        stripeSubscriptionId: null,
        [tp.flagField]: null,
      };
      const users = await db.user.findMany({
        where: where as never,
        select: { id: true, email: true, name: true },
      });

      await mapWithConcurrency(users, EMAIL_CONCURRENCY, async (user) => {
        if (!user.email) return;

        // Claim-first idempotency.
        const claim = await db.user.updateMany({
          where: { id: user.id, [tp.flagField]: null } as never,
          data: { [tp.flagField]: new Date(), ...(tp.pushFlagField ? { [tp.pushFlagField]: new Date() } : {}) } as never,
        });
        if (claim.count === 0) return;

        const { subject, html } = buildGracePeriodWarningEmail({
          userName: user.name?.split(" ")[0] ?? "there",
          daysUntilDeletion: tp.daysUntilDeletion,
          pricingUrl,
        });
        try {
          await resend.emails.send({
            from: "Yard Analyzer <noreply@yardanalyzer.com>",
            to: user.email,
            subject,
            html,
          });
          sent++;
        } catch (err) {
          failed++;
          logger.error("account-deletion-warnings: email send failed", {
            daysUntilDeletion: tp.daysUntilDeletion,
            userId: user.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
        if (tp.push) {
          try {
            await sendPushToUser(user.id, {
              title: tp.push.title,
              body: tp.push.body,
              data: { kind: `grace_${tp.daysUntilDeletion}d` },
            });
          } catch { /* non-fatal */ }
        }
      });
    }

    emitCronRun({
      route: "account-deletion-warnings",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
    });
    return NextResponse.json({ ok: true, sent, failed });
  } catch (err) {
    emitCronRun({
      route: "account-deletion-warnings",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err;
  }
});
