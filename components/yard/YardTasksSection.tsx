"use client";

import { useState } from "react";
import { TaskList } from "@/components/dashboard/TaskList";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  overdueNote: string | null;
  stillWorthDoing: boolean | null;
  product: string | null;
  applicationRate: string | null;
  spreaderSetting: string | null;
  yardSectionId: string;
  yardSection: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  };
}

export function YardTasksSection({
  sections,
  tasks,
}: {
  sections: Section[];
  tasks: Task[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = tasks.filter((t) => t.status !== "skipped");
  if (active.length === 0) return null;

  const filtered = selectedId ? active.filter((t) => t.yardSectionId === selectedId) : active;

  return (
    <div className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide shrink-0">Tasks</h3>
        {sections.length > 1 && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            <button
              onClick={() => setSelectedId(null)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                selectedId === null
                  ? "bg-green-600 text-white border-green-600"
                  : "text-gray-500 border-gray-200 hover:border-gray-300"
              )}
            >
              All
            </button>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  selectedId === s.id
                    ? "bg-green-600 text-white border-green-600"
                    : "text-gray-500 border-gray-200 hover:border-gray-300"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <TaskList tasks={filtered} multiYard={sections.length > 1} />
    </div>
  );
}
