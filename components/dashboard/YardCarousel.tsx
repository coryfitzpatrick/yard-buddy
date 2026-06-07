"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { ArrowRight, CheckCircle2 } from "lucide-react";

interface YardCardSection {
  id: string;
  name: string;
  areaType: string | null;
  latestHealthScore: number | null;
}

interface YardCard {
  id: string;
  name: string;
  zipCode: string;
  sections: YardCardSection[];
}

interface Props {
  yards: YardCard[];
  selectedYardId: string | null;
  onSelect: (yardId: string | null) => void;
}

export function YardCarousel({ yards, selectedYardId, onSelect }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
      {yards.map((yard) => {
        const selected = yard.id === selectedYardId;
        return (
          <button
            key={yard.id}
            type="button"
            onClick={() => onSelect(selected ? null : yard.id)}
            className={cn(
              "shrink-0 w-48 text-left rounded-xl border-2 p-3 transition-all bg-white",
              selected
                ? "border-green-500 ring-1 ring-green-300 bg-green-50"
                : "border-gray-200 hover:border-green-300"
            )}
          >
            <div className="flex items-start justify-between gap-1 mb-1">
              <span
                className={cn(
                  "font-semibold text-sm leading-tight",
                  selected ? "text-green-900" : "text-gray-900"
                )}
              >
                {yard.name}
              </span>
              <Link
                href={`/yard/${yard.id}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 flex items-center gap-0.5 text-xs font-medium text-green-600 hover:text-green-700 px-1.5 py-0.5 rounded-md hover:bg-green-100 transition-colors"
              >
                View <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-xs text-gray-400 mb-2">ZIP {yard.zipCode}</p>
            <div className="space-y-1 mb-3">
              {yard.sections.slice(0, 3).map((s) => {
                const areaCfg = s.areaType ? AREA_CONFIG[s.areaType as AreaType] : null;
                const Icon = areaCfg?.icon;
                const dotColor =
                  s.latestHealthScore == null ? "bg-gray-200" :
                  s.latestHealthScore >= 70 ? "bg-green-400" :
                  s.latestHealthScore >= 40 ? "bg-yellow-400" : "bg-red-400";
                return (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                    {Icon && <Icon className="w-3 h-3 text-gray-400 shrink-0" />}
                    <span className="text-xs text-gray-600 truncate">{s.name}</span>
                  </div>
                );
              })}
              {yard.sections.length > 3 && (
                <p className="text-xs text-gray-400">+{yard.sections.length - 3} more</p>
              )}
              {yard.sections.length === 0 && (
                <p className="text-xs text-gray-400">No sections yet</p>
              )}
            </div>
            <div
              className={cn(
                "border-t pt-2 flex items-center gap-1 text-xs",
                selected ? "border-green-200 text-green-700" : "border-gray-100 text-gray-400"
              )}
            >
              {selected ? (
                <><CheckCircle2 className="w-3 h-3" /> Filtering tasks</>
              ) : (
                "Tap to filter tasks"
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
