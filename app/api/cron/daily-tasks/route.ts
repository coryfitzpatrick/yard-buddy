import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { getWeatherByZip } from "@/lib/weather";
import { computeNewWindow } from "@/lib/cron/weather-scheduler";
import { assessOverdueTasks } from "@/lib/cron/overdue-assessor";
import { getTodayReminders } from "@/lib/cron/reminder-scheduler";
import { resend, buildDigestEmail, generateUnsubscribeToken } from "@/lib/email";
import { buildWeatherAlerts, type WeatherAlert } from "@/lib/email/weather-alerts";
import { computeDailyGdd, isPreEmergentApplicable, isGrubAlertApplicable, isOverseedingApplicable } from "@/lib/gdd-utils";
import { mapWithConcurrency } from "@/lib/cron/concurrency";
import { withAxiom, logger } from "@/lib/observability/logger";
import {
  emitCronRun,
  emitPushDelivery,
  emitWateringReminderPushed,
  emitMowingReminderPushed,
  emitWateringWeatherAlerted,
  emitMowingWeatherAlerted,
  type PushKind,
} from "@/lib/observability/events";
import { emitYesterdaysAiSummary } from "@/lib/observability/ai-daily-summary";
import { sendPushToUser, type PushPayload } from "@/lib/push/send";
import {
  shouldPushBestDay,
  shouldPushWeatherWarning,
  shouldPushPreEmergent,
  shouldPushGrub,
  shouldPushOverseed,
  shouldPushWateringReminder,
  shouldPushMowingReminder,
  shouldPushWateringWeatherWarning,
  shouldPushMowingWeatherWarning,
} from "@/lib/push/triggers";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";
import { hashEmail } from "@/lib/observability/redact";

const EMAIL_CONCURRENCY = 10;
// Each yard's processing is a small read-modify-write sequence on its own
// GDD record plus a handful of task updates. Yards don't share state, so
// processing in parallel is safe. Bounded at 5 to keep DB connections in
// check (each yard can have ~5-10 in-flight queries).
const YARD_CONCURRENCY = 5;

export const maxDuration = 300;

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

