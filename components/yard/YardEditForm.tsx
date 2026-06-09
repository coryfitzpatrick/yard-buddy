"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { yardSchema, YardInput } from "@/lib/validations/yard";
import type { z } from "zod";

type YardFormInput = z.input<typeof yardSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 300 + i * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h;
  return {
    label: `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`,
    value: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
  };
});

const MOWING_HEIGHTS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6"];
const WATERING_MINUTES = ["5", "10", "15", "20", "25", "30", "40", "45", "60", "90"];

function parseSchedule(raw: string | undefined | null) {
  if (!raw) return { days: [] as string[], time: "", inches: "" };
  try {
    const p = JSON.parse(raw);
    if (p && Array.isArray(p.days)) return p as { days: string[]; time: string; inches: string };
  } catch {}
  return { days: [] as string[], time: "", inches: "" };
}

function serializeSchedule(days: string[], time: string, inches: string): string | undefined {
  if (!days.length && !time && !inches) return undefined;
  return JSON.stringify({ days, time, inches });
}

interface Props {
  yardId: string;
  initialData: {
    name: string;
    zipCode: string;
    spreaderType?: string;
    spreaderModel?: string;
    wateringDaysPerWeek?: number;
    wateringMinutesPerSession?: number;
    mowingSchedule?: string;
    wateringSchedule?: string;
  };
}

export function YardEditForm({ yardId, initialData }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } =
    useForm<YardFormInput, unknown, YardInput>({
      resolver: zodResolver(yardSchema),
      defaultValues: {
        name: initialData.name,
        zipCode: initialData.zipCode,
        spreaderType: initialData.spreaderType as YardInput["spreaderType"],
        spreaderModel: initialData.spreaderModel,
        wateringDaysPerWeek: initialData.wateringDaysPerWeek,
        wateringMinutesPerSession: initialData.wateringMinutesPerSession,
        mowingSchedule: initialData.mowingSchedule,
        wateringSchedule: initialData.wateringSchedule,
      },
    });

  const initMowing = parseSchedule(initialData.mowingSchedule);
  const initWatering = parseSchedule(initialData.wateringSchedule);
  const [mowingDays, setMowingDays] = useState<string[]>(initMowing.days);
  const [mowingTime, setMowingTime] = useState(initMowing.time);
  const [mowingInches, setMowingInches] = useState(initMowing.inches);
  const [wateringDays, setWateringDays] = useState<string[]>(initWatering.days);
  const [wateringTime, setWateringTime] = useState(initWatering.time);
  const [wateringInches, setWateringInches] = useState(initWatering.inches);

  function updateMowing(days: string[], time: string, inches: string) {
    setMowingDays(days); setMowingTime(time); setMowingInches(inches);
    setValue("mowingSchedule", serializeSchedule(days, time, inches));
  }
  function updateWatering(days: string[], time: string, inches: string) {
    setWateringDays(days); setWateringTime(time); setWateringInches(inches);
    setValue("wateringSchedule", serializeSchedule(days, time, inches));
  }

  async function onSubmit(data: YardInput) {
    setError(null);
    try {
      const res = await fetch(`/api/yard/${yardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { setError("Failed to save. Please try again."); return; }
      router.push(`/yard/${yardId}`);
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-5">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="space-y-1">
        <Label>Yard Name</Label>
        <Input placeholder="My Home" {...register("name")} />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>ZIP Code</Label>
        <Input placeholder="90210" maxLength={5} {...register("zipCode")} />
        {errors.zipCode && <p className="text-sm text-red-500">{errors.zipCode.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>Spreader Type</Label>
        <Select
          defaultValue={initialData.spreaderType}
          onValueChange={(v) => setValue("spreaderType", v as YardInput["spreaderType"])}
        >
          <SelectTrigger><SelectValue placeholder="Select spreader" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="broadcast">Broadcast / Rotary</SelectItem>
            <SelectItem value="drop">Drop Spreader</SelectItem>
            <SelectItem value="handheld">Handheld Spreader</SelectItem>
            <SelectItem value="liquid">Liquid / Hose-end Sprayer</SelectItem>
            <SelectItem value="none">None / Hand Apply</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Spreader Model <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input placeholder="e.g. Scotts EdgeGuard DLX" {...register("spreaderModel")} />
      </div>

      {/* Default schedules */}
      <div id="schedule" className="space-y-4 pt-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-700">Default Mowing Schedule</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to all sections unless overridden.</p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  const next = mowingDays.includes(day)
                    ? mowingDays.filter((d) => d !== day)
                    : [...mowingDays, day];
                  updateMowing(next, mowingTime, mowingInches);
                }}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                  mowingDays.includes(day)
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-green-300"
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Select value={mowingTime} onValueChange={(v) => updateMowing(mowingDays, v ?? "", mowingInches)}>
              <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Time">{TIME_OPTIONS.find((o) => o.value === mowingTime)?.label}</SelectValue></SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mowingInches} onValueChange={(v) => updateMowing(mowingDays, mowingTime, v ?? "")}>
              <SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="Height">{mowingInches ? `${mowingInches} in` : undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                {MOWING_HEIGHTS.map((h) => (
                  <SelectItem key={h} value={h}>{h} in</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-700">Default Watering Schedule</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to all sections unless overridden.</p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  const next = wateringDays.includes(day)
                    ? wateringDays.filter((d) => d !== day)
                    : [...wateringDays, day];
                  updateWatering(next, wateringTime, wateringInches);
                }}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                  wateringDays.includes(day)
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-green-300"
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Select value={wateringTime} onValueChange={(v) => updateWatering(wateringDays, v ?? "", wateringInches)}>
              <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Time">{TIME_OPTIONS.find((o) => o.value === wateringTime)?.label}</SelectValue></SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={wateringInches} onValueChange={(v) => updateWatering(wateringDays, wateringTime, v ?? "")}>
              <SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="Duration">{wateringInches ? `${wateringInches} min` : undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                {WATERING_MINUTES.map((a) => (
                  <SelectItem key={a} value={a}>{a} min</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
