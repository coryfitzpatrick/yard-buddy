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
import { Camera, CheckCircle, CheckCircle2, Images, Loader2, Plus, Search } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";
import { cn } from "@/lib/utils";
import { PhotoUpload, type PhotoUploadHandle } from "@/components/analysis/PhotoUpload";

import { toSqft, toDisplaySize } from "@/lib/size-utils";

const STEP_LABELS: Record<number, string> = {
  0: "Property",
  1: "Area Type",
  2: "Grass Type",
  3: "Soil & Equipment",
  4: "Photos",
  5: "Review",
};
// Internal step indices for each entry path. Whole-yard flow skips Area Type —
// the auto-created section is "Whole Yard" / areaType="other". Per-section flows
// keep Area Type because picking what part of the yard this is is the whole point.
const WHOLE_YARD_FLOW = [0, 2, 3, 4, 5] as const;
const BY_SECTION_FLOW = [0, 1, 2, 3, 4, 5] as const;

const SPREADER_BRANDS: Record<string, string[]> = {
  broadcast: ["Scotts EdgeGuard DLX", "Scotts Turf Builder EdgeGuard", "Andersons Rotary Spreader", "Lesco 80 lb Rotary", "Earthway 2600"],
  drop:      ["Scotts Snap Spreader", "Scotts Classic Drop", "Earthway 2150", "Agri-Fab 45-0462"],
  handheld:  ["Scotts Wizz", "Scotts Elite Hand Spreader", "Chapin 8701B"],
  liquid:    ["Chapin 20000", "Solo 420", "Smith Performance Sprayer", "Ortho Dial N Spray"],
  none:      [],
};

const AREA_NAME_MAP: Record<AreaType, string> = {
  front: "Front Yard", back: "Back Yard",
  left_side: "Left Side Yard", right_side: "Right Side Yard",
  garden: "Garden", other: "My Yard",
};

