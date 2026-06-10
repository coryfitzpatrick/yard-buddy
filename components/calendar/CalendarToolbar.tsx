"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLabel, prevMonth, nextMonth } from "@/lib/calendar-utils";

interface Props {
  yards: { id: string; name: string; sections: { id: string; name: string }[] }[];
  selectedYard: string;
  selectedSection: string;
  month: string;
}

export function CalendarToolbar({ yards, selectedYard, selectedSection, month }: Props) {
  const router = useRouter();

  function pushParams(updates: Record<string, string>) {
    const params = new URLSearchParams({
      month,
      ...(selectedYard ? { yard: selectedYard } : {}),
      ...(selectedSection ? { section: selectedSection } : {}),
      ...updates,
    });
    for (const [k, v] of [...params.entries()]) {
      if (!v) params.delete(k);
    }
    router.push(`/calendar?${params.toString()}`);
  }

  const selectedYardObj = yards.find((y) => y.id === selectedYard);
  const sectionOptions = selectedYardObj?.sections ?? [];

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-3">
      <div className="flex gap-2 flex-wrap">
        <select
          value={selectedYard}
          onChange={(e) => pushParams({ yard: e.target.value, section: "" })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Yards</option>
          {yards.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>

        <select
          value={selectedSection}
          onChange={(e) => pushParams({ section: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          disabled={!selectedYard}
        >
          <option value="">All Sections</option>
          {sectionOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label="Previous month"
          onClick={() => pushParams({ month: prevMonth(month) })}
          className="border border-gray-200 rounded-lg p-1.5 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">
          {formatMonthLabel(month)}
        </span>
        <button
          aria-label="Next month"
          onClick={() => pushParams({ month: nextMonth(month) })}
          className="border border-gray-200 rounded-lg p-1.5 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
