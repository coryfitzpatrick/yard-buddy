"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { Camera, ArrowRight, CheckCircle2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardTaskSection } from "@/components/dashboard/DashboardTaskSection";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";

interface SectionSummary {
  id: string;
  slug: string;
  name: string;
  areaType: string | null;
  grassType: string;
  yardSizeSqft: number | null;
  latestHealthScore: number | null;
  pendingTaskCount: number;
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
  productSearchQuery: string | null;
  additionalSectionIds?: string[];
  mergedSections?: string[];
  yardSection: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  };
}

interface Props {
  yardId: string;
  zip: string;
  initialWeatherCollapsed: boolean;
  sections: SectionSummary[];
  tasks: Task[];
  hiddenTaskCount?: number;
}

function SectionCard({
  section,
  yardId,
  selected,
  onSelect,
}: {
  section: SectionSummary;
  yardId: string;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
  const Icon = areaCfg?.icon;

  const dotColor =
    section.latestHealthScore == null
      ? "bg-gray-200"
      : section.latestHealthScore >= 70
      ? "bg-green-400"
      : section.latestHealthScore >= 40
      ? "bg-yellow-400"
      : "bg-red-400";

  const scoreColor =
    section.latestHealthScore == null
      ? "text-gray-400"
      : section.latestHealthScore >= 70
      ? "text-green-600"
      : section.latestHealthScore >= 40
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : section.id)}
      className={cn(
        "flex flex-col w-full text-left rounded-xl border-2 p-3 transition-all bg-white",
        selected
          ? "border-green-500 ring-1 ring-green-300 bg-green-50"
          : "border-gray-200 hover:border-green-300"
      )}
    >
      {/* Header: name + View/Edit links */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <span
            className={cn(
              "font-semibold text-sm leading-tight truncate",
              selected ? "text-green-900" : "text-gray-900"
            )}
          >
            {section.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/yard/${yardId}/sections/${section.slug}/edit`}
            className="flex items-center gap-0.5 text-xs font-medium text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </Link>
          <Link
            href={`/yard/${yardId}/sections/${section.slug}`}
            className="flex items-center gap-0.5 text-xs font-medium text-green-600 hover:text-green-700 px-1.5 py-0.5 rounded-md hover:bg-green-100 transition-colors"
          >
            View <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Grass type + size */}
      <p className="text-xs text-gray-400 mb-2 capitalize ml-0.5">
        {section.grassType.replace(/_/g, " ")}
        {section.yardSizeSqft ? ` · ${section.yardSizeSqft.toLocaleString()} sq ft` : ""}
      </p>

      {/* Health + tasks + analyze row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColor)} />
          {section.latestHealthScore != null ? (
            <span className={cn("text-sm font-bold", scoreColor)}>{section.latestHealthScore}</span>
          ) : (
            <span className="text-xs text-gray-400">No analysis</span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {section.pendingTaskCount > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-medium">
              {section.pendingTaskCount} task{section.pendingTaskCount !== 1 ? "s" : ""}
            </span>
          )}
          <Link href={`/analyze?sectionId=${section.id}`} onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" tabIndex={-1}>
              <Camera className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          "border-t pt-2 flex items-center gap-1 text-xs mt-auto",
          selected ? "border-green-200 text-green-700" : "border-gray-100 text-gray-400"
        )}
      >
        {selected ? (
          <><CheckCircle2 className="w-3 h-3" /> Filtering tasks</>
        ) : (
          "Tap to filter tasks"
        )}
      </div>
    </button>
  );
}

function YardSummaryHero({ section, yardId }: { section: SectionSummary; yardId: string }) {
  const scoreColor =
    section.latestHealthScore == null
      ? "text-gray-400"
      : section.latestHealthScore >= 70
      ? "text-green-600"
      : section.latestHealthScore >= 40
      ? "text-yellow-600"
      : "text-red-500";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          {section.latestHealthScore != null ? (
            <>
              <div className="text-xs uppercase tracking-wide text-gray-400 font-medium">Health score</div>
              <div className={cn("text-4xl font-bold", scoreColor)}>
                {section.latestHealthScore}
                <span className="text-base font-normal text-gray-400"> / 100</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wide text-gray-400 font-medium">Status</div>
              <div className="text-base font-medium text-gray-500">No analysis yet. Upload photos to get a plan.</div>
            </>
          )}
          <div className="text-xs text-gray-400 capitalize pt-1">
            {section.grassType.replace(/_/g, " ")}
            {section.yardSizeSqft ? ` · ${section.yardSizeSqft.toLocaleString()} sq ft` : ""}
          </div>
        </div>
        {section.pendingTaskCount > 0 && (
          <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2.5 py-1 font-medium shrink-0">
            {section.pendingTaskCount} task{section.pendingTaskCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Link href={`/analyze?sectionId=${section.id}`}>
          <Button className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
            <Camera className="w-4 h-4 mr-1.5" /> Analyze My Yard
          </Button>
        </Link>
        <Link href={`/yard/${yardId}/sections/${section.slug}`}>
          <Button variant="outline" className="w-full sm:w-auto">
            <ArrowRight className="w-4 h-4 mr-1.5" /> View full history
          </Button>
        </Link>
      </div>
      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
        <Link
          href={`/yard/${yardId}/split`}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-700 font-medium"
        >
          <Plus className="w-3 h-3" /> Split into sections
        </Link>
      </div>
    </div>
  );
}

export function YardDetailInteractive({ yardId, zip, initialWeatherCollapsed, sections, tasks, hiddenTaskCount }: Props) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const filteredTasks = selectedSectionId
    ? tasks.filter(
        (t) =>
          t.yardSection.id === selectedSectionId ||
          t.additionalSectionIds?.includes(selectedSectionId)
      )
    : tasks;

  const displaySections = sections.map((s) => ({
    id: s.id,
    name: s.name,
    yardName: "",
    showYardLabel: false,
  }));

  return (
    <div className="space-y-6">
      {sections.length === 1 ? (
        <YardSummaryHero section={sections[0]} yardId={yardId} />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base text-gray-700">Sections</h2>
            <Link
              href={`/yard/${yardId}/sections/new`}
              className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Section
            </Link>
          </div>
          {sections.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
              No sections yet. Add one to get started.
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-2">
              {sections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  yardId={yardId}
                  selected={section.id === selectedSectionId}
                  onSelect={setSelectedSectionId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weather — between sections and tasks, matching dashboard layout */}
      <WeatherWidget zip={zip} initialCollapsed={initialWeatherCollapsed} />

      {/* Task list */}
      {(tasks.length > 0 || (hiddenTaskCount ?? 0) > 0) && (
        <div>
          <h2 className="font-semibold text-base text-gray-700 mb-3">
            {selectedSectionId
              ? `${sections.find((s) => s.id === selectedSectionId)?.name ?? ""} Tasks`
              : "Tasks"}
          </h2>
          <DashboardTaskSection
            key={selectedSectionId ?? "all"}
            tasks={filteredTasks}
            sections={displaySections}
            weatherRefreshedAt={null}
            hiddenTaskCount={selectedSectionId === null ? hiddenTaskCount : undefined}
          />
        </div>
      )}
    </div>
  );
}
