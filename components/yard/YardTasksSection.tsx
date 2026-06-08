"use client";

import { useState } from "react";
import { TaskList } from "@/components/dashboard/TaskList";
import { SectionFilterPills } from "@/components/dashboard/SectionFilterPills";

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
  taskMode: string | null;
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
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = tasks.filter((t) => t.status !== "skipped");
  if (active.length === 0) return null;

  const filtered = activeId ? active.filter((t) => t.yardSection.id === activeId) : active;

  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Tasks</h3>
        <SectionFilterPills sections={sections} activeId={activeId} onSelect={setActiveId} />
      </div>
      <TaskList key={activeId ?? "all"} tasks={filtered} multiYard={sections.length > 1 && activeId === null} />
    </div>
  );
}
