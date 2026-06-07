import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { DashboardInteractiveSection } from "@/components/dashboard/DashboardInteractiveSection";
import { Greeting } from "@/components/dashboard/Greeting";
import { Plus } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
          tasks: { select: { status: true } },
        },
      },
    },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const sectionIds = yards.flatMap((y: (typeof yards)[number]) => y.sections.map((s: (typeof yards)[number]["sections"][number]) => s.id));

  const rawTasks = await db.lawnTask.findMany({
    where: { yardSectionId: { in: sectionIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      overdueNote: true,
      stillWorthDoing: true,
      product: true,
      applicationRate: true,
      spreaderSetting: true,
      yardSection: {
        select: { id: true, name: true, areaType: true, yard: { select: { name: true } } },
      },
    },
  });

  const tasks = rawTasks.map((t) => ({
    ...t,
    scheduledStart: t.scheduledStart?.toISOString() ?? null,
    scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
  }));

  const yardSummaries = yards.map((yard: (typeof yards)[number]) => ({
    id: yard.id,
    name: yard.name,
    zipCode: yard.zipCode,
    sections: yard.sections.map((s: (typeof yards)[number]["sections"][number]) => ({
      id: s.id,
      name: s.name,
      areaType: s.areaType,
      latestHealthScore: s.analyses[0]?.healthScore ?? null,
    })),
  }));

  const weatherRefreshedAt = yards[0]?.weatherRefreshedAt?.toISOString() ?? null;

  const allSections = yards.flatMap((y: (typeof yards)[number]) =>
    y.sections.map((s: (typeof yards)[number]["sections"][number]) => ({
      id: s.id,
      name: s.name,
      yardId: y.id,
      yardName: y.name,
      showYardLabel: yards.length > 1,
    }))
  );

  const primaryZip = yards[0].zipCode;

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <Greeting name={session.user.name?.split(" ")[0] ?? "there"} />
        <Link href="/yard/setup">
          <Button size="sm" className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Yard
          </Button>
        </Link>
      </div>

      <WeatherWidget zip={primaryZip} />

      <DashboardInteractiveSection
        yards={yardSummaries}
        tasks={tasks}
        allSections={allSections}
        weatherRefreshedAt={weatherRefreshedAt}
      />
    </div>
  );
}
