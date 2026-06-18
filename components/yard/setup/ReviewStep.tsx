"use client";

import type { YardSetupController } from "./useYardSetup";

export function ReviewStep({ c }: { c: YardSetupController }) {
  const missing: { label: string; stepTo: number }[] = [];
  if (!c.watch("yardSizeSqft")) missing.push({ label: "Yard size: used to size product applications", stepTo: 3 });
  if (!c.watch("soilPh")) missing.push({ label: "Soil pH: sharpens fertilizer recommendations", stepTo: 3 });
  if (!c.watch("soilMoisture")) missing.push({ label: "Soil moisture: informs watering advice", stepTo: 3 });
  if (!c.spreaderType) missing.push({ label: "Spreader type: needed for precise application rates", stepTo: 3 });
  if (!c.wateringDaysPerWeek || !c.wateringMinutesPerSession) {
    missing.push({ label: "Current watering schedule: helps refine our suggestions", stepTo: 3 });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-500">Review before saving.</p>
      <div className="rounded-lg bg-gray-50 p-4 space-y-2">
        {!c.createdYardId && <div><span className="font-medium">Property:</span> {c.propertyName} ({c.zipCode})</div>}
        {c.createdYardId && <div><span className="font-medium">Property:</span> {c.createdPropertyName}</div>}
        {c.createdYardId && (
          <>
            <div><span className="font-medium">Section:</span> {c.watch("name")}</div>
            <div><span className="font-medium">Area:</span> {c.watch("areaType")?.replace(/_/g, " ") ?? "Not specified"}</div>
          </>
        )}
        <div><span className="font-medium">Grass:</span> {c.watch("grassType")?.replace(/_/g, " ")}</div>
        {!!c.watch("yardSizeSqft") && (
          <div><span className="font-medium">Size:</span> {String(c.watch("yardSizeSqft"))} sq ft</div>
        )}
        {!!c.spreaderType && (
          <div><span className="font-medium">Spreader:</span> {c.spreaderType}</div>
        )}
        <div>
          <span className="font-medium">Photos:</span>{" "}
          {c.setupPhotoCount > 0
            ? `${c.setupPhotoCount} ready. We'll analyze them right after saving.`
            : "None"}
        </div>
      </div>

      {c.setupPhotoCount === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="font-semibold text-amber-900">No photos added</p>
          <p className="text-amber-800 text-xs leading-relaxed">
            Without photos we can only give generic advice. For an accurate
            analysis, add at least:
          </p>
          <ul className="text-xs text-amber-800 list-disc pl-5 space-y-0.5">
            <li>A wide overview of the section</li>
            <li>A close-up of grass blades and soil</li>
            <li>Any damage spots or weeds</li>
          </ul>
          <button
            type="button"
            onClick={() => c.setStep(4)}
            className="text-xs font-semibold text-amber-900 underline hover:text-amber-700"
          >
            Add photos now
          </button>
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
          <p className="font-semibold text-blue-900">Add later for better recommendations</p>
          <p className="text-blue-800 text-xs">
            These optional details sharpen the analysis. You can add them now or
            from the section page anytime.
          </p>
          <ul className="text-xs text-blue-800 space-y-1">
            {missing.map((m) => (
              <li key={m.label} className="flex items-start gap-2">
                <span className="flex-1">{m.label}</span>
                <button
                  type="button"
                  onClick={() => c.setStep(m.stepTo)}
                  className="shrink-0 text-blue-900 underline hover:text-blue-700 font-medium"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
