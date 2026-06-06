"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { yardProfileSchema, YardProfileInput, YardProfileFormInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SPREADER_BRANDS: Record<string, string[]> = {
  broadcast: ["Scotts EdgeGuard DLX", "Scotts Turf Builder EdgeGuard", "Andersons Rotary Spreader", "Lesco 80 lb Rotary", "Earthway 2600"],
  drop: ["Scotts Snap Spreader", "Scotts Classic Drop", "Earthway 2150", "Agri-Fab 45-0462"],
  handheld: ["Scotts Wizz", "Scotts Elite Hand Spreader", "Chapin 8701B"],
  liquid: ["Chapin 20000", "Solo 420", "Smith Performance Sprayer", "Ortho Dial N Spray"],
  none: [],
};

interface YardData {
  id: string;
  name: string;
  zipCode: string;
  yardSizeSqft: number | null;
  grassType: string;
  soilPh: number | null;
  soilMoisture: string | null;
  spreaderType: string | null;
  spreaderModel: string | null;
  notes: string | null;
}

export function YardEditForm({ yard }: { yard: YardData }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<YardProfileFormInput, unknown, YardProfileInput>({
      resolver: zodResolver(yardProfileSchema),
      defaultValues: {
        name: yard.name,
        zipCode: yard.zipCode,
        yardSizeSqft: yard.yardSizeSqft ?? undefined,
        grassType: yard.grassType as YardProfileInput["grassType"],
        soilPh: yard.soilPh ?? undefined,
        soilMoisture: (yard.soilMoisture as YardProfileInput["soilMoisture"]) ?? undefined,
        spreaderType: (yard.spreaderType as YardProfileInput["spreaderType"]) ?? undefined,
        spreaderModel: yard.spreaderModel ?? undefined,
        notes: yard.notes ?? undefined,
      },
    });

  const grassType = watch("grassType") as YardProfileInput["grassType"] | undefined;
  const spreaderType = watch("spreaderType");

  async function onSubmit(data: YardProfileInput) {
    setError(null);
    try {
      const res = await fetch(`/api/yard/${yard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        setError("Failed to save changes. Please try again.");
        return;
      }
      router.push("/yard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Yard Name</Label>
          <Input placeholder="Front Yard, Back Yard…" {...register("name")} />
        </div>
        <div className="space-y-1">
          <Label>ZIP Code *</Label>
          <Input placeholder="90210" maxLength={5} {...register("zipCode")} />
          {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Yard Size (sq ft)</Label>
          <Input type="number" placeholder="2500" {...register("yardSizeSqft")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Grass Type *</Label>
        <GrassTypeSelector
          value={grassType}
          onChange={(v) => setValue("grassType", v)}
        />
        {errors.grassType && <p className="text-xs text-red-500">{errors.grassType.message}</p>}
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Soil pH</Label>
          <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
          <p className="text-xs text-gray-400">Test with a soil kit from your local hardware store</p>
        </div>
        <div className="space-y-1">
          <Label>Soil Moisture</Label>
          <Select
            defaultValue={yard.soilMoisture ?? undefined}
            onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}
          >
            <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dry">Dry — cracks easily, water beads</SelectItem>
              <SelectItem value="moderate">Moderate — moist 1 inch down</SelectItem>
              <SelectItem value="moist">Moist — stays damp, possible overwatering</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">Push a screwdriver 6" into soil: slides in easily = moist, some resistance = moderate, very hard = dry.</p>
        </div>
        <div className="space-y-1">
          <Label>Spreader Type</Label>
          <Select
            defaultValue={yard.spreaderType ?? undefined}
            onValueChange={(v) => setValue("spreaderType", v as YardProfileInput["spreaderType"])}
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
          <Label>Spreader Model (optional)</Label>
          <Input placeholder="e.g. Scotts EdgeGuard DLX" {...register("spreaderModel")} />
          {spreaderType && SPREADER_BRANDS[spreaderType]?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {SPREADER_BRANDS[spreaderType].map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => setValue("spreaderModel", brand)}
                  className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                >
                  {brand}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label>Additional Notes</Label>
          <Textarea placeholder="Shady areas, problem spots, recent treatments…" {...register("notes")} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/yard")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