export function YardSetupForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [yardLimitReached, setYardLimitReached] = useState(false);
  const [createdYardId, setCreatedYardId] = useState<string | null>(null);
  const [createdYardSlug, setCreatedYardSlug] = useState<string | null>(null);
  const [createdPropertyName, setCreatedPropertyName] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [addingAnotherSection, setAddingAnotherSection] = useState(false);
  const [setupPhotoCount, setSetupPhotoCount] = useState(0);
  const [postSaveStatus, setPostSaveStatus] = useState<"idle" | "saving" | "uploading" | "analyzing">("idle");
  const [analyzedSectionSlug, setAnalyzedSectionSlug] = useState<string | null>(null);
  const photoUploadRef = useRef<PhotoUploadHandle | null>(null);

  const [propertyName, setPropertyName] = useState("My Property");
  const [zipCode, setZipCode] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<"whole" | "sections">("whole");

  const { handleSubmit, watch, setValue, register, reset, trigger, formState: { errors, isSubmitting } } =
    useForm<YardSectionFormInput, unknown, YardSectionInput>({
      resolver: zodResolver(yardSectionSchema),
      defaultValues: { name: "Whole Yard", areaType: "other", grassType: "unknown" },
    });

  const [spreaderType, setSpreaderType] = useState<string>("");
  const [spreaderModel, setSpreaderModel] = useState<string>("");
  const [wateringDaysPerWeek, setWateringDaysPerWeek] = useState("");
  const [wateringMinutesPerSession, setWateringMinutesPerSession] = useState("");

  const activeSteps: readonly number[] =
    createdYardId || setupMode === "sections" ? BY_SECTION_FLOW : WHOLE_YARD_FLOW;
  const activeStepIdx = activeSteps.indexOf(step);

  function handleSetupModeChange(mode: "whole" | "sections") {
    setSetupMode(mode);
    if (mode === "whole") {
      setValue("name", "Whole Yard");
      setValue("areaType", "other");
    } else {
      setValue("name", "Front Yard");
      setValue("areaType", "front");
    }
  }

  const areaType = watch("areaType") as AreaType | undefined;
  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;

  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadZoneRef = useRef<HTMLDivElement>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyPhase, setIdentifyPhase] = useState<"uploading" | "analyzing">("uploading");
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<{ confidence: string; explanation: string } | null>(null);
  const [highlightUpload, setHighlightUpload] = useState(false);

  const [sizeUnit, setSizeUnit] = useState<"sqft" | "acres">("sqft");
  const [sizeDisplay, setSizeDisplay] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [lotData, setLotData] = useState<{ lotSqft: number | null; buildingSqft: number | null } | null>(null);

  function handleSizeInput(raw: string) {
    setSizeDisplay(raw);
    setValue("yardSizeSqft", toSqft(raw, sizeUnit) as never);
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
        setValue("yardSizeSqft", sqft as never);
        setSizeDisplay(toDisplaySize(sqft, sizeUnit));
        setLotData({ lotSqft: data.lotSqft ?? null, buildingSqft: data.buildingSqft ?? null });
        if (data.usableSqft && data.buildingSqft) {
          setLookupNote(`Lot: ~${data.lotSqft.toLocaleString()} sq ft · Home: ~${data.buildingSqft.toLocaleString()} sq ft · Lawn: ~${data.usableSqft.toLocaleString()} sq ft`);
        } else {
          setLookupNote(data.source === "parcel" ? "Lot size from parcel data" : "Estimated from map data");
        }
      } else {
        setLotData(null);
        setLookupNote(data.message ?? "Size not found — enter manually");
      }
    } catch {
      setLookupNote("Lookup failed — enter manually");
    } finally {
      setLookingUp(false);
    }
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

  async function onSubmit(sectionData: YardSectionInput) {
    setError(null);
    setYardLimitReached(false);

    let yardId = createdYardId;

    if (!yardId) {
      if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); setStep(0); return; }
      try {
        const yardRes = await fetch("/api/yard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: propertyName,
            zipCode,
            spreaderType: spreaderType || undefined,
            spreaderModel: spreaderModel || undefined,
            streetAddress: streetAddress || undefined,
            lotSqft: lotData?.lotSqft ?? undefined,
            buildingSqft: lotData?.buildingSqft ?? undefined,
            wateringDaysPerWeek: wateringDaysPerWeek ? Number(wateringDaysPerWeek) : undefined,
            wateringMinutesPerSession: wateringMinutesPerSession ? Number(wateringMinutesPerSession) : undefined,
          }),
        });
        if (!yardRes.ok) {
          const data = await yardRes.json().catch(() => ({}));
          if (data.error === "yard_limit_reached") {
            setError(data.message);
            setYardLimitReached(true);
          } else {
            setError("Failed to save yard. Please try again.");
          }
          return;
        }
        const yard = await yardRes.json();
        yardId = yard.id;
        setCreatedYardId(yard.id);
        setCreatedYardSlug(yard.slug);
        setCreatedPropertyName(propertyName);
      } catch {
        setError("Network error. Please check your connection.");
        return;
      }
    } else if (spreaderType || wateringDaysPerWeek || wateringMinutesPerSession) {
      try {
        await fetch(`/api/yard/${yardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createdPropertyName || propertyName,
            zipCode,
            spreaderType: spreaderType || undefined,
            spreaderModel: spreaderModel || undefined,
            wateringDaysPerWeek: wateringDaysPerWeek ? Number(wateringDaysPerWeek) : undefined,
            wateringMinutesPerSession: wateringMinutesPerSession ? Number(wateringMinutesPerSession) : undefined,
          }),
        });
      } catch { /* best-effort yard update */ }
    }

    let createdSection: { id: string; slug: string } | null = null;
    try {
      setPostSaveStatus("saving");
      const sectionRes = await fetch(`/api/yard/${yardId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sectionData),
      });
      if (!sectionRes.ok) {
        setError("Failed to save section. Please try again.");
        setPostSaveStatus("idle");
        return;
      }
      createdSection = await sectionRes.json();
    } catch {
      setError("Network error. Please check your connection.");
      setPostSaveStatus("idle");
      return;
    }

    // If the user added photos in the Photos step, upload + analyze before
    // showing success. This way they land on a populated section, not an empty one.
    if (createdSection && photoUploadRef.current?.hasSelection()) {
      try {
        setPostSaveStatus("uploading");
        const photos = await photoUploadRef.current.upload();
        if (photos.length > 0) {
          setPostSaveStatus("analyzing");
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sectionId: createdSection.id, photos }),
          });
          if (analyzeRes.ok) {
            setAnalyzedSectionSlug(createdSection.slug);
          }
          // Analysis failure isn't blocking — yard + section still exist.
        }
      } catch {
        // Same — surface success anyway; user can re-analyze from /analyze.
      }
    }

    setPostSaveStatus("idle");
    setShowSuccess(true);
  }

  const canAdvance = async () => {
    if (step === 0) {
      if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); return false; }
      setZipError(null);
      return true;
    }
    if (step === 2) return trigger(["grassType"]);
    return true;
  };

  function handleAddAnotherSection() {
    reset({ name: "Front Yard", grassType: "unknown" });
    setSizeDisplay("");
    setSizeUnit("sqft");
    setStreetAddress("");
    setLookupNote(null);
    setIdentified(null);
    setIdentifyError(null);
    setHighlightUpload(false);
    setShowSuccess(false);
    setAddingAnotherSection(true);
    setAnalyzedSectionSlug(null);
    setSetupPhotoCount(0);
    setStep(1);
  }

  return (
    <div className="max-w-2xl">
      {showSuccess ? (
        <div className="text-center space-y-6 py-8">
          <CheckCircle2 className="mx-auto w-16 h-16 text-green-500" />
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {addingAnotherSection ? "Section added!" : "Yard set up!"}
            </h3>
            <p className="text-gray-500 mt-1">
              {analyzedSectionSlug ? (
                <><span className="font-medium">{createdPropertyName}</span> is set up and your photos have been analyzed.</>
              ) : addingAnotherSection ? (
                <><span className="font-medium">{createdPropertyName}</span> has a new section ready to analyze.</>
              ) : (
                <><span className="font-medium">{createdPropertyName}</span> is ready. Upload photos any time to get a custom plan, or split it into sections later.</>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="outline" onClick={handleAddAnotherSection}>
              <Plus className="w-4 h-4 mr-2" /> Add Another Section
            </Button>
            {analyzedSectionSlug && createdYardSlug ? (
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  router.push(`/yard/${createdYardSlug}/sections/${analyzedSectionSlug}`);
                  router.refresh();
                }}
              >
                View analysis
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => { router.push("/dashboard"); router.refresh(); }}
              >
                Go to Dashboard
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-8">
            {activeSteps.map((stepNum, idx) => (
              <div key={stepNum} className={`flex-1 h-2 rounded-full transition-colors ${idx <= activeStepIdx ? "bg-green-500" : "bg-gray-200"}`} />
            ))}
          </div>
          <h2 className="text-xl font-semibold mb-1">{STEP_LABELS[step]}</h2>
          <p className="text-sm text-gray-400 mb-4">All details can be updated later.</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 flex items-start justify-between gap-3">
                <span>{error}</span>
                {yardLimitReached && (
                  <a href="/pricing" className="shrink-0 underline font-semibold hover:text-red-800 whitespace-nowrap">
                    View plans
                  </a>
                )}
              </div>
            )}

            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Yard Name</Label>
                  <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="My Home" />
                </div>
                <div className="space-y-1">
                  <Label>ZIP Code *</Label>
                  <Input placeholder="90210" maxLength={5} value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                  {zipError && <p className="text-sm text-red-500">{zipError}</p>}
                </div>
                <div className="space-y-2 pt-2">
                  <Label>How would you like to set this up?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetupModeChange("whole")}
                      className={cn(
                        "rounded-lg border-2 p-3 text-left transition-all",
                        setupMode === "whole"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 bg-white hover:border-green-400"
                      )}
                    >
                      <div className={cn("font-medium text-sm", setupMode === "whole" ? "text-green-900" : "text-gray-800")}>
                        Whole yard
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Quickest. One plan for the entire lawn.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetupModeChange("sections")}
                      className={cn(
                        "rounded-lg border-2 p-3 text-left transition-all",
                        setupMode === "sections"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 bg-white hover:border-green-400"
                      )}
                    >
                      <div className={cn("font-medium text-sm", setupMode === "sections" ? "text-green-900" : "text-gray-800")}>
                        By section
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Different grass or care for front, back, side, etc.
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">You can split your yard into sections later either way.</p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Which part of your yard are we setting up?</p>
                <AreaTypeSelector
                  value={areaType}
                  onChange={(v) => {
                    setValue("areaType", v);
                    const defaultNames = new Set(Object.values(AREA_NAME_MAP));
                    const cur = watch("name");
                    if (!cur || defaultNames.has(cur)) setValue("name", AREA_NAME_MAP[v]);
                  }}
                />
                <div className="space-y-1">
                  <Label>Section Name</Label>
                  <Input placeholder="Front Yard" value={watch("name") ?? ""} onChange={(e) => setValue("name", e.target.value)} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Select your grass type, or upload a photo for AI identification.</p>
                <div
                  ref={uploadZoneRef}
                  className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors duration-300 ${highlightUpload ? "border-green-500 bg-green-50 animate-pulse" : "border-green-200"}`}
                >
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      setHighlightUpload(false);
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
                      setHighlightUpload(false);
                      if (file) identifyGrass(file);
                    }}
                  />
                  {identifying ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
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
                <GrassTypeSelector
                  value={grassType}
                  onChange={(v) => {
                    setValue("grassType", v);
                    setIdentified(null);
                    if (v === "unknown") {
                      setHighlightUpload(true);
                      uploadZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    } else {
                      setHighlightUpload(false);
                    }
                  }}
                />
                {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message}</p>}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Street Address (optional — used to look up yard size)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="123 Main St" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupYardSize(); } }} />
                    <Button type="button" variant="outline" size="sm" disabled={!streetAddress.trim() || lookingUp} onClick={lookupYardSize} className="shrink-0">
                      {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  {lookupNote && (
                    <p className={`text-sm font-medium ${lookupNote.startsWith("Lot:") ? "text-green-700" : "text-gray-500"}`}>
                      {lookupNote}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Section Size</Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder={sizeUnit === "sqft" ? "5000" : "0.115"} value={sizeDisplay}
                      onChange={(e) => handleSizeInput(e.target.value)} min="0" step={sizeUnit === "acres" ? "0.001" : "1"} />
                    <Select value={sizeUnit} onValueChange={(v) => handleUnitChange(v as "sqft" | "acres")}>
                      <SelectTrigger className="w-28 shrink-0"><SelectValue>{sizeUnit === "sqft" ? "sq ft" : "acres"}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sqft">sq ft</SelectItem>
                        <SelectItem value="acres">acres</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-gray-400">Optional — helps calculate product amounts</p>
                </div>
                <div className="space-y-1">
                  <Label>Soil pH</Label>
                  <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
                  <p className="text-sm text-gray-400">Test with a soil kit from your local hardware store</p>
                </div>
                <div className="space-y-1">
                  <Label>Soil Moisture</Label>
                  <Select onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
                    <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dry">Dry — cracks easily, water beads</SelectItem>
                      <SelectItem value="moderate">Moderate — moist 1 inch down</SelectItem>
                      <SelectItem value="moist">Moist — stays damp, possible overwatering</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-400">Push a screwdriver 6" into soil: slides in = moist, resistance = moderate, very hard = dry.</p>
                </div>
                <div className="space-y-1">
                  <Label>Spreader Type</Label>
                  <Select value={spreaderType || undefined} onValueChange={(v) => setSpreaderType(v ?? "")}>
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
                  <Input placeholder="e.g. Scotts EdgeGuard DLX" value={spreaderModel} onChange={(e) => setSpreaderModel(e.target.value)} />
                  {spreaderType && SPREADER_BRANDS[spreaderType]?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {SPREADER_BRANDS[spreaderType].map((brand) => (
                        <button key={brand} type="button" onClick={() => setSpreaderModel(brand)}
                          className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
                          {brand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Watering days per week <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Input
                    type="number"
                    min="1"
                    max="7"
                    placeholder="3"
                    value={wateringDaysPerWeek}
                    onChange={(e) => setWateringDaysPerWeek(e.target.value)}
                  />
                  <p className="text-sm text-gray-400">How many days per week do you currently water?</p>
                </div>
                <div className="space-y-1">
                  <Label>Minutes per watering session <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    placeholder="20"
                    value={wateringMinutesPerSession}
                    onChange={(e) => setWateringMinutesPerSession(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Additional Notes</Label>
                  <Textarea placeholder="Shady areas, problem spots, recent treatments…" {...register("notes")} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Photos are optional, but adding them now means you&apos;ll land on a populated lawn
                  analysis right after Save. You can always add them later from Analyze.
                </p>
                <PhotoUpload
                  ref={photoUploadRef}
                  hideSubmitButton
                  onSelectionChange={setSetupPhotoCount}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3 text-sm">
                <p className="text-gray-500">Review before saving.</p>
                <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                  {!createdYardId && <div><span className="font-medium">Property:</span> {propertyName} ({zipCode})</div>}
                  {createdYardId && <div><span className="font-medium">Property:</span> {createdPropertyName}</div>}
                  {createdYardId && (
                    <>
                      <div><span className="font-medium">Section:</span> {watch("name")}</div>
                      <div><span className="font-medium">Area:</span> {watch("areaType")?.replace(/_/g, " ") ?? "Not specified"}</div>
                    </>
                  )}
                  <div><span className="font-medium">Grass:</span> {watch("grassType")?.replace(/_/g, " ")}</div>
                  {!!watch("yardSizeSqft") && (
                    <div><span className="font-medium">Size:</span> {String(watch("yardSizeSqft"))} sq ft</div>
                  )}
                  {!!spreaderType && (
                    <div><span className="font-medium">Spreader:</span> {spreaderType}</div>
                  )}
                  <div>
                    <span className="font-medium">Photos:</span>{" "}
                    {setupPhotoCount > 0
                      ? `${setupPhotoCount} ready — we'll analyze them right after saving`
                      : "None — you can add them later"}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8">
              {activeStepIdx > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep(activeSteps[activeStepIdx - 1])}>Back</Button>
              ) : <div />}
              {activeStepIdx < activeSteps.length - 1 ? (
                <Button type="button" onClick={async () => { if (await canAdvance()) setStep(activeSteps[activeStepIdx + 1]); }}
                  className="bg-green-600 hover:bg-green-700">Next</Button>
              ) : (
                <Button type="submit" disabled={isSubmitting || postSaveStatus !== "idle"} className="bg-green-600 hover:bg-green-700">
                  {postSaveStatus === "saving" && "Saving…"}
                  {postSaveStatus === "uploading" && "Uploading photos…"}
                  {postSaveStatus === "analyzing" && "Analyzing your lawn…"}
                  {postSaveStatus === "idle" && (setupPhotoCount > 0 ? "Save & analyze" : "Save")}
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
