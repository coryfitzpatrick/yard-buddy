"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { yardSectionSchema, YardSectionInput, YardSectionFormInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { AreaTypeSelector } from "./AreaTypeSelector";
import type { AreaType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  yardId: string;
  zipCode: string;
  initialData?: Partial<YardSectionFormInput & { id: string }>;
}

const AREA_NAME_MAP: Record<AreaType, string> = {
  front: "Front Yard", back: "Back Yard",
  left_side: "Left Side Yard", right_side: "Right Side Yard",
  garden: "Garden", other: "My Yard",
};

export function SectionForm({ yardId, initialData }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initialData?.id;

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<YardSectionFormInput, unknown, YardSectionInput>({
      resolver: zodResolver(yardSectionSchema),
      defaultValues: {
        name: initialData?.name ?? "Front Yard",
        areaType: initialData?.areaType as AreaType | undefined,
        grassType: (initialData?.grassType as YardSectionInput["grassType"]) ?? "unknown",
        soilMoisture: initialData?.soilMoisture as YardSectionInput["soilMoisture"] | undefined,
        notes: initialData?.notes ?? undefined,
      },
    });

  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;
  const areaType = watch("areaType") as AreaType | undefined;

  async function onSubmit(data: YardSectionInput) {
    setError(null);
    try {
      const url = isEdit
        ? `/api/yard/${yardId}/sections/${initialData!.id}`
        : `/api/yard/${yardId}/sections`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { setError("Failed to save. Please try again."); return; }
      router.push("/yard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="space-y-2">
        <Label>Area Type</Label>
        <AreaTypeSelector
          value={areaType}
          onChange={(v) => {
            setValue("areaType", v);
            const defaultNames = new Set(Object.values(AREA_NAME_MAP));
            const curName = watch("name") ?? "";
            if (!curName || defaultNames.has(curName)) setValue("name", AREA_NAME_MAP[v]);
          }}
        />
      </div>

      <div className="space-y-1">
        <Label>Section Name</Label>
        <Input placeholder="Front Yard" {...register("name")} />
      </div>

      <div className="space-y-2">
        <Label>Grass Type *</Label>
        <GrassTypeSelector value={grassType} onChange={(v) => setValue("grassType", v)} />
        {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message}</p>}
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Yard Size (sq ft)</Label>
          <Input type="number" placeholder="5000" {...register("yardSizeSqft")} />
        </div>
        <div className="space-y-1">
          <Label>Soil pH</Label>
          <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
        </div>
        <div className="space-y-1">
          <Label>Soil Moisture</Label>
          <Select defaultValue={initialData?.soilMoisture ?? undefined} onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
            <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dry">Dry</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="moist">Moist</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Additional Notes</Label>
          <Textarea placeholder="Shady areas, problem spots…" {...register("notes")} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push("/yard")}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Section"}
        </Button>
      </div>
    </form>
  );
}
