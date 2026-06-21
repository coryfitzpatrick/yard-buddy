"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import Link from "next/link";
import { yardSectionSchema, YardSectionInput, YardSectionFormInput } from "@/lib/validations/yard";
import { createSectionAction, updateSectionAction } from "@/app/_actions/sections";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { AreaTypeSelector, AREA_NAME_MAP } from "./AreaTypeSelector";
import { GrassIdentifyUpload, type GrassIdentifyUploadHandle } from "./GrassIdentifyUpload";
import type { AreaType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { toSqft, toDisplaySize } from "@/lib/size-utils";
import { ScheduleEditor } from "./ScheduleEditor";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

interface Props {
  yardId: string;
  yardSlug?: string;
  zipCode: string;
  lotSqft?: number;
  buildingSqft?: number;
  streetAddress?: string;
  initialData?: Partial<YardSectionFormInput & { id: string; slug: string }>;
  yardMowingSchedule?: string | null;
  yardWateringSchedule?: string | null;
  plan?: string | null;
  yardWateringDaysPerWeek?: number | null;
  yardWateringMinutesPerSession?: number | null;
  yardMowingDaysPerWeek?: number | null;
  yardMowingHeightInches?: number | null;
  // Hide the area-type picker and section-name input. Useful when the section
  // represents the whole yard (only section in the yard) and these fields
  // would just confuse the user.
  hideSectionIdentity?: boolean;
}



export function SectionForm({ yardId, yardSlug, zipCode, lotSqft, buildingSqft, streetAddress: initialStreetAddress, initialData, yardMowingSchedule, yardWateringSchedule, plan, yardWateringDaysPerWeek, yardWateringMinutesPerSession, yardMowingDaysPerWeek, yardMowingHeightInches, hideSectionIdentity = false }: Props) {
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
        soilPh: initialData?.soilPh as YardSectionFormInput["soilPh"],
        nitrogenPpm: initialData?.nitrogenPpm as YardSectionFormInput["nitrogenPpm"],
        phosphorusPpm: initialData?.phosphorusPpm as YardSectionFormInput["phosphorusPpm"],
        potassiumPpm: initialData?.potassiumPpm as YardSectionFormInput["potassiumPpm"],
        organicMatterPct: initialData?.organicMatterPct as YardSectionFormInput["organicMatterPct"],
        soilTestSource: initialData?.soilTestSource ?? undefined,
        soilTestedAt: initialData?.soilTestedAt as YardSectionFormInput["soilTestedAt"],
        notes: initialData?.notes ?? undefined,
        wateringDaysPerWeek: initialData?.wateringDaysPerWeek as YardSectionFormInput["wateringDaysPerWeek"],
        wateringMinutesPerSession: initialData?.wateringMinutesPerSession as YardSectionFormInput["wateringMinutesPerSession"],
        mowingDaysPerWeek: initialData?.mowingDaysPerWeek as YardSectionFormInput["mowingDaysPerWeek"],
        mowingHeightInches: initialData?.mowingHeightInches as YardSectionFormInput["mowingHeightInches"],
        mowingSchedule: initialData?.mowingSchedule ?? undefined,
        wateringSchedule: initialData?.wateringSchedule ?? undefined,
        yardSizeSqft: (initialData?.yardSizeSqft ?? (lotSqft && !initialData ? (lotSqft - (buildingSqft ?? 0)) || lotSqft : undefined)) as YardSectionFormInput["yardSizeSqft"],
      },
    });

  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;
  const areaType = watch("areaType") as AreaType | undefined;

  // Grass photo identification
  const grassIdentifyRef = useRef<GrassIdentifyUploadHandle | null>(null);

  // Lot size lookup + controlled size input
  const usableSqft = lotSqft && buildingSqft ? lotSqft - buildingSqft : lotSqft ?? null;
  const hasYardLotData = !!lotSqft;
  const [streetAddress, setStreetAddress] = useState(initialStreetAddress ?? "");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [sizeUnit, setSizeUnit] = useState<"sqft" | "acres">("sqft");

  const mowingSchedule = watch("mowingSchedule") as string | undefined;
  const wateringSchedule = watch("wateringSchedule") as string | undefined;

  const [sizeDisplay, setSizeDisplay] = useState(() => {
    if (initialData?.yardSizeSqft) return String(initialData.yardSizeSqft);
    if (usableSqft) return String(usableSqft);
    return "";
  });

  function handleSizeInput(raw: string) {
    setSizeDisplay(raw);
    setValue("yardSizeSqft", toSqft(raw, sizeUnit) as YardSectionFormInput["yardSizeSqft"], { shouldDirty: true, shouldValidate: true });
  }
  function handleUnitChange(next: "sqft" | "acres") {
    const cur = toSqft(sizeDisplay, sizeUnit);
    setSizeUnit(next);
    if (cur) setSizeDisplay(toDisplaySize(cur, next));
  }


  async function lookupYardSize() {
    if (!streetAddress.trim()) return;
    setLookingUp(true);
    setLookupNote(null);
    try {
      const res = await fetch("/api/lookup-yard-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${streetAddress}, ${zipCode}` }),
      });
      const data = await res.json();
      const sqft = data.usableSqft ?? data.lotSqft;
      if (sqft) {
        setSizeDisplay(toDisplaySize(sqft, sizeUnit));
        setValue("yardSizeSqft", sqft as YardSectionFormInput["yardSizeSqft"]);
        if (data.usableSqft && data.buildingSqft) {
          setLookupNote(
            `Lot: ~${data.lotSqft.toLocaleString()} sq ft · Home: ~${data.buildingSqft.toLocaleString()} sq ft · Lawn: ~${data.usableSqft.toLocaleString()} sq ft. Adjust below for just this section.`
          );
        } else {
          setLookupNote(`Lot: ~${data.lotSqft.toLocaleString()} sq ft. Adjust below for just this section.`);
        }
      } else {
        setLookupNote(data.message ?? "Size not found. Enter manually.");
      }
    } catch {
      setLookupNote("Lookup failed. Enter manually.");
    } finally {
      setLookingUp(false);
    }
  }

  async function onSubmit(data: YardSectionInput) {
    setError(null);
    if (isEdit) {
      const result = await updateSectionAction(yardId, initialData!.id!, data);
      if (!result.ok) { setError("Failed to save. Please try again."); return; }
      router.push(`/yard/${yardSlug ?? yardId}/sections/${result.slug}`);
    } else {
      const result = await createSectionAction(yardId, data);
      if (!result.ok) { setError("Failed to save. Please try again."); return; }
      router.push(`/analyze?sectionId=${result.id}`);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">

      {!hideSectionIdentity && (
        <>
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
            {errors.name && <p className="text-sm text-red-500">{errors.name.message || "Section name is required"}</p>}
          </div>
        </>
      )}

      {/* Grass type identification */}
      <div className="space-y-2">
        <Label>Grass Type *</Label>
        <GrassIdentifyUpload
          ref={grassIdentifyRef}
          onIdentified={(r) => setValue("grassType", r.grassType as YardSectionInput["grassType"])}
        />
        <GrassTypeSelector
          value={grassType}
          onChange={(v) => {
            setValue("grassType", v);
            grassIdentifyRef.current?.reset();
          }}
        />
        {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message || "Please select a grass type"}</p>}
      </div>

      <div className="space-y-4">
        {/* Lot size — from yard data or manual lookup */}
        {hasYardLotData ? (
          <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
            {buildingSqft
              ? <>Lot: ~{lotSqft!.toLocaleString()} sq ft · Home: ~{buildingSqft.toLocaleString()} sq ft · Lawn: ~{usableSqft!.toLocaleString()} sq ft</>
              : <>Lot: ~{lotSqft!.toLocaleString()} sq ft</>
            }
            <span className="text-green-600">. Adjust the size below for just this section.</span>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>Street Address (optional, look up lot size)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="123 Main St"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupYardSize(); } }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!streetAddress.trim() || lookingUp}
                onClick={lookupYardSize}
                className="shrink-0"
              >
                {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            {lookupNote && (
              <p className={`text-sm font-medium ${lookupNote.startsWith("Lot:") ? "text-green-700" : "text-gray-500"}`}>
                {lookupNote}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <Label>Section Size</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder={sizeUnit === "sqft" ? "e.g. 2000" : "e.g. 0.046"}
              value={sizeDisplay}
              onChange={(e) => handleSizeInput(e.target.value)}
              min="0"
              step={sizeUnit === "acres" ? "0.001" : "1"}
            />
            <Select value={sizeUnit} onValueChange={(v) => handleUnitChange(v as "sqft" | "acres")}>
              <SelectTrigger className="w-28 shrink-0"><SelectValue>{sizeUnit === "sqft" ? "sq ft" : "acres"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="sqft">sq ft</SelectItem>
                <SelectItem value="acres">acres</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-gray-400">
            {lookupNote?.startsWith("Lot:")
              ? "Adjust to just this section's share of the lawn"
              : "Optional. Helps calculate product amounts."}
          </p>
          {errors.yardSizeSqft && <p className="text-sm text-red-500">{errors.yardSizeSqft.message || "Enter a size between 1 and 500,000 sq ft"}</p>}
        </div>

        <div className="space-y-1">
          <Label>Soil pH</Label>
          <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
          {errors.soilPh && <p className="text-sm text-red-500">{errors.soilPh.message || "Soil pH must be between 4 and 9"}</p>}
        </div>
        <div className="space-y-1">
          <Label>Nitrogen (N), ppm <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
          <Input type="number" step="0.1" min="0" max="1000" placeholder="e.g. 42" {...register("nitrogenPpm")} />
          {errors.nitrogenPpm && <p className="text-sm text-red-500">{errors.nitrogenPpm.message || "Must be between 0 and 1000 ppm"}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phosphorus (P), ppm <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
          <Input type="number" step="0.1" min="0" max="2000" placeholder="e.g. 28" {...register("phosphorusPpm")} />
          {errors.phosphorusPpm && <p className="text-sm text-red-500">{errors.phosphorusPpm.message || "Must be between 0 and 2000 ppm"}</p>}
        </div>
        <div className="space-y-1">
          <Label>Potassium (K), ppm <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
          <Input type="number" step="0.1" min="0" max="2000" placeholder="e.g. 180" {...register("potassiumPpm")} />
          {errors.potassiumPpm && <p className="text-sm text-red-500">{errors.potassiumPpm.message || "Must be between 0 and 2000 ppm"}</p>}
        </div>
        <div className="space-y-1">
          <Label>Organic Matter, % <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
          <Input type="number" step="0.1" min="0" max="100" placeholder="e.g. 3" {...register("organicMatterPct")} />
          {errors.organicMatterPct && <p className="text-sm text-red-500">{errors.organicMatterPct.message || "Must be between 0 and 100"}</p>}
        </div>
        <div className="space-y-1">
          <Label>Soil Test Source <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
          <Input placeholder="e.g. Lowe's test kit, UGA Extension Lab" {...register("soilTestSource")} />
          <p className="text-sm text-gray-400">Where did your soil numbers come from? Helps us give better context.</p>
          {errors.soilTestSource && <p className="text-sm text-red-500">{errors.soilTestSource.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Last tested on <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
          <Input type="date" {...register("soilTestedAt")} />
          <p className="text-sm text-gray-400">When you last ran a soil test. Helps us judge how current the results are.</p>
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
          {errors.notes && <p className="text-sm text-red-500">{errors.notes.message}</p>}
        </div>
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700">Schedule Overrides</h3>
          <p className="text-xs text-gray-400">Override the yard-level defaults for this section only.</p>
          {canSetSectionSchedule(plan ?? null) ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Watering days / week <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  placeholder={yardWateringDaysPerWeek?.toString() ?? ""}
                  {...register("wateringDaysPerWeek")}
                />
                {errors.wateringDaysPerWeek && (
                  <p className="text-sm text-red-500">{errors.wateringDaysPerWeek.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Watering min. / session <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={yardWateringMinutesPerSession?.toString() ?? ""}
                  {...register("wateringMinutesPerSession")}
                />
                {errors.wateringMinutesPerSession && (
                  <p className="text-sm text-red-500">{errors.wateringMinutesPerSession.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Mowing days / week <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  placeholder={yardMowingDaysPerWeek?.toString() ?? ""}
                  {...register("mowingDaysPerWeek")}
                />
                {errors.mowingDaysPerWeek && (
                  <p className="text-sm text-red-500">{errors.mowingDaysPerWeek.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Mowing height (in.) <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  placeholder={yardMowingHeightInches?.toString() ?? ""}
                  {...register("mowingHeightInches")}
                />
                {errors.mowingHeightInches && (
                  <p className="text-sm text-red-500">{errors.mowingHeightInches.message}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Watering and mowing schedules are set at the yard level on your current plan.{" "}
              <Link href={`/yard/${yardSlug ?? yardId}/edit`} className="text-green-600 hover:underline">
                Edit yard schedule
              </Link>
            </p>
          )}
        </div>

        <div id="schedule" className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700">Personalized Reminders</h3>

          <ScheduleEditor
            kind="mow"
            label="Mowing schedule"
            value={mowingSchedule}
            onChange={(v) => setValue("mowingSchedule", v)}
            yardDefault={yardMowingSchedule}
          />

          <ScheduleEditor
            kind="water"
            label="Watering schedule"
            value={wateringSchedule}
            onChange={(v) => setValue("wateringSchedule", v)}
            yardDefault={yardWateringSchedule}
          />

          <p className="text-xs text-gray-400">
            These are your own notes. They won&apos;t affect your lawn analysis.
          </p>
        </div>
      </div>

      {error &&<div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {Object.keys(errors).length > 0 && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          Please fix the errors above before saving.
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(isEdit ? `/yard/${yardSlug ?? yardId}/sections/${initialData!.slug ?? initialData!.id}` : `/yard/${yardSlug ?? yardId}`)}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Section"}
        </Button>
      </div>
    </form>
  );
}
