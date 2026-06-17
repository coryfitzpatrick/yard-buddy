"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FlaskConical, Check } from "lucide-react";

interface Props {
  yardId: string;
  sectionId: string;
  initialSoilPh: number | null;
  initialSoilMoisture: "dry" | "moderate" | "moist" | null;
  initialNotes: string | null;
  onSaved?: () => void;
}

export function SoilQuickEdit({
  yardId,
  sectionId,
  initialSoilPh,
  initialSoilMoisture,
  initialNotes,
  onSaved,
}: Props) {
  const [soilPh, setSoilPh] = useState(initialSoilPh != null ? String(initialSoilPh) : "");
  const [soilMoisture, setSoilMoisture] = useState<"dry" | "moderate" | "moist" | "">(initialSoilMoisture ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state when the parent swaps in a different section.
  useEffect(() => {
    setSoilPh(initialSoilPh != null ? String(initialSoilPh) : "");
    setSoilMoisture(initialSoilMoisture ?? "");
    setNotes(initialNotes ?? "");
    setError(null);
    setSavedFlash(false);
  }, [sectionId, initialSoilPh, initialSoilMoisture, initialNotes]);

  const dirty =
    (soilPh === "" ? null : Number(soilPh)) !== initialSoilPh ||
    (soilMoisture || null) !== initialSoilMoisture ||
    (notes === "" ? null : notes) !== initialNotes;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/yard/${yardId}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soilPh: soilPh === "" ? null : Number(soilPh),
          soilMoisture: soilMoisture || null,
          notes: notes === "" ? null : notes,
        }),
      });
      if (!res.ok) {
        setError("Couldn't save. Try again.");
        return;
      }
      setSavedFlash(true);
      onSaved?.();
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-900">Soil details</h3>
        <span className="text-xs text-gray-400">Optional but improves analysis</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-600">Soil pH</Label>
          <Input
            type="number"
            step="0.1"
            min="4"
            max="9"
            placeholder="6.5"
            value={soilPh}
            onChange={(e) => setSoilPh(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-gray-600">Soil moisture</Label>
          <Select value={soilMoisture || undefined} onValueChange={(v) => setSoilMoisture(v as "dry" | "moderate" | "moist")}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dry">Dry</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="moist">Moist</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-gray-600">Notes</Label>
        <Input
          placeholder="Anything we should know? Recent treatments, shady spots, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          size="sm"
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500"
        >
          {saving ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving</> : "Save soil details"}
        </Button>
        {savedFlash && (
          <span className="text-xs text-green-700 inline-flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
