import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, Pencil } from "lucide-react";
import { YardDeleteButton } from "@/components/yard/YardDeleteButton";

function parseScheduleSummary(raw: string | null): { days: string; time: string; amount: string } | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.days) || p.days.length === 0) return null;
    const h = p.time ? Number(p.time.split(":")[0]) : null;
    const m = p.time ? Number(p.time.split(":")[1]) : null;
    return {
      days: p.days.join(", "),
      time: h !== null && m !== null ? `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` : "",
      amount: p.inches ?? "",
    };
  } catch { return null; }
}

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      zipCode: true,
      spreaderType: true,
      spreaderModel: true,
      wateringDaysPerWeek: true,
      wateringMinutesPerSession: true,
      mowingSchedule: true,
      wateringSchedule: true,
      sections: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
        },
      },
    },
  });

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Yards</h1>
        <Link href="/yard/setup">
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4" />Add Yard
          </Button>
        </Link>
      </div>

      {yards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">No yards yet. Add your first to get started.</p>
          <Link href="/yard/setup">
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4" />Add Yard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {yards.map((yard) => {
            const yardMow = parseScheduleSummary(yard.mowingSchedule ?? null);
            const yardWater = parseScheduleSummary(yard.wateringSchedule ?? null);
            return (
            <div key={yard.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{yard.name}</h2>
                  <p className="text-sm text-gray-400">
                    ZIP {yard.zipCode}
                    {yard.sections.length > 0 && (
                      <> &middot; {yard.sections.length} section{yard.sections.length !== 1 ? "s" : ""}</>
                    )}
                  </p>
                  {(yard.spreaderType || yard.spreaderModel || yard.wateringDaysPerWeek || yard.wateringMinutesPerSession) && (
                    <div className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                      {(yard.spreaderType || yard.spreaderModel) && (
                        <p>{[yard.spreaderType && `Spreader: ${yard.spreaderType.charAt(0).toUpperCase() + yard.spreaderType.slice(1)}`, yard.spreaderModel].filter(Boolean).join(" · ")}</p>
                      )}
                      {(yard.wateringDaysPerWeek || yard.wateringMinutesPerSession) && (
                        <p>{[yard.wateringDaysPerWeek ? `${yard.wateringDaysPerWeek}x/week` : null, yard.wateringMinutesPerSession ? `${yard.wateringMinutesPerSession} min/session` : null].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                  )}
                  {(yardMow || yardWater) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {yardMow && (
                        <span className="inline-flex items-center text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                          ✂️ {yardMow.days}{yardMow.time ? ` · ${yardMow.time}` : ""}{yardMow.amount ? ` · ${yardMow.amount} in` : ""}
                        </span>
                      )}
                      {yardWater && (
                        <span className="inline-flex items-center text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                          💧 {yardWater.days}{yardWater.time ? ` · ${yardWater.time}` : ""}{yardWater.amount ? ` · ${yardWater.amount} min` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Link href={`/yard/${yard.id}`}>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      <ArrowRight className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                  </Link>
                  <Link href={`/yard/${yard.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  </Link>
                  <Link href={`/yard/${yard.id}/sections/new`}>
                    <Button variant="outline" size="sm">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                    </Button>
                  </Link>
                  <YardDeleteButton yardId={yard.id} yardName={yard.name} />
                </div>
              </div>
              {yard.sections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 mt-1">
                  {yard.sections.map((section) => {
                    const score = section.analyses[0]?.healthScore ?? null;
                    const scoreColor = score == null ? "text-gray-400" : score >= 70 ? "text-green-600" : score >= 40 ? "text-yellow-600" : "text-red-600";
                    return (
                      <Link key={section.id} href={`/yard/${yard.id}/sections/${section.id}`}>
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2.5 gap-1.5">
                          <ArrowRight className="w-3 h-3" />
                          {section.name}
                          {score != null && <span className={`font-semibold ${scoreColor}`}>{score}</span>}
                        </Button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
