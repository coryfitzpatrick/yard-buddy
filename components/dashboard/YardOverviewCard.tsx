import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { Camera } from "lucide-react";

interface SectionSummary {
  id: string;
  name: string;
  areaType: string | null;
  grassType: string;
  latestHealthScore: number | null;
  pendingTaskCount: number;
}

interface YardSummary {
  id: string;
  name: string;
  zipCode: string;
  sections: SectionSummary[];
}

export function YardOverviewCard({ yard }: { yard: YardSummary }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">{yard.name}</h3>
        <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {yard.sections.map((section) => {
          const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
          const AreaIcon = areaCfg?.icon;
          const scoreColor =
            section.latestHealthScore == null ? "text-gray-300" :
            section.latestHealthScore >= 70    ? "text-green-600" :
            section.latestHealthScore >= 40    ? "text-yellow-600" : "text-red-600";

          return (
            <div key={section.id} className="flex items-center justify-between py-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {AreaIcon && <AreaIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{section.name}</div>
                  <div className="text-xs text-gray-400 capitalize">{section.grassType.replace(/_/g, " ")}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {section.latestHealthScore != null && (
                  <span className={`text-sm font-bold ${scoreColor}`}>{section.latestHealthScore}</span>
                )}
                {section.pendingTaskCount > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">
                    {section.pendingTaskCount}
                  </span>
                )}
                <Link href={`/analyze?sectionId=${section.id}`}>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                    <Camera className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
        {yard.sections.length === 0 && (
          <p className="text-sm text-gray-400 py-2">No sections yet.</p>
        )}
      </div>
    </div>
  );
}
