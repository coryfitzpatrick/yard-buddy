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

interface Props {
  yardId: string;
  zipCode: string;
  initialData?: Partial<YardSectionFormInput & { id: string }>;
}

interface LotInfo {
  lotSqft: number | null;
  buildingSqft: number | null;
  usableSqft: number | null;
  message?: string;
}

const AREA_NAME_MAP: Record<AreaType, string> = {
  front: "Front Yard", back: "Back Yard",
  left_side: "Left Side Yard", right_side: "Right Side Yard",
  garden: "Garden", other: "My Yard",
};

export function SectionForm({ yardId, zipCode, initialData }: Props) {
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

  // Grass photo identification
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyPhase, setIdentifyPhase] = useState<"uploading" | "analyzing">("uploading");
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<{ confidence: string; explanation: string } | null>(null);

  // Lot size lookup
  const [streetAddress, setStreetAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lotInfo, setLotInfo] = useState<LotInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

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
    setLotInfo(null);
    setLookupError(null);
    try {
      const res = await fetch("/api/lookup-yard-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${streetAddress}, ${zipCode}` }),
      });
      const data = await res.json();
      if (data.lotSqft) {
        setLotInfo({ lotSqft: data.lotSqft, buildingSqft: data.buildingSqft ?? null, usableSqft: data.usableSqft ?? null });
      } else {
        setLookupError(data.message ?? "Size not found — enter manually");
      }
    } catch {
      setLookupError("Lookup failed — enter manually");
    } finally {
      setLookingUp(false);
    }
  }

  function lotGuidanceText(): string {
    if (!lotInfo?.lotSqft) return "";
    const lot = lotInfo.lotSqft.toLocaleString();
    if (lotInfo.usableSqft && lotInfo.buildingSqft) {
      const home = lotInfo.buildingSqft.toLocaleString();
      const lawn = lotInfo.usableSqft.toLocaleString();
      return `Your lot: ~${lot} sq ft · Home: ~${home} sq ft · Lawn: ~${lawn} sq ft — enter this section's portion below`;
    }
    return `Your lot: ~${lot} sq ft — enter this section's portion below`;
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
      router.push(`/yard/${yardId}`);
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
        {/* Lot size lookup */}
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
          {lotInfo && <p className="text-sm text-green-700 font-medium">{lotGuidanceText()}</p>}
          {lookupError && <p className="text-sm text-gray-500">{lookupError}</p>}
        </div>

        <div className="space-y-1">
          <Label>Section Size (sq ft)</Label>
          <Input type="number" placeholder="e.g. 2000" {...register("yardSizeSqft")} />
          <p className="text-sm text-gray-400">Enter just this section's area — helps calculate product amounts</p>
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
        <Button type="button" variant="outline" onClick={() => router.push(`/yard/${yardId}`)}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Section"}
        </Button>
      </div>
    </form>
  );
}
