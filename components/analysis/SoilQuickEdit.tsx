"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FlaskConical, Check, ChevronDown, ChevronUp } from "lucide-react";

export interface SoilInitialValues {
  soilPh: number | null;
  soilMoisture: "dry" | "moderate" | "moist" | null;
  notes: string | null;
  nitrogenPpm: number | null;
  phosphorusPpm: number | null;
  potassiumPpm: number | null;
  organicMatterPct: number | null;
  soilTestSource: string | null;
  soilTestedAt: string | null; // ISO date string
}

interface Props extends SoilInitialValues {
  yardId: string;
  sectionId: string;
  onSaved?: () => void;
}

function numToStr(n: number | null): string {
  return n != null ? String(n) : "";
}
function strToNumOrNull(s: string): number | null {
  return s === "" ? null : Number(s);
}
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function SoilQuickEdit({
  yardId,
  sectionId,
  soilPh,
  soilMoisture,
  notes,
  nitrogenPpm,
  phosphorusPpm,
  potassiumPpm,
  organicMatterPct,
  soilTestSource,
  soilTestedAt,
  onSaved,
}: Props) {
  const [ph, setPh] = useState(numToStr(soilPh));
  const [moisture, setMoisture] = useState<"dry" | "moderate" | "moist" | "">(soilMoisture ?? "");
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [n, setN] = useState(numToStr(nitrogenPpm));
  const [p, setP] = useState(numToStr(phosphorusPpm));
  const [k, setK] = useState(numToStr(potassiumPpm));
  const [om, setOm] = useState(numToStr(organicMatterPct));
  const [source, setSource] = useState(soilTestSource ?? "");
  const [testedAt, setTestedAt] = useState(isoToDateInput(soilTestedAt));

  const hasTestData = nitrogenPpm != null || phosphorusPpm != null || potassiumPpm != null
    || organicMatterPct != null || soilTestSource != null || soilTestedAt != null;
  const [showTestResults, setShowTestResults] = useState(hasTestData);

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state when the parent swaps in a different section or
  // refreshes after a save.
  useEffect(() => {
    setPh(numToStr(soilPh));
    setMoisture(soilMoisture ?? "");
    setNotesValue(notes ?? "");
    setN(numToStr(nitrogenPpm));
    setP(numToStr(phosphorusPpm));
    setK(numToStr(potassiumPpm));
    setOm(numToStr(organicMatterPct));
    setSource(soilTestSource ?? "");
    setTestedAt(isoToDateInput(soilTestedAt));
    setError(null);
    setSavedFlash(false);
  }, [sectionId, soilPh, soilMoisture, notes, nitrogenPpm, phosphorusPpm, potassiumPpm, organicMatterPct, soilTestSource, soilTestedAt]);

  const current = {
    ph: strToNumOrNull(ph),
    moisture: moisture || null,
    notesValue: notesValue || null,
    n: strToNumOrNull(n),
    p: strToNumOrNull(p),
    k: strToNumOrNull(k),
    om: strToNumOrNull(om),
    source: source || null,
    testedAt: testedAt || null,
  };
  const dirty =
    current.ph !== soilPh ||
    current.moisture !== soilMoisture ||
    current.notesValue !== notes ||
    current.n !== nitrogenPpm ||
    current.p !== phosphorusPpm ||
    current.k !== potassiumPpm ||
    current.om !== organicMatterPct ||
    current.source !== soilTestSource ||
    current.testedAt !== isoToDateInput(soilTestedAt);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/yard/${yardId}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soilPh: current.ph,
          soilMoisture: current.moisture,
          notes: current.notesValue,
          nitrogenPpm: current.n,
          phosphorusPpm: current.p,
          potassiumPpm: current.k,
          organicMatterPct: current.om,
          soilTestSource: current.source,
          soilTestedAt: current.testedAt, // ISO yyyy-mm-dd parses cleanly
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
            value={ph}
            onChange={(e) => setPh(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-gray-600">Soil moisture</Label>
          <Select value={moisture || undefined} onValueChange={(v) => setMoisture(v as "dry" | "moderate" | "moist")}>
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
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
        />
      </div>

      {/* Soil test results — collapsible since most users won't have these */}
      <button
        type="button"
        onClick={() => setShowTestResults((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 mt-2"
      >
        {showTestResults ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Soil test results
      </button>

      {showTestResults && (
        <div className="pt-1 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Nitrogen (ppm)</Label>
              <Input type="number" min="0" max="1000" placeholder="20" value={n} onChange={(e) => setN(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Phosphorus (ppm)</Label>
              <Input type="number" min="0" max="2000" placeholder="30" value={p} onChange={(e) => setP(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Potassium (ppm)</Label>
              <Input type="number" min="0" max="2000" placeholder="100" value={k} onChange={(e) => setK(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Organic matter (%)</Label>
              <Input type="number" min="0" max="100" step="0.1" placeholder="3" value={om} onChange={(e) => setOm(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Test source</Label>
              <Input
                placeholder="e.g. local extension lab, MySoil kit"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Tested on</Label>
              <Input type="date" value={testedAt} onChange={(e) => setTestedAt(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
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