// Fire-and-forget push wrapper. Catches all errors so a push failure can never
// block the cron's other work. sendPushToUser itself prunes failed tokens and
// logs delivery-level detail; we emit the typed event for kind-aware dashboards.
async function safePushUser(
  userId: string,
  payload: PushPayload,
  kind: PushKind,
): Promise<void> {
  try {
    const result = await sendPushToUser(userId, payload);
    // I-2: suppress emission when no devices are registered for this user.
    // Otherwise the cron would emit one info event per yard per trigger per day
    // for every user without push enabled — pure observability noise.
    if (result.tokens === 0) return;
    emitPushDelivery({
      userIdHash: hashEmail(userId),
      pushKind: kind,
      tokens: result.tokens,
      success: result.success,
      failed: result.failed,
    });
  } catch (err) {
    logger.error("push: send threw", {
      userId,
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    emitPushDelivery({
      userIdHash: hashEmail(userId),
      pushKind: kind,
      tokens: 0,
      success: 0,
      failed: 1,
    });
  }
}

async function runDailyTasks(
  today: Date,
  progress: { yardsProcessed: number; usersProcessed: number },
): Promise<void> {
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
          plan: true,
          notificationsEnabled: true,
          reminderNotificationsEnabled: true,
          reminderDaysBefore: true,
          lastNotifiedAt: true,
          notifyDaysAhead: true,
          gddNotificationsEnabled: true,
          gddBestDayReminderDays: true,
          emailNotificationsEnabled: true,
          pushNotificationsEnabled: true,
          taskPushEnabled: true,
          schedulePushEnabled: true,
          weatherEmailEnabled: true,
          weatherPushEnabled: true,
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
      yards: {
        some: {
          OR: [
            { wateringDays: { isEmpty: false } },
            { mowingDays: { isEmpty: false } },
            { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
          ],
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      notificationsEnabled: true,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: true,
      lastNotifiedAt: true,
      notifyDaysAhead: true,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: true,
      taskPushEnabled: true,
      schedulePushEnabled: true,
      weatherEmailEnabled: true,
      weatherPushEnabled: true,
      yards: {
        where: {
          OR: [
            { wateringDays: { isEmpty: false } },
            { mowingDays: { isEmpty: false } },
            { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
          ],
        },
        select: {
          name: true,
          zipCode: true,
          wateringDays: true,
          wateringTime: true,
          wateringMinutesPerSession: true,
          mowingDays: true,
          mowingTime: true,
          mowingHeightInches: true,
          sections: {
            select: {
              id: true,
              name: true,
              wateringDays: true,
              wateringTime: true,
              wateringMinutesPerSession: true,
              mowingDays: true,
              mowingTime: true,
              mowingHeightInches: true,
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
    { tasks: SectionTasks; grassType: string; zip: string; userId: string }
  >();

  await mapWithConcurrency(yards, YARD_CONCURRENCY, async (yard) => {
    const weather = weatherByZip.get(yard.zipCode);
    if (!weather) {
      logger.warn("daily-tasks: no weather data, skipping yard", { zipCode: yard.zipCode, yardId: yard.id });
      return;
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

        // Track effective scheduledStart so we can evaluate trigger predicates
        // against the post-update window state rather than the snapshot we read.
        let effectiveScheduledStart = task.scheduledStart;

        if (newWindow) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: newWindow.scheduledStart, scheduledEnd: newWindow.scheduledEnd },
          });
          effectiveScheduledStart = newWindow.scheduledStart;
        } else if (condition === "any" && task.scheduledEnd && isBefore(task.scheduledEnd, today)) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: today, scheduledEnd: addDays(today, windowDays - 1) },
          });
          effectiveScheduledStart = today;
        }

        // Weather-warning push: tomorrow's scheduled task with a weather concern.
        if (
          shouldPushWeatherWarning(
            { scheduledStart: effectiveScheduledStart, weatherCondition: task.weatherCondition },
            today,
          )
        ) {
          await safePushUser(
            yard.userId,
            {
              title: "Weather alert for tomorrow",
              body: `${task.title} is scheduled for tomorrow and weather may affect it.`,
              data: { yardId: yard.id, taskId: task.id, kind: "weather_warning" },
            },
            "weather_warning",
          );
        }
      }

      if (newlyOverdue.length > 0) {
        overdueBySection.set(section.id, {
          tasks: newlyOverdue,
          grassType: section.grassType,
          zip: yard.zipCode,
          userId: yard.userId,
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

    // Track whether each window qualifies on its own merits (independent of
    // the "fired" flag) so we can pass both signals to the push predicates
    // for the first-true transition check. Gating the transaction on
    // `qualifiesOnMerits && !alreadyFired` keeps us from re-firing each day
    // the window stays open.
    const month = today.getUTCMonth();
    const avgTemp = ((weather.forecast[0]?.high ?? 0) + (weather.forecast[0]?.low ?? 0)) / 2;

    const preEmergentQualifies = gddRecord.cumulativeGdd >= 50;
    const grubsQualifies = gddRecord.cumulativeGdd >= 300;
    const overseedQualifies = month >= 7 && month <= 9 && avgTemp < 65;

    // Pre-emergent: cumulative GDD ≥ 50
    if (preEmergentQualifies && !gddRecord.preEmergentFired) {
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
    if (grubsQualifies && !gddRecord.grubsFired) {
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
    if (overseedQualifies && !gddRecord.overseedingFired) {
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

    // GDD-window-opening pushes: fire on the first-true transition only.
    // Predicates take (qualifiesOnMerits, alreadyFired). The pre-update
    // "fired" flag is exactly yesterday's window-open state because it flips
    // false→true the moment the window first opens; combining
    // (qualifies-today) with (was-fired-yesterday) yields the first-true
    // transition and ensures we emit one push per yard per window per season.
    if (shouldPushPreEmergent(preEmergentQualifies, gddRecord.preEmergentFired)) {
      await safePushUser(
        yard.userId,
        {
          title: "Pre-emergent window open",
          body: "Soil temps just hit the pre-emergent window for your zone.",
          data: { yardId: yard.id, kind: "preemergent_window" },
        },
        "preemergent_window",
      );
    }
    if (shouldPushGrub(grubsQualifies, gddRecord.grubsFired)) {
      await safePushUser(
        yard.userId,
        {
          title: "Grub treatment window open",
          body: "Soil temps just hit the grub treatment window for your zone.",
          data: { yardId: yard.id, kind: "grub_window" },
        },
        "grub_window",
      );
    }
    if (shouldPushOverseed(overseedQualifies, gddRecord.overseedingFired)) {
      await safePushUser(
        yard.userId,
        {
          title: "Overseeding window open",
          body: "Conditions look right to overseed your lawn.",
          data: { yardId: yard.id, kind: "overseed_window" },
        },
        "overseed_window",
      );
    }

    // Best-day push: any pending task across this yard whose bestDay is today.
    // This catches both tasks just stamped by the GDD transitions above and
    // tasks whose bestDay was set on prior runs and happens to equal today.
    const bestDayTasks = await db.lawnTask.findMany({
      where: {
        status: "pending",
        bestDay: { not: null },
        yardSection: { yardId: yard.id },
      },
      select: { id: true, title: true, bestDay: true },
    });
    for (const task of bestDayTasks) {
      if (!shouldPushBestDay(task, today)) continue;
      await safePushUser(
        yard.userId,
        {
          title: "Today is the best day",
          body: `Today is the recommended day to ${task.title.toLowerCase()}.`,
          data: { yardId: yard.id, taskId: task.id, kind: "best_day" },
        },
        "best_day",
      );
    }
  });
  progress.yardsProcessed = yards.length;

  // 5. Assess newly overdue tasks per section
  for (const [, { tasks, grassType, zip, userId }] of overdueBySection) {
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
        weatherSummary,
        { userId, feature: "overdue-assessor" },
      );

      for (const a of assessments) {
        await db.lawnTask.update({
          where: { id: a.taskId },
          data: { stillWorthDoing: a.stillWorthDoing, overdueNote: a.overdueNote },
        });
      }
    } catch (err) {
      logger.error("daily-tasks: overdue assessment failed", {
        err: err instanceof Error ? err.message : String(err),
      });
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

  const userEntries = Array.from(userMap.entries());
  await mapWithConcurrency(userEntries, EMAIL_CONCURRENCY, async ([userId, { taskUser, reminderUser }]) => {
    const user = taskUser ?? reminderUser!;
    if (!user.email) return;
    if (user.lastNotifiedAt && sameDay(user.lastNotifiedAt, today)) return;

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

    // Collect reminder content using structured schedule fields
    let scheduledReminders: Awaited<ReturnType<typeof getTodayReminders>> = [];

    // Build the effective-schedule sections array (used for both email reminders and push)
    const sections = reminderUser
      ? reminderUser.yards.flatMap((y) =>
          y.sections.map((s) => ({
            id: s.id,
            name: s.name,
            yardName: y.name,
            effectiveWatering: effectiveWatering(s, y, reminderUser.plan ?? null),
            effectiveMowing: effectiveMowing(s, y, reminderUser.plan ?? null),
          }))
        )
      : [];

    if (user.reminderNotificationsEnabled && reminderUser) {
      scheduledReminders = getTodayReminders(sections, today, user.reminderDaysBefore);
    }

    // Push: schedule reminders (watering + mowing today)
    const todayDayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][today.getUTCDay()];

    if (reminderUser && user.pushNotificationsEnabled && user.schedulePushEnabled) {
      for (const section of sections) {
        const wateringToday = section.effectiveWatering.days.includes(todayDayName);
        const mowingToday = section.effectiveMowing.days.includes(todayDayName);

        if (shouldPushWateringReminder({ effective: section.effectiveWatering, todayIsScheduled: wateringToday })) {
          await safePushUser(
            userId,
            {
              title: "Watering reminder",
              body: `${section.yardName}: water for ${section.effectiveWatering.minutesPerSession} minutes today.`,
            },
            "schedule_reminder",
          );
          try {
            emitWateringReminderPushed({ sectionId: section.id, userId });
          } catch {
            // Telemetry is best-effort.
          }
        }
        if (shouldPushMowingReminder({ effective: section.effectiveMowing, todayIsScheduled: mowingToday })) {
          await safePushUser(
            userId,
            {
              title: "Mowing reminder",
              body: `${section.yardName}: mow today at ${section.effectiveMowing.heightInches} inches.`,
            },
            "schedule_reminder",
          );
          try {
            emitMowingReminderPushed({ sectionId: section.id, userId });
          } catch {
            // Telemetry is best-effort.
          }
        }
      }
    }

    // Push: weather warnings for scheduled watering/mowing days
    if (reminderUser && user.pushNotificationsEnabled && user.weatherPushEnabled) {
      for (const section of sections) {
        const yard = reminderUser.yards.find((y) => y.name === section.yardName);
        const wx = yard ? weatherByZip.get(yard.zipCode) : null;
        // Map precipitationChance (0–100 percentage) to 0–1 fraction for the trigger predicate.
        // rainfallInches is not available from the current weather API; default to 0.
        const todayForecast = wx
          ? { chanceOfRain: (wx.precipitationChance ?? 0) / 100, rainfallInches: 0 }
          : null;
        const wateringToday = section.effectiveWatering.days.includes(todayDayName);
        const mowingToday = section.effectiveMowing.days.includes(todayDayName);

        if (shouldPushWateringWeatherWarning({ todayIsScheduled: wateringToday, todayForecast })) {
          await safePushUser(
            userId,
            {
              title: "Rain expected today",
              body: `${section.yardName}: rain is forecast on your watering day.`,
            },
            "weather_warning",
          );
          try {
            emitWateringWeatherAlerted({ sectionId: section.id, userId, reason: "rain_forecast" });
          } catch {
            // Telemetry is best-effort.
          }
        }
        if (shouldPushMowingWeatherWarning({ todayIsScheduled: mowingToday, todayForecast })) {
          await safePushUser(
            userId,
            {
              title: "Wet grass forecast",
              body: `${section.yardName}: rain is forecast on your mowing day.`,
            },
            "weather_warning",
          );
          try {
            emitMowingWeatherAlerted({ sectionId: section.id, userId, reason: "rain_forecast" });
          } catch {
            // Telemetry is best-effort.
          }
        }
      }
    }

    // Compute weather alerts for the next 5 days (email only)
    let weatherAlerts: WeatherAlert[] = [];
    if (reminderUser && user.weatherEmailEnabled) {
      const forecastByZip = new Map<string, Array<{ date: Date; chanceOfRain: number; rainfallInches: number }>>();
      for (const [zip, wx] of weatherByZip.entries()) {
        if (!wx?.forecast) continue;
        forecastByZip.set(zip, wx.forecast.map((d) => ({
          date: new Date(d.date),
          chanceOfRain: (d.precipChance ?? 0) / 100,
          rainfallInches: 0, // Not available from the weather API; default to 0 (same as Task 13).
        })));
      }
      const sectionsForAlerts = reminderUser.yards.flatMap((y) =>
        y.sections.map((s) => ({
          yardName: y.name,
          yardZip: y.zipCode,
          effectiveWatering: effectiveWatering(s, y, reminderUser.plan ?? null),
          effectiveMowing: effectiveMowing(s, y, reminderUser.plan ?? null),
        }))
      );
      weatherAlerts = buildWeatherAlerts({ sections: sectionsForAlerts, forecastByZip, today });
    }

    // Gate email digest on the master email toggle
    const hasTaskContent = overdueTasks.length > 0 || upcomingTasks.length > 0;
    const hasReminderContent = scheduledReminders.length > 0;
    const emailEnabled = user.emailNotificationsEnabled ?? true;
    const taskEmailEnabled = user.notificationsEnabled;
    const reminderEmailEnabled = user.reminderNotificationsEnabled;

    const shouldSendEmail =
      emailEnabled &&
      ((hasTaskContent && taskEmailEnabled) || (hasReminderContent && reminderEmailEnabled));

    if (!shouldSendEmail) return;

    const unsubToken = generateUnsubscribeToken(userId);
    const { subject, html } = buildDigestEmail({
      userName: user.name?.split(" ")[0] ?? "there",
      overdueTasks: taskEmailEnabled ? overdueTasks : [],
      upcomingTasks: taskEmailEnabled ? upcomingTasks : [],
      scheduledReminders: reminderEmailEnabled ? scheduledReminders : [],
      weatherAlerts,
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
      logger.error("daily-tasks: email send failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });
  progress.usersProcessed = userMap.size;
}

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const today = startOfToday();
  const progress = { yardsProcessed: 0, usersProcessed: 0 };

  try {
    // Emit yesterday's AI cost summary (fire-and-forget — don't fail the cron
    // if this aggregate query has a hiccup; withAxiom captures any throw).
    try {
      await emitYesterdaysAiSummary();
    } catch (err) {
      logger.error("daily-tasks: ai daily summary failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    await runDailyTasks(today, progress);
    emitCronRun({
      route: "daily-tasks",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { yards: progress.yardsProcessed, usersProcessed: progress.usersProcessed },
    });
    return NextResponse.json({ ok: true, processed: progress.usersProcessed });
  } catch (err) {
    emitCronRun({
      route: "daily-tasks",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { yards: progress.yardsProcessed, usersProcessed: progress.usersProcessed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err;
  }
});
