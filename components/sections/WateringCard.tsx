"use client";

import { useState } from "react";
import { Droplets } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  sectionId: string;
  yardId: string;
  initialSchedule: string | null;
  initialDeviates: boolean | null;
  hasYardSchedule: boolean;
}

export function WateringCard({
  sectionId,
  yardId,
  initialSchedule,
  initialDeviates,
  hasYardSchedule,
}: Props) {
  const [schedule, setSchedule] = useState(initialSchedule);
  const [deviates, setDeviates] = useState(initialDeviates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRecommendation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/watering`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to get recommendation. Try again.");
        return;
      }
      const data = await res.json();
      setSchedule(data.schedule);
      setDeviates(data.deviates);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="w-4 h-4 text-blue-500" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Watering</h2>
      </div>

      {schedule && (
        <div
          className={cn(
            "rounded-lg p-3 mb-3 text-sm border",
            deviates
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-green-50 text-green-800 border-green-200"
          )}
        >
          {schedule}
        </div>
      )}

      {!schedule && !hasYardSchedule && (
        <p className="text-sm text-gray-500 mb-3">
          <Link href={`/yard/${yardId}/edit`} className="text-green-600 hover:underline">
            Add a watering schedule to your yard
          </Link>{" "}
          for a personalised assessment, or get a general recommendation below.
        </p>
      )}

      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}

      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={fetchRecommendation}
        className="text-xs"
      >
        <Droplets className="w-3 h-3 mr-1" />
        {loading
          ? "Getting recommendation…"
          : schedule
          ? "Refresh"
          : "Get watering recommendation"}
      </Button>
    </div>
  );
}
