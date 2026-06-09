"use client";

import { useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

interface Props {
  yardId: string;
  sectionId: string;
  mowingSchedule: string | null;
  wateringSchedule: string | null;
}

export function PersonalizedRemindersCard({
  yardId,
  sectionId,
  mowingSchedule,
  wateringSchedule,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasContent = mowingSchedule || wateringSchedule;

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-6">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center justify-between w-full px-5 py-4 text-left"
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

      {open && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {!hasContent ? (
            <p className="text-sm text-gray-500">
              <Link
                href={`/yard/${yardId}/sections/${sectionId}/edit`}
                className="text-green-600 hover:underline"
              >
                Set your schedule on the edit page →
              </Link>
            </p>
          ) : (
            <>
              {mowingSchedule && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Mowing</p>
                  <p className="text-sm text-gray-700">{mowingSchedule}</p>
                </div>
              )}
              {wateringSchedule && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Watering</p>
                  <p className="text-sm text-gray-700">{wateringSchedule}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
