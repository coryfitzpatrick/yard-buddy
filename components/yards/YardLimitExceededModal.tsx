"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  planLabel: string;
  newMaxYards: number;
  yards: { id: string; name: string }[];
}

export function YardLimitExceededModal({ planLabel, newMaxYards, yards }: Props) {
  const router = useRouter();
  const [selectedKeep, setSelectedKeep] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archiveCount = yards.length - newMaxYards;
  const canSubmit = selectedKeep.size === newMaxYards;

  function toggle(id: string) {
    setSelectedKeep((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < newMaxYards) next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const archiveYardIds = yards.filter((y) => !selectedKeep.has(y.id)).map((y) => y.id);
    const res = await fetch("/api/yards/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveYardIds }),
    });
    if (!res.ok) {
      setError("Couldn't archive the yards. Try again.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="yard-limit-exceeded-title"
        className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        <h2 id="yard-limit-exceeded-title" className="text-lg font-semibold text-gray-900 mb-1">
          Your plan changed to {planLabel}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {planLabel} supports {newMaxYards} yard{newMaxYards === 1 ? "" : "s"}, and you currently have {yards.length}. Pick the {newMaxYards} yard{newMaxYards === 1 ? "" : "s"} you want to keep on {planLabel}, or upgrade to keep all {yards.length}.
        </p>

        <p className="text-sm font-medium text-gray-900 mb-2">
          Keep these yards on {planLabel} ({selectedKeep.size} of {newMaxYards} selected)
        </p>
        <ul className="space-y-2 mb-4">
          {yards.map((y) => {
            const checked = selectedKeep.has(y.id);
            const disabled = !checked && selectedKeep.size >= newMaxYards;
            return (
              <li key={y.id}>
                <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer ${checked ? "border-green-500 bg-green-50" : disabled ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed" : "border-gray-200"}`}>
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

        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          The {archiveCount} yard{archiveCount === 1 ? "" : "s"} you don&apos;t pick will be archived. Archived yards stop sending reminders and don&apos;t count toward your plan. Your data is kept and is automatically restored if you upgrade later.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end flex-wrap">
          <Link href="/pricing">
            <Button variant="outline" disabled={busy}>
              Upgrade to keep all {yards.length}
            </Button>
          </Link>
          <Button onClick={submit} disabled={!canSubmit || busy} className="bg-green-600 hover:bg-green-700 text-white">
            {busy ? "Archiving…" : `Keep ${newMaxYards} yard${newMaxYards === 1 ? "" : "s"}, archive ${archiveCount}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
