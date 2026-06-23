"use client";

import Link from "next/link";
import { X, ShoppingCart } from "lucide-react";
import type { CalendarTask } from "@/lib/calendar-utils";

interface Props {
  task: CalendarTask;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
  skipped:   "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pending",
  completed: "Completed ✓",
  skipped:   "Skipped",
};

export function TaskPopover({ task, onClose }: Props) {
  const badgeClass = STATUS_BADGE[task.status] ?? STATUS_BADGE.pending;
  const statusLabel = STATUS_LABEL[task.status] ?? task.status;

  const buyUrl = task.product
    ? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(task.productSearchQuery ?? task.product)}`
    : null;

  return (
    <>
      {/* Transparent backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-20" onClick={onClose} />

      <div className="absolute z-30 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 mt-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
              {statusLabel}
            </span>
            <span className="text-sm font-semibold text-gray-900">{task.title}</span>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-600 mb-3 line-clamp-3">{task.description}</p>

        <div className="text-xs text-gray-500 mb-1">
          {task.sectionName} · {task.yardName}
        </div>
        <div className="text-xs text-gray-500 mb-3">
          {formatDate(task.scheduledStart)} to {formatDate(task.scheduledEnd)}
        </div>

        <div className="flex flex-col gap-2">
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 underline underline-offset-2"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Shop {task.product}
            </a>
          )}
          <Link
            href={`/yard/${task.yardId}/sections/${task.sectionId}`}
            className="text-xs font-medium text-green-700 hover:text-green-900"
          >
            View section →
          </Link>
        </div>
      </div>
    </>
  );
}
