"use client";

import { useState } from "react";
import Link from "next/link";
import { YardCarousel } from "./YardCarousel";
import { DashboardTaskSection } from "./DashboardTaskSection";

interface YardCardSection {
  id: string;
  name: string;
  areaType: string | null;
  latestHealthScore: number | null;
}

interface YardCard {
  id: string;
  name: string;
  zipCode: string;
  sections: YardCardSection[];
}

interface TaskSection {
  id: string;
  name: string;
  yardId: string;
  yardName: string;
  showYardLabel: boolean;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  product?: string | null;
  applicationRate?: string | null;
  spreaderSetting?: string | null;
  yardSection?: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  } | null;
}

interface Props {
  yards: YardCard[];
  tasks: Task[];
  allSections: TaskSection[];
}

export function DashboardInteractiveSection({ yards, tasks, allSections }: Props) {
  const [selectedYardId, setSelectedYardId] = useState<string | null>(null);

  const selectedYard = selectedYardId ? yards.find((y) => y.id === selectedYardId) ?? null : null;

  const selectedSectionIds = selectedYardId
    ? new Set(allSections.filter((s) => s.yardId === selectedYardId).map((s) => s.id))
    : null;

  const displayTasks = selectedSectionIds
    ? tasks.filter((t) => t.yardSection?.id != null && selectedSectionIds.has(t.yardSection.id))
    : tasks;

  const displaySections = selectedYardId
    ? allSections
        .filter((s) => s.yardId === selectedYardId)
        .map((s) => ({ id: s.id, name: s.name, yardName: s.yardName, showYardLabel: false }))
    : allSections.map((s) => ({ id: s.id, name: s.name, yardName: s.yardName, showYardLabel: s.showYardLabel }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">My Yards</h2>
          <Link href="/yard" className="text-sm text-green-700 hover:underline">
            Manage →
          </Link>
        </div>
        <YardCarousel
          yards={yards}
          selectedYardId={selectedYardId}
          onSelect={setSelectedYardId}
        />
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">
          {selectedYard ? `${selectedYard.name} Tasks` : "Tasks"}
        </h2>
        <DashboardTaskSection tasks={displayTasks} sections={displaySections} />
      </div>
    </div>
  );
}
