"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { SPREADER_BRANDS, type YardSetupController } from "./useYardSetup";

export function SoilStep({ c }: { c: YardSetupController }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Street Address (optional, used to look up yard size)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="123 Main St"
            value={c.streetAddress}
            onChange={(e) => c.setStreetAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); c.lookupYardSize(); } }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!c.streetAddress.trim() || c.lookingUp}
            onClick={c.lookupYardSize}
            className="shrink-0"
          >
            {c.lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        {c.lookupNote && (
          <p className={`text-sm font-medium ${c.lookupNote.startsWith("Lot:") ? "text-green-700" : "text-gray-500"}`}>
            {c.lookupNote}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label>Section Size</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={c.sizeUnit === "sqft" ? "5000" : "0.115"}
            value={c.sizeDisplay}
            onChange={(e) => c.handleSizeInput(e.target.value)}
            min="0"
            step={c.sizeUnit === "acres" ? "0.001" : "1"}
          />
          <Select value={c.sizeUnit} onValueChange={(v) => c.handleUnitChange(v as "sqft" | "acres")}>
            <SelectTrigger className="w-28 shrink-0"><SelectValue>{c.sizeUnit === "sqft" ? "sq ft" : "acres"}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="sqft">sq ft</SelectItem>
              <SelectItem value="acres">acres</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-gray-400">Optional. Helps calculate product amounts.</p>
      </div>
      <div className="space-y-1">
        <Label>Soil pH</Label>
        <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...c.register("soilPh")} />
        <p className="text-sm text-gray-400">Test with a soil kit from your local hardware store</p>
      </div>
      <div className="space-y-1">
        <Label>Last tested on <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input type="date" {...c.register("soilTestedAt")} />
        <p className="text-sm text-gray-400">When you last ran a soil test. Helps us judge how current the results are.</p>
      </div>
      <div className="space-y-1">
        <Label>Soil Moisture</Label>
        <Select onValueChange={(v) => c.setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
          <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dry">Dry: cracks easily, water beads</SelectItem>
            <SelectItem value="moderate">Moderate: moist 1 inch down</SelectItem>
            <SelectItem value="moist">Moist: stays damp, possible overwatering</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-400">Push a screwdriver 6&quot; into soil: slides in = moist, resistance = moderate, very hard = dry.</p>
      </div>
      <div className="space-y-1">
        <Label>Spreader Type</Label>
        <Select value={c.spreaderType || undefined} onValueChange={(v) => c.setSpreaderType(v ?? "")}>
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
        <Input placeholder="e.g. Scotts EdgeGuard DLX" value={c.spreaderModel} onChange={(e) => c.setSpreaderModel(e.target.value)} />
        {c.spreaderType && SPREADER_BRANDS[c.spreaderType]?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {SPREADER_BRANDS[c.spreaderType].map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => c.setSpreaderModel(brand)}
                className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
              >
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
          value={c.wateringDaysPerWeek}
          onChange={(e) => c.setWateringDaysPerWeek(e.target.value)}
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
          value={c.wateringMinutesPerSession}
          onChange={(e) => c.setWateringMinutesPerSession(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Additional Notes</Label>
        <Textarea placeholder="Shady areas, problem spots, recent treatments…" {...c.register("notes")} />
      </div>
    </div>
  );
}
