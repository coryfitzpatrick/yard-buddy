import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWeatherByZip } from "@/lib/weather";
import { computeNewWindow } from "@/lib/cron/weather-scheduler";
import { assessOverdueTasks } from "@/lib/cron/overdue-assessor";
import { getTodayReminders } from "@/lib/cron/reminder-scheduler";
import { resend, buildDigestEmail, generateUnsubscribeToken } from "@/lib/email";

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
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfToday();

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
    let upcomingTasks: Array<{ title: string; sectionName: string; scheduledStart: Date | null; scheduledEnd: Date | null }> = [];

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
          if (!t.scheduledStart || t.stillWorthDoing !== null) return false;
          const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
          return daysUntilStart >= 0 && daysUntilStart <= user.notifyDaysAhead;
        })
        .map((t) => ({ title: t.title, sectionName: t.yardSection?.name ?? "", scheduledStart: t.scheduledStart, scheduledEnd: t.scheduledEnd }));
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

  return NextResponse.json({ ok: true, processed: userMap.size });
}
