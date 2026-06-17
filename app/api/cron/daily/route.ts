import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { getWeatherByZip } from "@/lib/weather";
import { computeNewWindow } from "@/lib/cron/weather-scheduler";
import { assessOverdueTasks } from "@/lib/cron/overdue-assessor";
import { getTodayReminders } from "@/lib/cron/reminder-scheduler";
import { resend, buildDigestEmail, buildTrialReminderEmail, buildCardExpiringEmail, generateUnsubscribeToken } from "@/lib/email";
import { computeDailyGdd, isPreEmergentApplicable, isGrubAlertApplicable, isOverseedingApplicable } from "@/lib/gdd-utils";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const provided = authHeader ?? "";
  const tokensMatch =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!tokensMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfToday();
  const currentYear = today.getUTCFullYear();

  // 1. Fetch yards with pending tasks (for task processing + notifications)
  const yards = await db.yard.findMany({
    where: {
      sections: { some: { tasks: { some: { status: "pending" } } } },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          notificationsEnabled: true,
          reminderNotificationsEnabled: true,
          reminderDaysBefore: true,
          lastNotifiedAt: true,
          notifyDaysAhead: true,
          gddNotificationsEnabled: true,
          gddBestDayReminderDays: true,
        },
      },
      sections: {
        include: {
          tasks: {
            where: { status: "pending" },
            select: {
              id: true,
              title: true,
              scheduledStart: true,
              scheduledEnd: true,
              weatherCondition: true,
              stillWorthDoing: true,
            },
          },
        },
      },
    },
  });

  // 2. Fetch users with reminder notifications enabled who have any schedule
  // (yard-level or section-level). May overlap with task users — deduplicated later.
  const reminderUsers = await db.user.findMany({
    where: {
      reminderNotificationsEnabled: true,
      yards: {
        some: {
          OR: [
            { mowingSchedule: { not: null } },
            { wateringSchedule: { not: null } },
            { sections: { some: { OR: [{ mowingSchedule: { not: null } }, { wateringSchedule: { not: null } }] } } },
          ],
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      notificationsEnabled: true,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: true,
      lastNotifiedAt: true,
      notifyDaysAhead: true,
      yards: {
        where: {
          OR: [
            { mowingSchedule: { not: null } },
            { wateringSchedule: { not: null } },
            { sections: { some: { OR: [{ mowingSchedule: { not: null } }, { wateringSchedule: { not: null } }] } } },
          ],
        },
        select: {
          name: true,
          mowingSchedule: true,
          wateringSchedule: true,
          sections: {
            select: {
              name: true,
              mowingSchedule: true,
              wateringSchedule: true,
            },
          },
        },
      },
    },
  });

  // 3. Fetch weather per unique ZIP
  const weatherByZip = new Map<string, Awaited<ReturnType<typeof getWeatherByZip>>>();
  const uniqueZips = [...new Set(yards.map((y) => y.zipCode))];
  await Promise.all(
    uniqueZips.map(async (zip) => {
      try {
        weatherByZip.set(zip, await getWeatherByZip(zip));
      } catch { /* skip unavailable ZIPs */ }
    })
  );

  // 4. Recalculate windows and collect newly overdue tasks
  type YardSections = typeof yards[0]["sections"];
  type SectionTasks = YardSections[0]["tasks"];

  const overdueBySection = new Map<
    string,
    { tasks: SectionTasks; grassType: string; zip: string }
  >();

  for (const yard of yards) {
    const weather = weatherByZip.get(yard.zipCode);
    if (!weather) {
      console.warn(`[cron] No weather data for ZIP ${yard.zipCode}, skipping yard ${yard.id}`);
      continue;
    }

    for (const section of yard.sections) {
      const newlyOverdue: SectionTasks = [];

      for (const task of section.tasks) {
        const condition = task.weatherCondition ?? "any";

        if (task.scheduledEnd && isBefore(task.scheduledEnd, today) && task.stillWorthDoing === null) {
          newlyOverdue.push(task);
          continue;
        }

        const windowDays =
          task.scheduledStart && task.scheduledEnd
            ? Math.max(1, Math.round((task.scheduledEnd.getTime() - task.scheduledStart.getTime()) / 86400000))
            : 7;

        const newWindow = computeNewWindow(condition as import("@/types").WeatherCondition, weather.forecast, windowDays, today);

        if (newWindow) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: newWindow.scheduledStart, scheduledEnd: newWindow.scheduledEnd },
          });
        } else if (condition === "any" && task.scheduledEnd && isBefore(task.scheduledEnd, today)) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: today, scheduledEnd: addDays(today, windowDays - 1) },
          });
        }
      }

      if (newlyOverdue.length > 0) {
        overdueBySection.set(section.id, {
          tasks: newlyOverdue,
          grassType: section.grassType,
          zip: yard.zipCode,
        });
      }
    }

    await db.yard.update({
      where: { id: yard.id },
      data: { weatherRefreshedAt: new Date() },
    });

    // GDD enrichment — runs after window recalculation for this yard
    const dailyGdd = computeDailyGdd(
      weather.forecast[0]?.high ?? 0,
      weather.forecast[0]?.low ?? 0,
    );

    const existing = await db.gddRecord.findUnique({
      where: { yardId_year: { yardId: yard.id, year: currentYear } },
    });
    const newCumulative = (existing?.cumulativeGdd ?? 0) + dailyGdd;
    const gddRecord = await db.gddRecord.upsert({
      where: { yardId_year: { yardId: yard.id, year: currentYear } },
      create: { yardId: yard.id, year: currentYear, cumulativeGdd: dailyGdd },
      update: { cumulativeGdd: newCumulative },
    });

    const state = yard.state ?? "";

    // Pre-emergent: cumulative GDD ≥ 50
    if (!gddRecord.preEmergentFired && gddRecord.cumulativeGdd >= 50) {
      const taskUpdates = yard.sections
        .filter((section) => isPreEmergentApplicable(section.grassType, state))
        .map((section) =>
          db.lawnTask.updateMany({
            where: {
              yardSectionId: section.id,
              status: "pending",
              title: { contains: "pre-emergent", mode: "insensitive" },
            },
            data: { bestDay: today, gddThreshold: "pre_emergent" },
          })
        );
      await db.$transaction([
        ...taskUpdates,
        db.gddRecord.update({ where: { id: gddRecord.id }, data: { preEmergentFired: true } }),
      ]);
    }

    // Grubs: cumulative GDD ≥ 300
    if (!gddRecord.grubsFired && gddRecord.cumulativeGdd >= 300) {
      const taskUpdates = yard.sections
        .filter((section) => isGrubAlertApplicable(section.grassType, state))
        .map((section) =>
          db.lawnTask.updateMany({
            where: {
              yardSectionId: section.id,
              status: "pending",
              title: { contains: "grub", mode: "insensitive" },
            },
            data: { bestDay: today, gddThreshold: "grubs" },
          })
        );
      await db.$transaction([
        ...taskUpdates,
        db.gddRecord.update({ where: { id: gddRecord.id }, data: { grubsFired: true } }),
      ]);
    }

    // Overseeding: avg temp < 65°F AND month Aug–Oct (0-indexed: 7–9)
    const month = today.getUTCMonth();
    const avgTemp = ((weather.forecast[0]?.high ?? 0) + (weather.forecast[0]?.low ?? 0)) / 2;
    if (!gddRecord.overseedingFired && month >= 7 && month <= 9 && avgTemp < 65) {
      const taskUpdates = yard.sections
        .filter((section) => isOverseedingApplicable(section.grassType))
        .map((section) =>
          db.lawnTask.updateMany({
            where: {
              yardSectionId: section.id,
              status: "pending",
              title: { contains: "overseed", mode: "insensitive" },
            },
            data: { bestDay: today, gddThreshold: "overseeding" },
          })
        );
      await db.$transaction([
        ...taskUpdates,
        db.gddRecord.update({ where: { id: gddRecord.id }, data: { overseedingFired: true } }),
      ]);
    }
  }

  // 5. Assess newly overdue tasks per section
  for (const [, { tasks, grassType, zip }] of overdueBySection) {
    const weather = weatherByZip.get(zip);
    const weatherSummary = weather
      ? `${weather.temp}F, ${weather.description}, ${weather.precipitationChance}% rain`
      : "weather unavailable";

    try {
      const assessments = await assessOverdueTasks(
        tasks
          .filter((t) => t.scheduledEnd !== null)
          .map((t) => ({
            id: t.id,
            title: t.title,
            scheduledEnd: t.scheduledEnd!,
            grassType,
          })),
        weatherSummary
      );

      for (const a of assessments) {
        await db.lawnTask.update({
          where: { id: a.taskId },
          data: { stillWorthDoing: a.stillWorthDoing, overdueNote: a.overdueNote },
        });
      }
    } catch (err) {
      console.error("Overdue assessment failed for section:", err);
    }
  }

  // 6. Send email digests — tasks + schedule reminders combined per user
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // Build a unified map: userId → user data (task users take precedence for task content)
  type TaskUser = typeof yards[0]["user"];
  type ReminderUser = typeof reminderUsers[0];

  const userMap = new Map<string, { taskUser?: TaskUser; reminderUser?: ReminderUser }>();

  for (const yard of yards) {
    const existing = userMap.get(yard.user.id) ?? {};
    userMap.set(yard.user.id, { ...existing, taskUser: yard.user });
  }
  for (const ru of reminderUsers) {
    const existing = userMap.get(ru.id) ?? {};
    userMap.set(ru.id, { ...existing, reminderUser: ru });
  }

  for (const [userId, { taskUser, reminderUser }] of userMap) {
    const user = taskUser ?? reminderUser!;
    if (!user.email) continue;
    if (user.lastNotifiedAt && sameDay(user.lastNotifiedAt, today)) continue;

    // Collect task content
    let overdueTasks: Array<{ title: string; sectionName: string; overdueNote: string | null }> = [];
    let upcomingTasks: Array<{ title: string; sectionName: string; scheduledStart: Date | null; scheduledEnd: Date | null; bestDay: Date | null }> = [];

    if (user.notificationsEnabled) {
      const allPendingTasks = await db.lawnTask.findMany({
        where: { yardSection: { yard: { userId } }, status: "pending" },
        include: { yardSection: { select: { name: true } } },
      });

      overdueTasks = allPendingTasks
        .filter((t) => t.stillWorthDoing === true)
        .map((t) => ({ title: t.title, sectionName: t.yardSection?.name ?? "", overdueNote: t.overdueNote }));

      upcomingTasks = allPendingTasks
        .filter((t) => {
          if (t.stillWorthDoing !== null) return false;

          // GDD best-day logic — uses gddBestDayReminderDays instead of notifyDaysAhead
          if (t.bestDay && t.gddThreshold && taskUser?.gddNotificationsEnabled) {
            const daysUntilBestDay = (t.bestDay.getTime() - today.getTime()) / 86400000;
            return daysUntilBestDay >= 0 && daysUntilBestDay <= (taskUser.gddBestDayReminderDays ?? 0);
          }

          // Regular upcoming task logic
          if (!t.scheduledStart) return false;
          const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
          return daysUntilStart >= 0 && daysUntilStart <= user.notifyDaysAhead;
        })
        .map((t) => ({
          title: t.title,
          sectionName: t.yardSection?.name ?? "",
          scheduledStart: t.scheduledStart,
          scheduledEnd: t.scheduledEnd,
          bestDay: t.bestDay ?? null,
        }));
    }

    // Collect reminder content
    let scheduledReminders: Awaited<ReturnType<typeof getTodayReminders>> = [];

    if (user.reminderNotificationsEnabled && reminderUser) {
      const sections = reminderUser.yards.flatMap((y) =>
        y.sections.map((s) => ({
          name: s.name,
          yardName: y.name,
          mowingSchedule: s.mowingSchedule,
          wateringSchedule: s.wateringSchedule,
          yardMowingSchedule: y.mowingSchedule,
          yardWateringSchedule: y.wateringSchedule,
        }))
      );
      scheduledReminders = getTodayReminders(sections, today, user.reminderDaysBefore);
    }

    if (overdueTasks.length === 0 && upcomingTasks.length === 0 && scheduledReminders.length === 0) continue;

    const unsubToken = generateUnsubscribeToken(userId);
    const { subject, html } = buildDigestEmail({
      userName: user.name?.split(" ")[0] ?? "there",
      overdueTasks,
      upcomingTasks,
      scheduledReminders,
      dashboardUrl: `${baseUrl}/dashboard`,
      unsubscribeUrl: `${baseUrl}/api/notifications/unsubscribe?token=${unsubToken}`,
    });

    try {
      await resend.emails.send({
        from: "Yard Analyzer <onboarding@resend.dev>",
        to: user.email,
        subject,
        html,
      });
      await db.user.update({
        where: { id: userId },
        data: { lastNotifiedAt: new Date() },
      });
    } catch (err) {
      console.error("Email send failed for user:", userId, err);
    }
  }

  // === Trial expiry reminders (7 days out and 1 day out) ===
  const pricingUrl = `${baseUrl}/pricing`;
  const reminderDays = [7, 1];

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

    for (const user of trialUsers) {
      if (!user.email) continue;
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
      } catch (err) {
        console.error(`Trial reminder (${daysLeft}d) failed for user ${user.id}:`, err);
      }
    }
  }

  // === Expired account data deletion ===
  const deletionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const usersToDelete = await db.user.findMany({
    where: {
      OR: [
        {
          planStatus: { in: ["trialing", "expired"] },
          trialEndsAt: { lt: deletionCutoff },
          stripeSubscriptionId: null,
        },
        {
          planStatus: "canceled",
          currentPeriodEnd: { lt: deletionCutoff },
        },
      ],
    },
    select: { id: true, email: true },
    take: 50,
  });

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let deletedCount = 0;
  for (const user of usersToDelete) {
    try {
      const analyses = await db.lawnAnalysis.findMany({
        where: { yardSection: { yard: { userId: user.id } } },
        select: { imageUrls: true },
      });
      const allUrls = analyses.flatMap((a) => a.imageUrls);

      if (allUrls.length > 0) {
        const paths = allUrls
          .map((url) => {
            const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
            return match ? match[1] : null;
          })
          .filter((p): p is string => p !== null);

        if (paths.length > 0) {
          await supabase.storage.from("lawn-photos").remove(paths);
        }
      }

      await db.user.delete({ where: { id: user.id } });
      deletedCount++;
      console.log(`Deleted expired account: ${user.id}`);
    } catch (err) {
      console.error(`Failed to delete user ${user.id}:`, err);
    }
  }

  // === Card expiry warning ===
  const expiryWarnCutoff = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
  const upcomingBillingCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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

  for (const subscriber of activeSubscribers) {
    try {
      const customer = await stripe.customers.retrieve(subscriber.stripeCustomerId!, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (customer.deleted) continue;

      const pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
      if (!pm || typeof pm === "string") continue;
      if (pm.type !== "card" || !pm.card) continue;

      const { exp_month, exp_year, last4 } = pm.card;
      const nextBilling = subscriber.currentPeriodEnd!;
      const billingYear = nextBilling.getUTCFullYear();
      const billingMonth = nextBilling.getUTCMonth() + 1;

      const cardExpiresBeforeBilling =
        exp_year < billingYear ||
        (exp_year === billingYear && exp_month < billingMonth);

      if (!cardExpiresBeforeBilling) continue;

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

      console.log(`Card expiry warning sent to user ${subscriber.id}`);
    } catch (err) {
      console.error(`Card expiry check failed for user ${subscriber.id}:`, err);
    }
  }

  // Purge rate limit attempts older than 24h
  await db.rateLimitAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });

  return NextResponse.json({ ok: true, processed: userMap.size, deletedAccounts: deletedCount });
}
