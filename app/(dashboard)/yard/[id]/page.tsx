import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus, Camera, Pencil, ArrowRight } from "lucide-react";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { SectionHealthChart } from "@/components/yard/SectionHealthChart";
import { YardTasksSection } from "@/components/yard/YardTasksSection";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { format } from "date-fns";

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function parseScheduleSummary(raw: string | null): { days: string; time: string; amount: string } | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.days) || p.days.length === 0) return null;
    return {
      days: p.days.join(", "),
      time: p.time ? formatTime(p.time) : "",
      amount: p.inches ?? "",
    };
  } catch { return null; }
}

export default async function YardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { weatherWidgetCollapsed: true },
  });

  const yard = await db.yard.findFirst({
    where: { id, userId: session.user.id },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: {
            orderBy: { createdAt: "asc" },
            select: { id: true, healthScore: true, createdAt: true },
          },
          tasks: {
            where: { status: { not: "skipped" } },
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
              taskMode: true,
              productSearchQuery: true,
            },
          },
        },
      },
    },
  });
  if (!yard) notFound();

  const sections = yard.sections.map((s) => ({ id: s.id, name: s.name }));

  const allTasks = yard.sections.flatMap((s) =>
    s.tasks.map((t) => ({
      ...t,
      scheduledStart: t.scheduledStart?.toISOString() ?? null,
      scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
      yardSection: { id: s.id, name: s.name, areaType: s.areaType, yard: { name: yard.name } },
    }))
  );

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <Link
        href="/yard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> My Yards
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{yard.name}</h1>
          <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/yard/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </Link>
          <Link href={`/yard/${id}/sections/new`}>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-1" /> Add Section
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <WeatherWidget
          zip={yard.zipCode}
          initialCollapsed={user?.weatherWidgetCollapsed ?? false}
        />
      </div>

      {(yard.mowingSchedule || yard.wateringSchedule) && (() => {
        const yardMow = parseScheduleSummary(yard.mowingSchedule ?? null);
        const yardWater = parseScheduleSummary(yard.wateringSchedule ?? null);
        if (!yardMow && !yardWater) return null;
        return (
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400 font-medium">Yard defaults:</span>
            {yardMow && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">
                ✂️ {yardMow.days}{yardMow.time ? ` · ${yardMow.time}` : ""}{yardMow.amount ? ` · ${yardMow.amount} in` : ""}
              </span>
            )}
            {yardWater && (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1">
                💧 {yardWater.days}{yardWater.time ? ` · ${yardWater.time}` : ""}{yardWater.amount ? ` · ${yardWater.amount} min` : ""}
              </span>
            )}
          </div>
        );
      })()}

      {yard.sections.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-4">No sections yet. Add your first section to get started.</p>
          <Link href={`/yard/${id}/sections/new`}>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-1" /> Add Section
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {yard.sections.map((section: NonNullable<typeof yard>["sections"][number]) => {
              const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
              const AreaIcon = areaCfg?.icon;
              const latestAnalysis = section.analyses[section.analyses.length - 1] ?? null;
              const mowSummary = parseScheduleSummary(section.mowingSchedule ?? null) ?? parseScheduleSummary(yard.mowingSchedule ?? null);
              const waterSummary = parseScheduleSummary(section.wateringSchedule ?? null) ?? parseScheduleSummary(yard.wateringSchedule ?? null);
              const mowIsYardDefault = !parseScheduleSummary(section.mowingSchedule ?? null) && !!mowSummary;
              const waterIsYardDefault = !parseScheduleSummary(section.wateringSchedule ?? null) && !!waterSummary;
              const chartData = section.analyses.map((a: (typeof section)["analyses"][number]) => ({
                date: a.createdAt.toISOString(),
                score: a.healthScore,
              }));
              const scoreColor =
                latestAnalysis == null ? "text-gray-300" :
                latestAnalysis.healthScore >= 70 ? "text-green-600" :
                latestAnalysis.healthScore >= 40 ? "text-yellow-600" : "text-red-600";

              return (
                <div key={section.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {AreaIcon && <AreaIcon className="w-4 h-4 text-gray-400" />}
                        <h2 className="font-semibold text-gray-900 text-lg">{section.name}</h2>
                      </div>
                      <p className="text-sm text-gray-400 capitalize mt-0.5">
                        {section.grassType.replace(/_/g, " ")}
                        {section.yardSizeSqft ? ` · ${section.yardSizeSqft.toLocaleString()} sq ft` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/yard/${yard.id}/sections/${section.id}`}>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          <ArrowRight className="w-3.5 h-3.5 mr-1" /> View
                        </Button>
                      </Link>
                      <Link href={`/yard/${yard.id}/sections/${section.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                      </Link>
                      <Link href={`/analyze?sectionId=${section.id}`}>
                        <Button variant="outline" size="sm">
                          <Camera className="w-3.5 h-3.5 mr-1" /> Analyze
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {latestAnalysis ? (
                    <div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className={`text-3xl font-bold ${scoreColor}`}>
                          {latestAnalysis.healthScore}
                        </span>
                        <span className="text-sm text-gray-400">/ 100</span>
                        <span className="text-xs text-gray-400 ml-auto">
                          {format(new Date(latestAnalysis.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      {chartData.length >= 2 && <SectionHealthChart data={chartData} />}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No analyses yet — tap Analyze to get started.</p>
                  )}

                  {/* Soil & section details */}
                  {(section.soilPh || section.soilMoisture || section.nitrogenPpm || section.phosphorusPpm || section.potassiumPpm || section.soilTestSource || section.notes) && (
                    <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-2">
                      {(section.soilPh || section.soilMoisture) && (
                        <p>
                          {[
                            section.soilPh ? `pH ${section.soilPh}` : null,
                            section.soilMoisture ? `${section.soilMoisture.charAt(0).toUpperCase() + section.soilMoisture.slice(1)} moisture` : null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {(section.nitrogenPpm || section.phosphorusPpm || section.potassiumPpm) && (
                        <p>
                          {[
                            section.nitrogenPpm ? `N: ${section.nitrogenPpm} ppm` : null,
                            section.phosphorusPpm ? `P: ${section.phosphorusPpm} ppm` : null,
                            section.potassiumPpm ? `K: ${section.potassiumPpm} ppm` : null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {section.soilTestSource && <p>Source: {section.soilTestSource}</p>}
                      {section.notes && <p className="italic truncate">"{section.notes}"</p>}
                    </div>
                  )}

                  {(mowSummary || waterSummary) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {mowSummary && (
                        <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 ${mowIsYardDefault ? "bg-gray-50 text-gray-500 border-gray-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                          ✂️ {mowSummary.days}{mowSummary.time ? ` · ${mowSummary.time}` : ""}{mowSummary.amount ? ` · ${mowSummary.amount} in` : ""}{mowIsYardDefault ? " (yard default)" : ""}
                        </span>
                      )}
                      {waterSummary && (
                        <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 ${waterIsYardDefault ? "bg-gray-50 text-gray-500 border-gray-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                          💧 {waterSummary.days}{waterSummary.time ? ` · ${waterSummary.time}` : ""}{waterSummary.amount ? ` · ${waterSummary.amount} min` : ""}{waterIsYardDefault ? " (yard default)" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <YardTasksSection sections={sections} tasks={allTasks} />
        </>
      )}
    </div>
  );
}
