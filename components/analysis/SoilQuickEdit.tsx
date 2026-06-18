"use client";

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, ChevronDown, ChevronUp } from "lucide-react";

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

export interface UseSoilQuickEditArgs extends SoilInitialValues {
  yardId: string;
  sectionId: string;
}

export interface SoilQuickEditState {
  ph: string;
  setPh: (v: string) => void;
  moisture: "dry" | "moderate" | "moist" | "";
  setMoisture: (v: "dry" | "moderate" | "moist" | "") => void;
  notesValue: string;
  setNotesValue: (v: string) => void;
  nitrogen: string;
  setNitrogen: (v: string) => void;
  phosphorus: string;
  setPhosphorus: (v: string) => void;
  potassium: string;
  setPotassium: (v: string) => void;
  organicMatter: string;
  setOrganicMatter: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  testedAt: string;
  setTestedAt: (v: string) => void;
  showTestResults: boolean;
  toggleTestResults: () => void;
  saveIfDirty: () => Promise<boolean>;
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

export function useSoilQuickEdit(args: UseSoilQuickEditArgs): SoilQuickEditState {
  const {
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
  } = args;

  const [ph, setPh] = useState(numToStr(soilPh));
  const [moisture, setMoisture] = useState<"dry" | "moderate" | "moist" | "">(soilMoisture ?? "");
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [nitrogen, setNitrogen] = useState(numToStr(nitrogenPpm));
  const [phosphorus, setPhosphorus] = useState(numToStr(phosphorusPpm));
  const [potassium, setPotassium] = useState(numToStr(potassiumPpm));
  const [organicMatter, setOrganicMatter] = useState(numToStr(organicMatterPct));
  const [source, setSource] = useState(soilTestSource ?? "");
  const [testedAt, setTestedAt] = useState(isoToDateInput(soilTestedAt));
  const hasTestData = nitrogenPpm != null || phosphorusPpm != null || potassiumPpm != null
    || organicMatterPct != null || soilTestSource != null || soilTestedAt != null;
  const [showTestResults, setShowTestResults] = useState(hasTestData);

  // Reset on section change: adjusting state during render rather than in an
  // effect so React applies the reset before painting the new section.
  const [prevSectionId, setPrevSectionId] = useState(sectionId);
  if (prevSectionId !== sectionId) {
    setPrevSectionId(sectionId);
    setPh(numToStr(soilPh));
    setMoisture(soilMoisture ?? "");
    setNotesValue(notes ?? "");
    setNitrogen(numToStr(nitrogenPpm));
    setPhosphorus(numToStr(phosphorusPpm));
    setPotassium(numToStr(potassiumPpm));
    setOrganicMatter(numToStr(organicMatterPct));
    setSource(soilTestSource ?? "");
    setTestedAt(isoToDateInput(soilTestedAt));
    setShowTestResults(hasTestData);
  }

  const toggleTestResults = useCallback(() => setShowTestResults((v) => !v), []);

  const saveIfDirty = useCallback(async (): Promise<boolean> => {
    if (!yardId || !sectionId) return true;
    const current = {
      soilPh: strToNumOrNull(ph),
      soilMoisture: (moisture || null) as "dry" | "moderate" | "moist" | null,
      notes: notesValue || null,
      nitrogenPpm: strToNumOrNull(nitrogen),
      phosphorusPpm: strToNumOrNull(phosphorus),
      potassiumPpm: strToNumOrNull(potassium),
      organicMatterPct: strToNumOrNull(organicMatter),
      soilTestSource: source || null,
      soilTestedAt: testedAt || null,
    };
    const dirty =
      current.soilPh !== soilPh ||
      current.soilMoisture !== soilMoisture ||
      current.notes !== notes ||
      current.nitrogenPpm !== nitrogenPpm ||
      current.phosphorusPpm !== phosphorusPpm ||
      current.potassiumPpm !== potassiumPpm ||
      current.organicMatterPct !== organicMatterPct ||
      current.soilTestSource !== soilTestSource ||
      current.soilTestedAt !== isoToDateInput(soilTestedAt);
    if (!dirty) return true;
    try {
      const res = await fetch(`/api/yard/${yardId}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [
    yardId, sectionId,
    ph, moisture, notesValue, nitrogen, phosphorus, potassium, organicMatter, source, testedAt,
    soilPh, soilMoisture, notes, nitrogenPpm, phosphorusPpm, potassiumPpm,
    organicMatterPct, soilTestSource, soilTestedAt,
  ]);

  return {
    ph, setPh,
    moisture, setMoisture,
    notesValue, setNotesValue,
    nitrogen, setNitrogen,
    phosphorus, setPhosphorus,
    potassium, setPotassium,
    organicMatter, setOrganicMatter,
    source, setSource,
    testedAt, setTestedAt,
    showTestResults,
    toggleTestResults,
    saveIfDirty,
  };
}

export function SoilQuickEdit({ state }: { state: SoilQuickEditState }) {
  const {
    ph, setPh,
    moisture, setMoisture,
    notesValue, setNotesValue,
    nitrogen, setNitrogen,
    phosphorus, setPhosphorus,
    potassium, setPotassium,
    organicMatter, setOrganicMatter,
    source, setSource,
    testedAt, setTestedAt,
    showTestResults, toggleTestResults,
  } = state;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-900">Soil details</h3>
        <span className="text-xs text-gray-400">Optional. Saved when you analyze.</span>
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
        onClick={toggleTestResults}
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
              <Input type="number" min="0" max="1000" placeholder="20" value={nitrogen} onChange={(e) => setNitrogen(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Phosphorus (ppm)</Label>
              <Input type="number" min="0" max="2000" placeholder="30" value={phosphorus} onChange={(e) => setPhosphorus(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Potassium (ppm)</Label>
              <Input type="number" min="0" max="2000" placeholder="100" value={potassium} onChange={(e) => setPotassium(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Organic matter (%)</Label>
              <Input type="number" min="0" max="100" step="0.1" placeholder="3" value={organicMatter} onChange={(e) => setOrganicMatter(e.target.value)} />
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
              <Label className="text-xs text-gray-600">Last tested on</Label>
              <Input type="date" value={testedAt} onChange={(e) => setTestedAt(e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
