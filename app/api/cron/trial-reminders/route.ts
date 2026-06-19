import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { resend, buildTrialReminderEmail } from "@/lib/email";
import { mapWithConcurrency } from "@/lib/cron/concurrency";

export const maxDuration = 300;
const EMAIL_CONCURRENCY = 10;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const today = startOfToday();
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const pricingUrl = `${baseUrl}/pricing`;
  const reminderDays = [7, 1];

  let sent = 0;

  for (const daysLeft of reminderDays) {
    const targetDate = addDays(today, daysLeft);

    const trialUsers = await db.user.findMany({
      where: {
        planStatus: "trialing",
        trialEndsAt: {
          gte: targetDate,
          lt: addDays(targetDate, 1),
        },
      },
      select: { id: true, email: true, name: true },
    });

    await mapWithConcurrency(trialUsers, EMAIL_CONCURRENCY, async (user) => {
      if (!user.email) return;
      const { subject, html } = buildTrialReminderEmail({
        userName: user.name?.split(" ")[0] ?? "there",
        daysLeft,
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
        console.error(`Trial reminder (${daysLeft}d) failed for user ${user.id}:`, err);
      }
    });
  }

  return NextResponse.json({ ok: true, sent });
}
