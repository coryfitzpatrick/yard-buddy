"use client";

import { useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import Link from "next/link";

interface Props {
  yardId: string;
  sectionId: string;
  mowingSchedule: string | null;
  wateringSchedule: string | null;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatSchedule(raw: string | null, unit: "in" | "min"): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.days)) return raw;
    const parts: string[] = [];
    if (p.days.length) parts.push(p.days.join(", "));
    if (p.time) parts.push(`at ${formatTime(p.time)}`);
    if (p.inches) parts.push(`· ${p.inches} ${unit}`);
    return parts.join(" ") || null;
  } catch {
    return raw;
  }
}

export function PersonalizedRemindersCard({
  yardId,
  sectionId,
  mowingSchedule,
  wateringSchedule,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasContent = mowingSchedule || wateringSchedule;
  const editHref = `/yard/${yardId}/sections/${sectionId}/edit#schedule`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-6">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          className="flex items-center justify-between flex-1 px-5 py-4 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Personalized Reminders
            </span>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        <Link
          href={editHref}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors px-4 py-4 shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Link>
      </div>

      {open && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {!hasContent ? (
            <p className="text-sm text-gray-500">
              No schedule set.{" "}
              <Link href={editHref} className="text-green-600 hover:underline">
                Add one →
              </Link>
            </p>
          ) : (
            <>
              {mowingSchedule && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Mowing</p>
                  <p className="text-sm text-gray-700">{formatSchedule(mowingSchedule, "in")}</p>
                </div>
              )}
              {wateringSchedule && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Watering</p>
                  <p className="text-sm text-gray-700">{formatSchedule(wateringSchedule, "min")}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
