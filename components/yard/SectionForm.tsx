"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { yardSectionSchema, YardSectionInput, YardSectionFormInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { AreaTypeSelector } from "./AreaTypeSelector";
import type { AreaType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CheckCircle, Images, Loader2, Search } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";
import { toSqft, toDisplaySize, SQFT_PER_ACRE } from "@/lib/size-utils";

interface Props {
  yardId: string;
  zipCode: string;
  lotSqft?: number;
  buildingSqft?: number;
  initialData?: Partial<YardSectionFormInput & { id: string }>;
}


const AREA_NAME_MAP: Record<AreaType, string> = {
  front: "Front Yard", back: "Back Yard",
  left_side: "Left Side Yard", right_side: "Right Side Yard",
  garden: "Garden", other: "My Yard",
};

export function SectionForm({ yardId, zipCode, lotSqft, buildingSqft, initialData }: Props) {
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
        yardSizeSqft: (initialData?.yardSizeSqft ?? (lotSqft && !initialData ? (lotSqft - (buildingSqft ?? 0)) || lotSqft : undefined)) as never,
      },
    });

  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;
  const areaType = watch("areaType") as AreaType | undefined;

  // Grass photo identification
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyPhase, setIdentifyPhase] = useState<"uploading" | "analyzing">("uploading");
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<{ confidence: string; explanation: string } | null>(null);

  // Lot size lookup + controlled size input
  const usableSqft = lotSqft && buildingSqft ? lotSqft - buildingSqft : lotSqft ?? null;
  const hasYardLotData = !!lotSqft;
  const [streetAddress, setStreetAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [sizeUnit, setSizeUnit] = useState<"sqft" | "acres">("sqft");
  const [sizeDisplay, setSizeDisplay] = useState(() => {
    if (initialData?.yardSizeSqft) return String(initialData.yardSizeSqft);
    if (usableSqft) return String(usableSqft);
    return "";
  });

  function handleSizeInput(raw: string) {
    setSizeDisplay(raw);
    setValue("yardSizeSqft", toSqft(raw, sizeUnit) as never, { shouldDirty: true, shouldValidate: true });
  }
  function handleUnitChange(next: "sqft" | "acres") {
    const cur = toSqft(sizeDisplay, sizeUnit);
    setSizeUnit(next);
    if (cur) setSizeDisplay(toDisplaySize(cur, next));
  }

  async function identifyGrass(file: File) {
    setIdentifying(true);
    setIdentified(null);
    setIdentifyError(null);
    setIdentifyPhase("uploading");
    try {
      const signRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!signRes.ok) {
        const b = await signRes.json().catch(() => ({}));
        setIdentifyError(`Upload failed (${signRes.status}): ${b.error ?? "unknown"}`);
        return;
      }
      const { token, path, publicUrl } = await signRes.json();
      const { error: uploadError } = await supabaseClient.storage
        .from("lawn-photos")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) { setIdentifyError(`Upload failed: ${uploadError.message}`); return; }

      setIdentifyPhase("analyzing");
      const identifyRes = await fetch("/api/identify-grass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });
      if (!identifyRes.ok) { setIdentifyError("Analysis failed — try again."); return; }
      const result = await identifyRes.json();
      setValue("grassType", result.grassType);
      setIdentified({ confidence: result.confidence, explanation: result.explanation });
    } catch {
      setIdentifyError("Something went wrong — try again.");
    } finally {
      setIdentifying(false);
    }
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
        setValue("yardSizeSqft", sqft as never);
        if (data.usableSqft && data.buildingSqft) {
          setLookupNote(
            `Lot: ~${data.lotSqft.toLocaleString()} sq ft · Home: ~${data.buildingSqft.toLocaleString()} sq ft · Lawn: ~${data.usableSqft.toLocaleString()} sq ft — adjust below for just this section`
          );
        } else {
          setLookupNote(`Lot: ~${data.lotSqft.toLocaleString()} sq ft — adjust below for just this section`);
        }
      } else {
        setLookupNote(data.message ?? "Size not found — enter manually");
      }
    } catch {
      setLookupNote("Lookup failed — enter manually");
    } finally {
      setLookingUp(false);
    }
  }

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
      const saved = await res.json();
      router.push(`/analyze?sectionId=${isEdit ? initialData!.id : saved.id}`);
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

      {/* Grass type identification */}
      <div className="space-y-2">
        <Label>Grass Type *</Label>
        <div className="rounded-lg border-2 border-dashed border-green-200 p-4 text-center">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) identifyGrass(file);
            }}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) identifyGrass(file);
            }}
          />
          {identifying ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-1">
              <Loader2 className="w-4 h-4 animate-spin text-green-500" />
              {identifyPhase === "uploading" ? "Uploading photo…" : "Analyzing your grass…"}
            </div>
          ) : identified ? (
            <div className="text-left space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                <CheckCircle className="w-4 h-4" /> Identified — {identified.confidence} confidence
              </div>
              <p className="text-sm text-gray-500">{identified.explanation}</p>
              <button type="button" onClick={() => photoRef.current?.click()} className="text-sm text-green-600 underline">Try a different photo</button>
            </div>
          ) : identifyError ? (
            <div className="space-y-2">
              <p className="text-sm text-red-500">{identifyError}</p>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700">
                  <Camera className="w-4 h-4" /> Take Photo
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700">
                  <Images className="w-4 h-4" /> Choose Photo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700">
                <Camera className="w-4 h-4" /> Take Photo
              </button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700">
                <Images className="w-4 h-4" /> Choose Photo
              </button>
            </div>
          )}
        </div>
        <GrassTypeSelector value={grassType} onChange={(v) => { setValue("grassType", v); setIdentified(null); }} />
        {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message}</p>}
      </div>

      <div className="space-y-4">
        {/* Lot size — from yard data or manual lookup */}
        {hasYardLotData ? (
          <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
            {buildingSqft
              ? <>Lot: ~{lotSqft!.toLocaleString()} sq ft · Home: ~{buildingSqft.toLocaleString()} sq ft · Lawn: ~{usableSqft!.toLocaleString()} sq ft</>
              : <>Lot: ~{lotSqft!.toLocaleString()} sq ft</>
            }
            <span className="text-green-600"> — adjust the size below for just this section</span>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>Street Address (optional — look up lot size)</Label>
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
              <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sqft">sq ft</SelectItem>
                <SelectItem value="acres">acres</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-gray-400">
            {lookupNote?.startsWith("Lot:")
              ? "Adjust to just this section's share of the lawn"
              : "Optional — helps calculate product amounts"}
          </p>
          {errors.yardSizeSqft && <p className="text-sm text-red-500">{errors.yardSizeSqft.message}</p>}
        </div>

        <div className="space-y-1">
          <Label>Soil pH</Label>
          <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
          {errors.soilPh && <p className="text-sm text-red-500">{errors.soilPh.message}</p>}
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
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(isEdit ? `/yard/${yardId}/sections/${initialData!.id}` : `/yard/${yardId}`)}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Section"}
        </Button>
      </div>
    </form>
  );
}
