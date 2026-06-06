import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { TaskList } from "@/components/dashboard/TaskList";
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

  const yards = await db.yardProfile.findMany({
    where: { userId: session.user.id },
    include: {
      tasks: { orderBy: { createdAt: "desc" }, take: 20 },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const yard = yards[0];
  const latestScore = yard.analyses[0]?.healthScore;

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {session.user.name?.split(" ")[0]}!
          </h1>
          <p className="text-gray-500 text-sm">{yard.name} · {yard.grassType.replace(/_/g, " ")} grass</p>
        </div>
        {latestScore != null && (
          <div className="text-center">
            <div className={`text-3xl font-bold ${latestScore >= 70 ? "text-green-600" : latestScore >= 40 ? "text-yellow-600" : "text-red-600"}`}>
              {latestScore}
            </div>
            <div className="text-xs text-gray-400">Health Score</div>
          </div>
        )}
      </div>

      <WeatherWidget zip={yard.zipCode} />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/analyze">
          <Button className="w-full bg-green-600 hover:bg-green-700 h-12">
            <Camera className="mr-2 w-4 h-4" /> Analyze Lawn
          </Button>
        </Link>
        <Link href="/yard/setup">
          <Button variant="outline" className="w-full h-12">
            <Plus className="mr-2 w-4 h-4" /> Add Yard
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">Your Tasks</h2>
        {yard.tasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 text-sm mb-3">No tasks yet. Analyze your lawn to get started.</p>
              <Link href="/analyze">
                <Button className="bg-green-600 hover:bg-green-700">Analyze My Lawn</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <TaskList tasks={yard.tasks} />
        )}
      </div>
    </div>
  );
}
