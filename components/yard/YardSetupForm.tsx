"use client";

import { useForm, type Path } from "react-hook-form";
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

const STEPS = ["Location & Size", "Grass Type", "Soil & Equipment", "Review"];

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
      <h2 className="text-xl font-semibold mb-4">{STEPS[step]}</h2>

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
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-3">
              Select the grass type growing in your yard. This determines what products and timing work best.
            </p>
            <GrassTypeSelector
              value={grassType}
              onChange={(v) => setValue("grassType", v)}
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
