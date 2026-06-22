"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { ScheduleEditor } from "@/components/yard/ScheduleEditor";
import { WateringWarning, MowingWarning } from "@/components/yard/ScheduleWarnings";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";
import { distributeWateringDays, distributeMowingDays } from "@/lib/schedules/distribute-days";

interface LatestAnalysis {
  wateringSuggestedDaysPerWeek: number | null;
  wateringSuggestedMinutesPerSession: number | null;
  mowingSuggestedDaysPerWeek: number | null;
  mowingSuggestedHeightInches: number | null;
}

interface Effective {
  wateringDays: string[];
  wateringTime: string | null;
  wateringMinutesPerSession: number | null;
  mowingDays: string[];
  mowingTime: string | null;
  mowingHeightInches: number | null;
}

interface Props {
  sectionId: string;
  plan: string | null;
  latestAnalysis: LatestAnalysis;
  effective: Effective;
}

type KindMode = "picker" | "confirmation" | "hidden";

function wateringMode(a: LatestAnalysis, e: Effective): KindMode {
  if (a.wateringSuggestedDaysPerWeek == null) return "hidden";
  if (e.wateringDays.length === 0) return "picker";
  if (e.wateringDays.length !== a.wateringSuggestedDaysPerWeek) return "picker";
  if (e.wateringMinutesPerSession !== a.wateringSuggestedMinutesPerSession) return "picker";
  return "confirmation";
}

function mowingMode(a: LatestAnalysis, e: Effective): KindMode {
  if (a.mowingSuggestedDaysPerWeek == null) return "hidden";
  if (e.mowingDays.length === 0) return "picker";
  if (e.mowingDays.length !== a.mowingSuggestedDaysPerWeek) return "picker";
  if (e.mowingHeightInches !== a.mowingSuggestedHeightInches) return "picker";
  return "confirmation";
}

export function PersonalizedScheduleCard({ sectionId, plan, latestAnalysis, effective }: Props) {
  const router = useRouter();
  const wMode = wateringMode(latestAnalysis, effective);
  const mMode = mowingMode(latestAnalysis, effective);

  // Placeholder: both kinds failed to produce suggestions
  if (wMode === "hidden" && mMode === "hidden") {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-white mt-6">
        <h3 className="font-semibold mb-2">Personalized Schedule</h3>
        <p className="text-sm text-gray-500">
          We couldn&#39;t generate a schedule recommendation for this analysis. Run another to try again.
        </p>
      </div>
    );
  }

  const initialWateringDays =
    effective.wateringDays.length > 0
      ? effective.wateringDays
      : distributeWateringDays(latestAnalysis.wateringSuggestedDaysPerWeek);
  const initialMowingDays =
    effective.mowingDays.length > 0
      ? effective.mowingDays
      : distributeMowingDays(latestAnalysis.mowingSuggestedDaysPerWeek);

  const [wateringDays, setWateringDays] = useState<string[]>(
    wMode === "picker" ? initialWateringDays : effective.wateringDays,
  );
  const [wateringTime, setWateringTime] = useState<string | null>(effective.wateringTime ?? "07:00");
  const [wateringMins, setWateringMins] = useState<number | null>(
    latestAnalysis.wateringSuggestedMinutesPerSession ?? effective.wateringMinutesPerSession,
  );

  const [mowingDays, setMowingDays] = useState<string[]>(
    mMode === "picker" ? initialMowingDays : effective.mowingDays,
  );
  const [mowingTime, setMowingTime] = useState<string | null>(effective.mowingTime ?? "10:00");
  const [mowingHeight, setMowingHeight] = useState<number | null>(
    latestAnalysis.mowingSuggestedHeightInches ?? effective.mowingHeightInches,
  );

  const [applyToYard, setApplyToYard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCheckbox = canSetSectionSchedule(plan);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/schedule/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watering: { days: wateringDays, time: wateringTime, minutesPerSession: wateringMins },
          mowing: { days: mowingDays, time: mowingTime, heightInches: mowingHeight },
          applyToYard,
        }),
      });
      if (res.ok) {
        router.refresh();
      } else if (res.status === 400) {
        setError("Couldn't save schedule. Check your entries and try again.");
      } else if (res.status === 404) {
        setError("Section not found. Refresh the page.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 bg-white mt-6">
      <h3 className="font-semibold mb-3">Personalized Schedule</h3>

      {wMode === "confirmation" && (
        <p className="text-sm text-green-700 mb-2">
          Your watering schedule ({effective.wateringDays.length} days/week,{" "}
          {effective.wateringMinutesPerSession ?? "?"} min/session
          {effective.wateringTime ? `, ${effective.wateringTime}` : ""}) still looks right.
        </p>
      )}
      {wMode === "picker" && (
        <div className="mb-4">
          <ScheduleEditor
            kind="watering"
            label="Watering schedule"
            days={wateringDays}
            time={wateringTime}
            secondaryValue={wateringMins}
            onDaysChange={setWateringDays}
            onTimeChange={setWateringTime}
            onSecondaryChange={setWateringMins}
          />
          <WateringWarning
            latestAnalysis={latestAnalysis}
            currentDayCount={wateringDays.length}
            currentMinutes={wateringMins}
          />
        </div>
      )}

      {mMode === "confirmation" && (
        <p className="text-sm text-green-700 mb-2">
          Your mowing schedule ({effective.mowingDays.length} days/week at{" "}
          {effective.mowingHeightInches ?? "?"} in
          {effective.mowingTime ? `, ${effective.mowingTime}` : ""}) still looks right.
        </p>
      )}
      {mMode === "picker" && (
        <div className="mb-4">
          <ScheduleEditor
            kind="mowing"
            label="Mowing schedule"
            days={mowingDays}
            time={mowingTime}
            secondaryValue={mowingHeight}
            onDaysChange={setMowingDays}
            onTimeChange={setMowingTime}
            onSecondaryChange={setMowingHeight}
          />
          <MowingWarning
            latestAnalysis={latestAnalysis}
            currentDayCount={mowingDays.length}
            currentHeight={mowingHeight}
          />
        </div>
      )}

      {(wMode === "picker" || mMode === "picker") && (
        <>
          {showCheckbox ? (
            <label className="flex items-center gap-2 mb-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={applyToYard}
                onChange={(e) => setApplyToYard(e.target.checked)}
                disabled={busy}
              />
              Apply to whole yard (all sections)
            </label>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center gap-2 mb-3 text-sm text-gray-500 hover:text-gray-700"
            >
              <input
                type="checkbox"
                checked={false}
                disabled
                className="cursor-not-allowed"
                aria-hidden="true"
              />
              <span className="line-through">Save just for this section</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <Lock className="w-3 h-3" />
                Home Plus
              </span>
            </Link>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save schedule"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => router.refresh()}
              className="text-gray-700 underline px-3 py-2 text-sm disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700 mt-2">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
