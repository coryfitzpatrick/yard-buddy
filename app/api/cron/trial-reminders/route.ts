import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { resend, buildTrialReminderEmail, buildDay5ScheduleNudgeEmail, buildDay10TaskNudgeEmail } from "@/lib/email";
import { userHasAnySchedule, userHasAnyCompletedTask } from "@/lib/subscription";
import { TRIAL_DAYS } from "@/lib/time";
import { sendPushToUser } from "@/lib/push/send";
import { mapWithConcurrency } from "@/lib/cron/concurrency";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";

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

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const today = startOfToday();
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const pricingUrl = `${baseUrl}/pricing`;
  const reminderDays = [7, 1];

  let sent = 0;
  let failed = 0;

  try {
    // Day-5 nudge: users who have not set any schedule yet.
    const day5TargetDaysLeft = TRIAL_DAYS - 5; // 16
    const day5Target = addDays(today, day5TargetDaysLeft);
    const day5Users = await db.user.findMany({
      where: {
        planStatus: "trialing",
        day5NudgeSentAt: null,
        trialEngagementBonusGrantedAt: null,
        trialEndsAt: { gte: day5Target, lt: addDays(day5Target, 1) },
      },
      select: { id: true, email: true, name: true },
    });
    await mapWithConcurrency(day5Users, EMAIL_CONCURRENCY, async (user) => {
      if (!user.email) return;
      const hasSchedule = await userHasAnySchedule(user.id);
      if (hasSchedule) return; // condition cleared — nudge not needed.

      // Claim the nudge slot before sending. If another worker beat us (or this
      // is a retry), count will be 0 and we skip. This prevents double-send when
      // the cron is retried mid-batch.
      const claim = await db.user.updateMany({
        where: { id: user.id, day5NudgeSentAt: null },
        data: { day5NudgeSentAt: new Date() },
      });
      if (claim.count === 0) return;

      const { subject, html } = buildDay5ScheduleNudgeEmail({
        userName: user.name?.split(" ")[0] ?? "there",
        scheduleSetupUrl: `${baseUrl}/dashboard`,
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
        logger.error("trial-reminders: day5 email send failed", {
          userId: user.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await sendPushToUser(user.id, {
          title: "Earn 7 more trial days",
          body: "Set your watering or mowing schedule to unlock the bonus.",
          data: { kind: "trial_day5" },
        });
      } catch {
        /* push failure non-fatal */
      }
    });

    // Day-10 nudge: users with a schedule but no completed task.
    const day10TargetDaysLeft = TRIAL_DAYS - 10; // 11
    const day10Target = addDays(today, day10TargetDaysLeft);
    const day10Users = await db.user.findMany({
      where: {
        planStatus: "trialing",
        day10NudgeSentAt: null,
        trialEngagementBonusGrantedAt: null,
        trialEndsAt: { gte: day10Target, lt: addDays(day10Target, 1) },
      },
      select: { id: true, email: true, name: true },
    });
    await mapWithConcurrency(day10Users, EMAIL_CONCURRENCY, async (user) => {
      if (!user.email) return;
      const [hasSchedule, hasTask] = await Promise.all([
        userHasAnySchedule(user.id),
        userHasAnyCompletedTask(user.id),
      ]);
      if (!hasSchedule || hasTask) return; // either condition makes the nudge irrelevant.

      // Claim-first idempotency: mark the flag before sending to prevent retry double-sends.
      const claim = await db.user.updateMany({
        where: { id: user.id, day10NudgeSentAt: null },
        data: { day10NudgeSentAt: new Date() },
      });
      if (claim.count === 0) return;

      const { subject, html } = buildDay10TaskNudgeEmail({
        userName: user.name?.split(" ")[0] ?? "there",
        dashboardUrl: `${baseUrl}/dashboard`,
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
        logger.error("trial-reminders: day10 email send failed", {
          userId: user.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await sendPushToUser(user.id, {
          title: "Almost there",
          body: "Mark one task as done to earn 7 more trial days.",
          data: { kind: "trial_day10" },
        });
      } catch { /* push failure non-fatal */ }
    });

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
          failed++;
          logger.error("trial-reminders: email send failed", {
            daysLeft,
            userId: user.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    emitCronRun({
      route: "trial-reminders",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
    });
    return NextResponse.json({ ok: true, sent, failed });
  } catch (err) {
    emitCronRun({
      route: "trial-reminders",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err; // let withAxiom + the framework handle the 500
  }
});
