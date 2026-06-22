"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Yard {
  id: string;
  name: string;
}

interface Props {
  targetPlan: string;
  targetPlanLabel: string;
  newMaxYards: number;
  yards: Yard[];
  currentPeriod: "monthly" | "annual";
  onClose: () => void;
  onSuccess: () => void;
}

export function DowngradeModal({
  targetPlan,
  targetPlanLabel,
  newMaxYards,
  yards,
  currentPeriod,
  onClose,
  onSuccess,
}: Props) {
  const [selectedKeep, setSelectedKeep] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archiveCount = yards.length - newMaxYards;
  const isValid = selectedKeep.size === newMaxYards && confirmation === "DOWNGRADE";

  function toggle(yardId: string) {
    setSelectedKeep((prev) => {
      const next = new Set(prev);
      if (next.has(yardId)) next.delete(yardId);
      else if (next.size < newMaxYards) next.add(yardId);
      return next;
    });
  }

  async function submit() {
    if (!isValid) return;
    setBusy(true);
    setError(null);
    const archiveYardIds = yards.filter((y) => !selectedKeep.has(y.id)).map((y) => y.id);
    const res = await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: targetPlan, period: currentPeriod, archiveYardIds }),
    });
    if (res.ok) {
      onSuccess();
      return;
    }
    setBusy(false);
    if (res.status === 402) {
      setError("Couldn't process the plan change. Check your payment method and try again.");
    } else {
      setError("Something went wrong. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Downgrading to {targetPlanLabel}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          You&apos;ll have {newMaxYards} yard{newMaxYards === 1 ? "" : "s"}. The {archiveCount} yard{archiveCount === 1 ? "" : "s"} you don&apos;t pick will be archived.
        </p>

        <p className="text-sm font-medium text-gray-900 mb-2">
          Pick {newMaxYards} yard{newMaxYards === 1 ? "" : "s"} to keep ({selectedKeep.size} of {newMaxYards} selected)
        </p>
        <ul className="space-y-2 mb-4">
          {yards.map((y) => {
            const checked = selectedKeep.has(y.id);
            const disabled = !checked && selectedKeep.size >= newMaxYards;
            return (
              <li key={y.id}>
                <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${checked ? "border-green-500 bg-green-50" : disabled ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-200"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || busy}
                    onChange={() => toggle(y.id)}
                  />
                  <span className="text-sm text-gray-900">{y.name}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          Archived yards stop sending reminders and don&apos;t count toward your plan. Your data is kept and restored if you upgrade. Your card will be credited for unused time on your current plan.
        </div>

        <label className="block text-sm font-medium text-gray-900 mb-1">
          Type DOWNGRADE to confirm
        </label>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
          placeholder="DOWNGRADE"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
        />

        {error && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isValid || busy} className="bg-red-600 hover:bg-red-700 text-white">
            {busy ? "Processing..." : "Downgrade"}
          </Button>
        </div>
      </div>
    </div>
  );
}
