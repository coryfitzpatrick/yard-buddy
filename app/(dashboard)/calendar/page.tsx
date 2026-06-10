import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { computeGridRange, currentMonthParam, type CalendarTask } from "@/lib/calendar-utils";
import { CalendarDays } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ month?: string; yard?: string; section?: string }>;
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;

  const rawMonth = params.month ?? "";
  const monthNum = parseInt(rawMonth.split("-")[1] ?? "0", 10);
  const monthParam =
    /^\d{4}-\d{2}$/.test(rawMonth) && monthNum >= 1 && monthNum <= 12
      ? rawMonth
      : currentMonthParam();
  const yardParam = params.yard ?? "";
  const sectionParam = params.section ?? "";

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, sections: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  if (yards.length === 0) {
    return (
      <div className="px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <CalendarDays className="w-6 h-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">Add a yard to see your task calendar.</p>
          <Link href="/yard/new" className="text-green-700 font-semibold hover:underline">
            Add your first yard →
          </Link>
        </div>
      </div>
    );
  }

  const { gridStart, gridEnd } = computeGridRange(monthParam);

  const tasks = await db.lawnTask.findMany({
    where: {
      yardSection: {
        yard: { userId: session.user.id },
        ...(sectionParam ? { id: sectionParam } : {}),
        ...(yardParam ? { yardId: yardParam } : {}),
      },
      scheduledStart: { lte: gridEnd },
      scheduledEnd: { gte: gridStart },
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      product: true,
      productSearchQuery: true,
      yardSection: {
        select: { id: true, name: true, yard: { select: { id: true, name: true } } },
      },
    },
    orderBy: { scheduledStart: "asc" },
  });

  const calendarTasks: CalendarTask[] = tasks
    .filter((t: (typeof tasks)[number]) => t.scheduledStart && t.scheduledEnd)
    .map((t: (typeof tasks)[number]) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      scheduledStart: t.scheduledStart!.toISOString(),
      scheduledEnd: t.scheduledEnd!.toISOString(),
      product: t.product,
      productSearchQuery: t.productSearchQuery,
      sectionId: t.yardSection.id,
      sectionName: t.yardSection.name,
      yardId: t.yardSection.yard.id,
      yardName: t.yardSection.yard.name,
    }));

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <div className="flex items-center gap-2 mb-6">
        <CalendarDays className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
      </div>
      <MonthCalendar
        tasks={calendarTasks}
        month={monthParam}
        gridStart={gridStart.toISOString()}
        yards={yards}
        selectedYard={yardParam}
        selectedSection={sectionParam}
      />
    </div>
  );
}
