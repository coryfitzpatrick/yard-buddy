"use client";

import { GrassType } from "@/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GRASS_TYPES: Array<{ value: GrassType; label: string; zone: string; description: string }> = [
  { value: "bermuda", label: "Bermuda", zone: "Warm", description: "Drought-tolerant, full sun" },
  { value: "kentucky_bluegrass", label: "Kentucky Bluegrass", zone: "Cool", description: "Lush, dark green" },
  { value: "tall_fescue", label: "Tall Fescue", zone: "Transition/Cool", description: "Shade tolerant" },
  { value: "fine_fescue", label: "Fine Fescue", zone: "Cool", description: "Low maintenance" },
  { value: "zoysia", label: "Zoysia", zone: "Warm/Transition", description: "Dense, heat tolerant" },
  { value: "st_augustine", label: "St. Augustine", zone: "Warm", description: "Shade tolerant, coastal" },
  { value: "centipede", label: "Centipede", zone: "Warm", description: "Low-input, acidic soil" },
  { value: "buffalo", label: "Buffalo Grass", zone: "Warm/Transition", description: "Native, drought hardy" },
  { value: "ryegrass", label: "Ryegrass", zone: "Cool", description: "Fast germination" },
  { value: "unknown", label: "Not Sure", zone: "", description: "We'll help identify it" },
];

interface Props {
  value: GrassType | undefined;
  onChange: (value: GrassType) => void;
}

export function GrassTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {GRASS_TYPES.map((grass) => (
        <Card
          key={grass.value}
          className={cn(
            "p-3 cursor-pointer border-2 transition-all hover:border-green-400",
            value === grass.value ? "border-green-600 bg-green-50" : "border-gray-200"
          )}
          onClick={() => onChange(grass.value)}
        >
          <div className="font-medium text-sm">{grass.label}</div>
          {grass.zone && (
            <div className="text-xs text-gray-500 mt-0.5">{grass.zone} season</div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">{grass.description}</div>
        </Card>
      ))}
    </div>
  );
}
