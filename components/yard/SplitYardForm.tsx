"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AreaKey = "front" | "back" | "left_side" | "right_side" | "garden";

const AREA_OPTIONS: { key: AreaKey; label: string; description: string }[] = [
  { key: "front", label: "Front Yard", description: "Curb-side, usually most visible" },
  { key: "back", label: "Back Yard", description: "Behind the house" },
  { key: "left_side", label: "Left Side Yard", description: "Between house and left fence" },
  { key: "right_side", label: "Right Side Yard", description: "Between house and right fence" },
  { key: "garden", label: "Garden / Border", description: "Decorative planting or border strip" },
];

interface Props {
  yardId: string;
  yardSlug: string;
  currentGrassType: string;
}

export function SplitYardForm({ yardId, yardSlug, currentGrassType }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<AreaKey>>(new Set(["front", "back"]));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: AreaKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size < 2) {
      setError("Pick at least two sections. Splitting into one isn't really splitting.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/yard/${yardId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaTypes: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Couldn't split yard. Try again.");
        return;
      }
      router.push(`/yard/${yardSlug}`);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {AREA_OPTIONS.map(({ key, label, description }) => {
          const checked = selected.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                "w-full text-left rounded-lg border-2 p-3 transition-all flex items-start gap-3",
                checked ? "border-green-600 bg-green-50" : "border-gray-200 bg-white hover:border-green-400"
              )}
            >
              <span
                className={cn(
                  "shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center",
                  checked ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"
                )}
              >
                {checked && (
                  <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M3 8l4 4 6-8" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <div className={cn("font-medium text-sm", checked ? "text-green-900" : "text-gray-800")}>
                  {label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{description}</div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        Each new section will start with the current grass type ({currentGrassType.replace(/_/g, " ")}). Edit per section after.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/yard/${yardSlug}`)} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || selected.size < 2}
          className="bg-green-600 hover:bg-green-700 flex-1"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Splitting…</>
          ) : (
            `Replace with ${selected.size} section${selected.size === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </div>
  );
}
