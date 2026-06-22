"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Kind = "watering" | "mowing";

type AnalysisShape = {
  id: string;
  wateringSchedule: string | null;
  wateringDeviates: boolean | null;
  wateringSuggestedDaysPerWeek: number | null;
  wateringSuggestedMinutesPerSession: number | null;
  wateringRecommendationDismissedAt: Date | string | null;
  mowingSchedule: string | null;
  mowingDeviates: boolean | null;
  mowingSuggestedDaysPerWeek: number | null;
  mowingSuggestedHeightInches: number | null;
  mowingRecommendationDismissedAt: Date | string | null;
};

type Effective = {
  days: string[];
  time: string | null;
  minutesPerSession: number | null;
  heightInches: number | null;
};

interface Props {
  kind: Kind;
  sectionId: string;
  latestAnalysis: AnalysisShape | null;
  effective: Effective;
  plan: string | null;
}

export function ScheduleRecommendationCard({ kind, sectionId, latestAnalysis, effective, plan }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!latestAnalysis) {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-white">
        <h3 className="font-semibold mb-1">{kind === "watering" ? "Watering" : "Mowing"}</h3>
        <p className="text-sm text-gray-500">
          Run an analysis to see your {kind} recommendation.{" "}
          <Link href="/analyze" className="text-green-600 hover:underline">Analyze now</Link>
        </p>
      </div>
    );
  }

  const schedule = kind === "watering" ? latestAnalysis.wateringSchedule : latestAnalysis.mowingSchedule;
  const deviates = kind === "watering" ? latestAnalysis.wateringDeviates : latestAnalysis.mowingDeviates;
  const suggestedDays = kind === "watering" ? latestAnalysis.wateringSuggestedDaysPerWeek : latestAnalysis.mowingSuggestedDaysPerWeek;
  const suggestedSecond = kind === "watering" ? latestAnalysis.wateringSuggestedMinutesPerSession : latestAnalysis.mowingSuggestedHeightInches;
  const dismissedAt = kind === "watering" ? latestAnalysis.wateringRecommendationDismissedAt : latestAnalysis.mowingRecommendationDismissedAt;
  const currentDayCount = effective.days.length;
  const currentSecond = kind === "watering" ? effective.minutesPerSession : effective.heightInches;

  const stillDeviates = deviates === true
    && ((suggestedDays != null && currentDayCount > 0 && suggestedDays !== currentDayCount)
        || (suggestedSecond != null && currentSecond != null && suggestedSecond !== currentSecond));

  // State B - no deviation (or recomputed away)
  if (!stillDeviates) {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-white">
        <h3 className="font-semibold mb-1">{kind === "watering" ? "Watering" : "Mowing"}</h3>
        {schedule && <p className="text-sm text-gray-700">{schedule}</p>}
      </div>
    );
  }

  // State D - dismissed, collapsed
  if (dismissedAt && !expanded) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          {kind === "watering" ? "Watering" : "Mowing"} schedule override, not following our guidance.
          <button onClick={() => setExpanded(true)} aria-expanded={expanded} className="ml-2 underline">Show suggestion</button>
        </p>
      </div>
    );
  }

  // State C - deviating, action buttons
  const formatSecond = (v: number | null) =>
    kind === "watering" ? `${v ?? "?"} min/session` : `${v ?? "?"} in`;
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/${kind}/apply`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else if (res.status === 400) {
        setError("Couldn't apply. Try running a new analysis.");
      } else if (res.status === 404) {
        setError("Section or analysis not found. Refresh the page.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/${kind}/dismiss`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else if (res.status === 409) {
        setError("Nothing to dismiss.");
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
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="font-semibold mb-1 text-amber-900">
        This section may need a different {kind} schedule
      </h3>
      {schedule && <p className="text-sm text-amber-900 mb-3">{schedule}</p>}
      <div className="grid grid-cols-2 gap-3 text-sm text-amber-900 mb-4">
        <div>
          <div className="text-xs text-amber-700">Current</div>
          <div>
            {effective.days.length > 0
              ? `${effective.days.length} days/week (${effective.days.join(", ")})`
              : "No schedule set"}
            {currentSecond != null && `, ${formatSecond(currentSecond)}`}
            {effective.time && `, ${effective.time}`}
          </div>
        </div>
        <div>
          <div className="text-xs text-amber-700">Suggested</div>
          <div>
            {suggestedDays ?? "?"} days/week
            {suggestedSecond != null && `, ${formatSecond(suggestedSecond)}`}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={apply} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          Apply suggestion
        </button>
        <button disabled={busy} onClick={dismiss} className="text-amber-900 underline px-3 py-2 text-sm disabled:opacity-50">
          Ignore
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
      {plan === "home_basic" && (
        <p className="text-xs text-amber-700 mt-3">Applies to your whole yard. Upgrade to Home Plus to override per section.</p>
      )}
    </div>
  );
}
