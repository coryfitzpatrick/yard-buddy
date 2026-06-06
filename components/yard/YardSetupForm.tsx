"use client";

import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { yardProfileSchema, YardProfileInput, YardProfileFormInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, CheckCircle } from "lucide-react";

const STEPS = ["Location & Size", "Grass Type", "Soil & Equipment", "Review"];

const SPREADER_BRANDS: Record<string, string[]> = {
  broadcast: ["Scotts EdgeGuard DLX", "Scotts Turf Builder EdgeGuard", "Andersons Rotary Spreader", "Lesco 80 lb Rotary", "Earthway 2600"],
  drop: ["Scotts Snap Spreader", "Scotts Classic Drop", "Earthway 2150", "Agri-Fab 45-0462"],
  handheld: ["Scotts Wizz", "Scotts Elite Hand Spreader", "Chapin 8701B"],
  liquid: ["Chapin 20000", "Solo 420", "Smith Performance Sprayer", "Ortho Dial N Spray"],
  none: [],
};

export function YardSetupForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors, isSubmitting } } =
    useForm<YardProfileFormInput, unknown, YardProfileInput>({
      resolver: zodResolver(yardProfileSchema),
      defaultValues: { name: "My Yard", grassType: "unknown" },
    });

  const grassType = watch("grassType") as YardProfileInput["grassType"] | undefined;
  const spreaderType = watch("spreaderType");
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState<{ confidence: string; explanation: string } | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  async function identifyGrass(file: File) {
    setIdentifying(true);
    setIdentified(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!uploadRes.ok) return;
      const { url } = await uploadRes.json();

      const identifyRes = await fetch("/api/identify-grass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      if (!identifyRes.ok) return;
      const result = await identifyRes.json();
      setValue("grassType", result.grassType);
      setIdentified({ confidence: result.confidence, explanation: result.explanation });
    } finally {
      setIdentifying(false);
    }
  }

  async function onSubmit(data: YardProfileInput) {
    setError(null);
    try {
      const res = await fetch("/api/yard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        setError("Failed to save yard profile. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded-full transition-colors ${
              i <= step ? "bg-green-500" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <h2 className="text-xl font-semibold mb-1">{STEPS[step]}</h2>
      <p className="text-xs text-gray-400 mb-4">All details can be updated later.</p>

      <form onSubmit={handleSubmit(onSubmit)}>
        {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Yard Name</Label>
              <Input placeholder="Front Yard, Back Yard..." {...register("name")} />
            </div>
            <div className="space-y-1">
              <Label>ZIP Code *</Label>
              <Input placeholder="90210" maxLength={5} {...register("zipCode")} />
              {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Yard Size (sq ft)</Label>
              <Input type="number" placeholder="2500" {...register("yardSizeSqft")} />
              <p className="text-xs text-gray-400">Optional — helps calculate product amounts</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Select your grass type, or upload a photo and let AI identify it for you.
            </p>

            <div className="rounded-lg border-2 border-dashed border-green-200 p-4 text-center">
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) identifyGrass(file);
                }}
              />
              {identifying ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                  Analyzing your grass...
                </div>
              ) : identified ? (
                <div className="text-left space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    Identified — {identified.confidence} confidence
                  </div>
                  <p className="text-xs text-gray-500">{identified.explanation}</p>
                  <button
                    type="button"
                    onClick={() => photoRef.current?.click()}
                    className="text-xs text-green-600 underline mt-1"
                  >
                    Try a different photo
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="flex items-center gap-2 mx-auto text-sm text-green-600 font-medium hover:text-green-700"
                >
                  <Camera className="w-4 h-4" />
                  Upload a photo to identify my grass
                </button>
              )}
            </div>

            <GrassTypeSelector
              value={grassType}
              onChange={(v) => { setValue("grassType", v); setIdentified(null); }}
            />
            {errors.grassType && <p className="text-xs text-red-500">{errors.grassType.message}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Soil pH</Label>
              <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
              <p className="text-xs text-gray-400">Optional — test with a soil kit from your local hardware store</p>
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
              <p className="text-xs text-gray-400">Push a screwdriver 6" into the soil: slides in easily = moist, some resistance = moderate, very hard = dry.</p>
            </div>
            <div className="space-y-1">
              <Label>Spreader Type</Label>
              <Select onValueChange={(v) => setValue("spreaderType", v as YardProfileInput["spreaderType"])}>
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
              <Textarea placeholder="Shady areas, problem spots, recent treatments..." {...register("notes")} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">Review your yard profile before saving.</p>
            <div className="rounded-lg bg-gray-50 p-4 space-y-2">
              <div><span className="font-medium">Name:</span> {watch("name")}</div>
              <div><span className="font-medium">ZIP Code:</span> {watch("zipCode")}</div>
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
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : <div />}

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={async () => {
              const fields: Record<number, Path<YardProfileFormInput>[]> = {
                0: ["zipCode", "name"],
                1: ["grassType"],
              };
              const toValidate = fields[step];
              if (toValidate) {
                const valid = await trigger(toValidate);
                if (!valid) return;
              }
              setStep((s) => s + 1);
            }} className="bg-green-600 hover:bg-green-700">
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
              {isSubmitting ? "Saving..." : "Save Yard Profile"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
