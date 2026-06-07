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
import { Camera, CheckCircle, CheckCircle2, Loader2, Plus, Search } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";

const STEPS = ["Property", "Area Type", "Grass Type", "Soil & Equipment", "Review"];
const SQFT_PER_ACRE = 43560;

function toDisplaySize(sqft: number | undefined | null, unit: "sqft" | "acres"): string {
  if (!sqft) return "";
  return unit === "acres" ? (sqft / SQFT_PER_ACRE).toFixed(3) : String(sqft);
}
function toSqft(display: string, unit: "sqft" | "acres"): number | undefined {
  const n = parseFloat(display);
  if (isNaN(n) || n <= 0) return undefined;
  return unit === "acres" ? Math.round(n * SQFT_PER_ACRE) : Math.round(n);
}

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
  const [createdYardId, setCreatedYardId] = useState<string | null>(null);
  const [createdPropertyName, setCreatedPropertyName] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState(false);

  const [propertyName, setPropertyName] = useState("My Property");
  const [zipCode, setZipCode] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);

  const { handleSubmit, watch, setValue, register, reset, trigger, formState: { errors, isSubmitting } } =
    useForm<YardSectionFormInput, unknown, YardSectionInput>({
      resolver: zodResolver(yardSectionSchema),
      defaultValues: { name: "Front Yard", grassType: "unknown" },
    });

  const areaType = watch("areaType") as AreaType | undefined;
  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;
  const spreaderType = watch("spreaderType");

  const photoRef = useRef<HTMLInputElement>(null);
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
      if (data.sqft) {
        setValue("yardSizeSqft", data.sqft as never);
        setSizeDisplay(toDisplaySize(data.sqft, sizeUnit));
        setLookupNote(data.note ?? (data.source === "parcel" ? "Lot size from parcel data" : "Estimated from map data"));
      } else {
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

    let yardId = createdYardId;

    if (!yardId) {
      if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); setStep(0); return; }
      try {
        const yardRes = await fetch("/api/yard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: propertyName, zipCode }),
        });
        if (!yardRes.ok) { setError("Failed to save property. Please try again."); return; }
        const yard = await yardRes.json();
        yardId = yard.id;
        setCreatedYardId(yard.id);
        setCreatedPropertyName(propertyName);
      } catch {
        setError("Network error. Please check your connection.");
        return;
      }
    }

    try {
      const sectionRes = await fetch(`/api/yard/${yardId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sectionData),
      });
      if (!sectionRes.ok) { setError("Failed to save section. Please try again."); return; }
      setShowSuccess(true);
    } catch {
      setError("Network error. Please check your connection.");
    }
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
    setStep(1);
  }

  return (
    <div className="max-w-2xl mx-auto">
      {showSuccess ? (
        <div className="text-center space-y-6 py-8">
          <CheckCircle2 className="mx-auto w-16 h-16 text-green-500" />
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Section added!</h3>
            <p className="text-gray-500 mt-1">
              <span className="font-medium">{createdPropertyName}</span> is set up with your new section.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="outline" onClick={handleAddAnotherSection}>
              <Plus className="w-4 h-4 mr-2" /> Add Another Section
            </Button>
            <Button
              type="button"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => { router.push("/dashboard"); router.refresh(); }}
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-8">
            {STEPS.map((s, i) => (
              <div key={s} className={`flex-1 h-2 rounded-full transition-colors ${i <= step ? "bg-green-500" : "bg-gray-200"}`} />
            ))}
          </div>
          <h2 className="text-xl font-semibold mb-1">{STEPS[step]}</h2>
          <p className="text-sm text-gray-400 mb-4">All details can be updated later.</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Property Name</Label>
                  <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="My Home" />
                </div>
                <div className="space-y-1">
                  <Label>ZIP Code *</Label>
                  <Input placeholder="90210" maxLength={5} value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                  {zipError && <p className="text-sm text-red-500">{zipError}</p>}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Which part of your property are we setting up?</p>
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
                    <div className="text-left space-y-2">
                      <p className="text-sm text-red-500">{identifyError}</p>
                      <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-2 text-sm text-green-600 font-medium hover:text-green-700">
                        <Camera className="w-4 h-4" /> Try again
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-2 mx-auto text-sm text-green-600 font-medium hover:text-green-700">
                      <Camera className="w-4 h-4" /> Upload a photo to identify my grass
                    </button>
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
                  {lookupNote && <p className="text-sm text-gray-500">{lookupNote}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Section Size</Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder={sizeUnit === "sqft" ? "5000" : "0.115"} value={sizeDisplay}
                      onChange={(e) => handleSizeInput(e.target.value)} min="0" step={sizeUnit === "acres" ? "0.001" : "1"} />
                    <Select value={sizeUnit} onValueChange={(v) => handleUnitChange(v as "sqft" | "acres")}>
                      <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
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
                  <Select onValueChange={(v) => setValue("spreaderType", v as YardSectionInput["spreaderType"])}>
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
                        <button key={brand} type="button" onClick={() => setValue("spreaderModel", brand)}
                          className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
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
            )}

            {step === 4 && (
              <div className="space-y-3 text-sm">
                <p className="text-gray-500">Review before saving.</p>
                <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                  {!createdYardId && <div><span className="font-medium">Property:</span> {propertyName} ({zipCode})</div>}
                  {createdYardId && <div><span className="font-medium">Property:</span> {createdPropertyName}</div>}
                  <div><span className="font-medium">Section:</span> {watch("name")}</div>
                  <div><span className="font-medium">Area:</span> {watch("areaType")?.replace(/_/g, " ") ?? "Not specified"}</div>
                  <div><span className="font-medium">Grass:</span> {watch("grassType")?.replace(/_/g, " ")}</div>
                  {!!watch("yardSizeSqft") && (
                    <div><span className="font-medium">Size:</span> {String(watch("yardSizeSqft"))} sq ft</div>
                  )}
                  {!!watch("spreaderType") && (
                    <div><span className="font-medium">Spreader:</span> {String(watch("spreaderType"))}</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>
              ) : <div />}
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={async () => { if (await canAdvance()) setStep((s) => s + 1); }}
                  className="bg-green-600 hover:bg-green-700">Next</Button>
              ) : (
                <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                  {isSubmitting ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
