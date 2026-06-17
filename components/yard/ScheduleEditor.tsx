"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SCHEDULE_DAYS,
  SCHEDULE_TIME_OPTIONS,
  MOWING_HEIGHT_OPTIONS,
  WATERING_MINUTE_OPTIONS,
  parseSchedule,
  serializeSchedule,
  formatScheduleSummary,
} from "@/lib/schedule";

interface Props {
  kind: "mow" | "water";
  label: string;
  // Current schedule as the JSON blob stored in the DB, or undefined when empty.
  value: string | undefined | null;
  onChange: (next: string | undefined) => void;
  // Optional fallback schedule used when the section has no schedule of its
  // own; rendered as a "Yard default: …" hint next to the label.
  yardDefault?: string | null;
}

export function ScheduleEditor({ kind, label, value, onChange, yardDefault }: Props) {
  const initial = parseSchedule(value);
  const [days, setDays] = useState<string[]>(initial.days);
  const [time, setTime] = useState(initial.time);
  const [inches, setInches] = useState(initial.inches);

  // Reset local state when the upstream value swaps (e.g. on edit form for a
  // different section). Inputs are otherwise self-controlled.
  useEffect(() => {
    const next = parseSchedule(value);
    setDays(next.days);
    setTime(next.time);
    setInches(next.inches);
  }, [value]);

  function push(nextDays: string[], nextTime: string, nextInches: string) {
    setDays(nextDays);
    setTime(nextTime);
    setInches(nextInches);
    onChange(serializeSchedule(nextDays, nextTime, nextInches));
  }

  const unitOptions = kind === "mow" ? MOWING_HEIGHT_OPTIONS : WATERING_MINUTE_OPTIONS;
  const unitSuffix = kind === "mow" ? "in" : "min";
  const unitPlaceholder = kind === "mow" ? "Height" : "Duration";

  const yardDefaultSummary =
    days.length === 0 && yardDefault ? formatScheduleSummary(yardDefault, unitSuffix) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <Label>{label}</Label>
        {yardDefaultSummary && (
          <span className="text-xs text-gray-400">Yard default: {yardDefaultSummary}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {SCHEDULE_DAYS.map((day) => {
          const selected = days.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                const nextDays = selected ? days.filter((d) => d !== day) : [...days, day];
                push(nextDays, time, inches);
              }}
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
        <Select value={time} onValueChange={(v) => push(days, v ?? "", inches)}>
          <SelectTrigger className="flex-1 min-w-0">
            <SelectValue placeholder="Time">
              {SCHEDULE_TIME_OPTIONS.find((o) => o.value === time)?.label}
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
        <Select value={inches} onValueChange={(v) => push(days, time, v ?? "")}>
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue placeholder={unitPlaceholder}>
              {inches ? `${inches} ${unitSuffix}` : undefined}
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
