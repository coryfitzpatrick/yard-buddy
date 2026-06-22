"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SCHEDULE_DAYS,
  SCHEDULE_TIME_OPTIONS,
  MOWING_HEIGHT_OPTIONS,
  WATERING_MINUTE_OPTIONS,
} from "@/lib/schedule";

interface Props {
  kind: "watering" | "mowing";
  label: string;
  days: string[];
  time: string | null;
  secondaryValue: number | null;
  onDaysChange: (next: string[]) => void;
  onTimeChange: (next: string | null) => void;
  onSecondaryChange: (next: number | null) => void;
  // Optional yard-default hint, rendered next to the label when no override.
  yardDefaultHint?: string | null;
}

export function ScheduleEditor({
  kind,
  label,
  days,
  time,
  secondaryValue,
  onDaysChange,
  onTimeChange,
  onSecondaryChange,
  yardDefaultHint,
}: Props) {
  const unitOptions = kind === "mowing" ? MOWING_HEIGHT_OPTIONS : WATERING_MINUTE_OPTIONS;
  const unitSuffix = kind === "mowing" ? "in" : "min";
  const unitPlaceholder = kind === "mowing" ? "Height" : "Duration";

  const toggleDay = (day: string) => {
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day];
    // Keep days sorted in canonical Sun→Sat order so storage is stable.
    onDaysChange(SCHEDULE_DAYS.filter((d) => next.includes(d)));
  };

  const showHint = days.length === 0 && yardDefaultHint;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <Label>{label}</Label>
        {showHint && (
          <span className="text-xs text-gray-400">Yard default: {yardDefaultHint}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {SCHEDULE_DAYS.map((day) => {
          const selected = days.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                selected
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-green-300",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Select
          value={time ?? ""}
          onValueChange={(v) => onTimeChange(v === "" ? null : (v ?? null))}
        >
          <SelectTrigger className="flex-1 min-w-0">
            <SelectValue placeholder="Time">
              {time ? SCHEDULE_TIME_OPTIONS.find((o) => o.value === time)?.label : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_TIME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={secondaryValue != null ? String(secondaryValue) : ""}
          onValueChange={(v) => onSecondaryChange(v === "" || v == null ? null : Number(v))}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue placeholder={unitPlaceholder}>
              {secondaryValue != null ? `${secondaryValue} ${unitSuffix}` : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt} {unitSuffix}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
