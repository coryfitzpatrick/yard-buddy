"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { z } from "zod";
import { yardSchema, YardInput } from "@/lib/validations/yard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleEditor } from "./ScheduleEditor";

type YardFormInput = z.input<typeof yardSchema>;

interface Props {
  yardId: string;
  yardSlug: string;
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

export function YardEditForm({ yardId, yardSlug, initialData }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
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

  const mowingSchedule = watch("mowingSchedule");
  const wateringSchedule = watch("wateringSchedule");

  async function onSubmit(data: YardInput) {
    setError(null);
    try {
      const res = await fetch(`/api/yard/${yardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { setError("Failed to save. Please try again."); return; }
      const saved = await res.json();
      router.push(`/yard/${saved.slug ?? yardSlug}`);
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

      <div id="schedule" className="space-y-4 pt-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-700">Default Mowing Schedule</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to all sections unless overridden.</p>
        </div>
        <ScheduleEditor
          kind="mow"
          label="Mowing schedule"
          value={mowingSchedule}
          onChange={(v) => setValue("mowingSchedule", v)}
        />

        <div>
          <p className="text-sm font-semibold text-gray-700">Default Watering Schedule</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to all sections unless overridden.</p>
        </div>
        <ScheduleEditor
          kind="water"
          label="Watering schedule"
          value={wateringSchedule}
          onChange={(v) => setValue("wateringSchedule", v)}
        />
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
