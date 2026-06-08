import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { WeatherCondition } from "@/types";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

interface ConfirmedTask {
  title: string;
  description: string;
  priority: string;
  scheduledStartDays: number;
  scheduledEndDays: number;
  weatherCondition: WeatherCondition;
  productSuggestion?: string;
  applicationRate?: string;
  spreaderSetting?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const { routine, tasks }: { routine: string | null; tasks: ConfirmedTask[] } = await req.json();

  if (!Array.isArray(tasks)) {
    return NextResponse.json({ error: "tasks must be an array" }, { status: 400 });
  }
  if (tasks.length > 20) {
    return NextResponse.json({ error: "Too many tasks" }, { status: 400 });
  }
  if (typeof routine === "string" && routine.length > 1000) {
    return NextResponse.json({ error: "routine too long" }, { status: 400 });
  }

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = new Date();

  await db.$transaction([
    db.yardSection.update({
      where: { id: sectionId },
      data: { currentRoutine: routine ?? null },
    }),
    ...tasks.map((t) =>
      db.lawnTask.create({
        data: {
          yardSectionId: sectionId,
          title: t.title,
          description: t.description,
          priority: t.priority,
          product: t.productSuggestion ?? null,
          applicationRate: t.applicationRate ?? null,
          spreaderSetting: t.spreaderSetting ?? null,
          taskMode: "maintenance",
          scheduledStart: typeof t.scheduledStartDays === "number"
            ? addDays(today, t.scheduledStartDays)
            : null,
          scheduledEnd: typeof t.scheduledEndDays === "number"
            ? addDays(today, t.scheduledEndDays)
            : null,
          weatherCondition: t.weatherCondition ?? null,
        },
      })
    ),
  ]);

  return NextResponse.json({ ok: true });
}
