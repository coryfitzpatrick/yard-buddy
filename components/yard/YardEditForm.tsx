"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { z } from "zod";
import { yardSchema, YardInput } from "@/lib/validations/yard";
import { updateYardAction } from "@/app/_actions/yards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleEditor } from "./ScheduleEditor";
import { WateringWarning, MowingWarning } from "@/components/yard/ScheduleWarnings";

type YardFormInput = z.input<typeof yardSchema>;

interface AnalysisInput {
  wateringSuggestedDaysPerWeek?: number | null;
  wateringSuggestedMinutesPerSession?: number | null;
  mowingSuggestedDaysPerWeek?: number | null;
  mowingSuggestedHeightInches?: number | null;
}

interface Props {
  yardId: string;
  yardSlug: string;
  latestAnalysis?: AnalysisInput | null;
  initialData: {
    name: string;
    zipCode: string;
    spreaderType?: string;
    spreaderModel?: string;
    wateringDays?: string[];
    wateringTime?: string | null;
    wateringMinutesPerSession?: number;
    mowingDays?: string[];
    mowingTime?: string | null;
    mowingHeightInches?: number;
  };
}

export function YardEditForm({ yardId, yardSlug, initialData, latestAnalysis = null }: Props) {
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
        wateringDays: (initialData.wateringDays ?? []) as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[],
        wateringTime: initialData.wateringTime ?? undefined,
        wateringMinutesPerSession: initialData.wateringMinutesPerSession,
        mowingDays: (initialData.mowingDays ?? []) as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[],
        mowingTime: initialData.mowingTime ?? undefined,
        mowingHeightInches: initialData.mowingHeightInches,
      },
    });

  async function onSubmit(data: YardInput) {
    setError(null);
    const result = await updateYardAction(yardId, data);
    if (!result.ok) {
      setError("Failed to save. Please try again.");
      return;
    }
    router.push(`/yard/${result.slug ?? yardSlug}`);
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
          kind="mowing"
          label="Mowing schedule"
          days={watch("mowingDays") ?? []}
          time={(watch("mowingTime") as string | null | undefined) ?? null}
          secondaryValue={(watch("mowingHeightInches") as number | null | undefined) ?? null}
          onDaysChange={(v) => setValue("mowingDays", v as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[])}
          onTimeChange={(v) => setValue("mowingTime", v ?? undefined)}
          onSecondaryChange={(v) => setValue("mowingHeightInches", v ?? undefined)}
        />
        <MowingWarning
          latestAnalysis={latestAnalysis}
          currentDayCount={(watch("mowingDays") ?? []).length}
          currentHeight={(watch("mowingHeightInches") as number | null | undefined) ?? null}
        />

        <div>
          <p className="text-sm font-semibold text-gray-700">Default Watering Schedule</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to all sections unless overridden.</p>
        </div>
        <ScheduleEditor
          kind="watering"
          label="Watering schedule"
          days={watch("wateringDays") ?? []}
          time={(watch("wateringTime") as string | null | undefined) ?? null}
          secondaryValue={(watch("wateringMinutesPerSession") as number | null | undefined) ?? null}
          onDaysChange={(v) => setValue("wateringDays", v as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[])}
          onTimeChange={(v) => setValue("wateringTime", v ?? undefined)}
          onSecondaryChange={(v) => setValue("wateringMinutesPerSession", v ?? undefined)}
        />
        <WateringWarning
          latestAnalysis={latestAnalysis}
          currentDayCount={(watch("wateringDays") ?? []).length}
          currentMinutes={(watch("wateringMinutesPerSession") as number | null | undefined) ?? null}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
