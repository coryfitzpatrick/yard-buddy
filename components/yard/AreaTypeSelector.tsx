"use client";

import type { AreaType } from "@/types";
import { cn } from "@/lib/utils";
import { Home, TreePine, PanelLeft, PanelRight, Flower2, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AreaConfig { label: string; icon: LucideIcon; hint: string; }

export const AREA_CONFIG: Record<AreaType, AreaConfig> = {
  front:      { label: "Front Yard",  icon: Home,       hint: "Street-facing, high visibility" },
  back:       { label: "Back Yard",   icon: TreePine,   hint: "Private, recreational space" },
  left_side:  { label: "Left Side",   icon: PanelLeft,  hint: "Side yard, left of house" },
  right_side: { label: "Right Side",  icon: PanelRight, hint: "Side yard, right of house" },
  garden:     { label: "Garden",      icon: Flower2,    hint: "Garden or landscaped area" },
  other:      { label: "Other",       icon: MapPin,     hint: "Custom area" },
};

interface Props {
  value: AreaType | null | undefined;
  onChange: (v: AreaType) => void;
}

export function AreaTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {(Object.entries(AREA_CONFIG) as [AreaType, AreaConfig][]).map(([key, cfg]) => {
        const Icon = cfg.icon;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all hover:border-green-400",
              selected ? "border-green-600 bg-green-50" : "border-gray-200 bg-white"
            )}
          >
            <Icon className={cn("w-5 h-5", selected ? "text-green-700" : "text-gray-400")} />
            <span className="font-medium text-sm">{cfg.label}</span>
            <span className="text-xs text-gray-400 leading-tight">{cfg.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
