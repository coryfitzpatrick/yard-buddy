import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWeatherByZip } from "@/lib/weather";
import { computeNewWindow } from "@/lib/cron/weather-scheduler";
import { assessOverdueTasks } from "@/lib/cron/overdue-assessor";
import { resend, buildDigestEmail, generateUnsubscribeToken } from "@/lib/email";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

  // 1. Fetch yards with pending tasks
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
          lastNotifiedAt: true,
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
              yardSection: { select: { grassType: true, areaType: true } },
            },
          },
        },
      },
    },
  });

  // 2. Fetch weather per unique ZIP
  const weatherByZip = new Map<string, Awaited<ReturnType<typeof getWeatherByZip>>>();
  const uniqueZips = [...new Set(yards.map((y) => y.zipCode))];
  await Promise.all(
    uniqueZips.map(async (zip) => {
      try {
        weatherByZip.set(zip, await getWeatherByZip(zip));
      } catch { /* skip unavailable ZIPs */ }
    })
  );

  // 3. Recalculate windows and collect newly overdue tasks
  type YardSections = typeof yards[0]["sections"];
  type SectionTasks = YardSections[0]["tasks"];

  const overdueBySection = new Map<
    string,
    { tasks: SectionTasks; grassType: string; zip: string }
  >();

  for (const yard of yards) {
    const weather = weatherByZip.get(yard.zipCode);
    if (!weather) continue;

    for (const section of yard.sections) {
      const newlyOverdue: SectionTasks = [];

      for (const task of section.tasks) {
        const condition = task.weatherCondition ?? "any";

        // Check for newly overdue (window closed, not yet assessed)
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

  // 4. Assess newly overdue tasks per section
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

  // 5. Send email digests
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const processedUserIds = new Set<string>();

  for (const yard of yards) {
    const user = yard.user;
    if (processedUserIds.has(user.id)) continue;
    processedUserIds.add(user.id);

    if (!user.notificationsEnabled) continue;
    if (!user.email) continue;
    if (user.lastNotifiedAt && sameDay(user.lastNotifiedAt, today)) continue;

    const allPendingTasks = await db.lawnTask.findMany({
      where: { yardSection: { yard: { userId: user.id } }, status: "pending" },
      include: { yardSection: { select: { name: true } } },
    });

    const overdueTasks = allPendingTasks.filter((t) => t.stillWorthDoing === true);
    const upcomingTasks = allPendingTasks.filter((t) => {
      if (!t.scheduledStart || t.stillWorthDoing !== null) return false;
      const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
      return daysUntilStart >= 0 && daysUntilStart <= 3;
    });

    if (overdueTasks.length === 0 && upcomingTasks.length === 0) continue;

    const unsubToken = generateUnsubscribeToken(user.id);
    const { subject, html } = buildDigestEmail({
      userName: user.name?.split(" ")[0] ?? "there",
      overdueTasks: overdueTasks.map((t) => ({
        title: t.title,
        sectionName: t.yardSection?.name ?? "",
        overdueNote: t.overdueNote,
      })),
      upcomingTasks: upcomingTasks.map((t) => ({
        title: t.title,
        sectionName: t.yardSection?.name ?? "",
        scheduledStart: t.scheduledStart,
        scheduledEnd: t.scheduledEnd,
      })),
      dashboardUrl: `${baseUrl}/dashboard`,
      unsubscribeUrl: `${baseUrl}/api/notifications/unsubscribe?token=${unsubToken}`,
    });

    try {
      await resend.emails.send({
        from: "Yard Buddy <onboarding@resend.dev>",
        to: user.email,
        subject,
        html,
      });
      await db.user.update({
        where: { id: user.id },
        data: { lastNotifiedAt: new Date() },
      });
    } catch (err) {
      console.error("Email send failed for user:", user.id, err);
    }
  }

  return NextResponse.json({ ok: true, processed: yards.length });
}
