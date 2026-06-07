import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { TaskList } from "@/components/dashboard/TaskList";
import { YardOverviewCard } from "@/components/dashboard/YardOverviewCard";
import { Plus, Camera } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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

  const sectionIds = yards.flatMap((y) => y.sections.map((s) => s.id));

  const tasks = await db.lawnTask.findMany({
    where: { yardSectionId: { in: sectionIds } },
    orderBy: { createdAt: "desc" },
    include: {
      yardSection: {
        select: { id: true, name: true, areaType: true, yard: { select: { name: true } } },
      },
    },
  });

  const yardSummaries = yards.map((yard) => ({
    id: yard.id,
    name: yard.name,
    zipCode: yard.zipCode,
    sections: yard.sections.map((s) => ({
      id: s.id,
      name: s.name,
      areaType: s.areaType,
      grassType: s.grassType,
      latestHealthScore: s.analyses[0]?.healthScore ?? null,
      pendingTaskCount: s.tasks.filter((t) => t.status !== "completed").length,
    })),
  }));

  const multiYard = yards.length > 1 || yards.some((y) => y.sections.length > 1);
  const primaryZip = yards[0].zipCode;

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {session.user.name?.split(" ")[0]}!
        </h1>
        <Link href="/yard/setup">
          <Button size="sm" className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Yard
          </Button>
        </Link>
      </div>

      <WeatherWidget zip={primaryZip} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">My Yards</h2>
          <Link href="/yard" className="text-sm text-green-700 hover:underline">Manage →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {yardSummaries.map((yard) => <YardOverviewCard key={yard.id} yard={yard} />)}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">{multiYard ? "All Tasks" : "Your Tasks"}</h2>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 mb-3">No tasks yet. Analyze a section to get started.</p>
              <Link href="/analyze">
                <Button className="bg-green-600 hover:bg-green-700">
                  <Camera className="mr-2 w-4 h-4" /> Analyze My Lawn
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <TaskList tasks={tasks} multiYard={multiYard} />
        )}
      </div>
    </div>
  );
}
