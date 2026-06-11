"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Package,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  CalendarCheck,
  ShoppingCart,
  Lock,
} from "lucide-react";
import { LockedTaskCard } from "./LockedTaskCard";
import { cn } from "@/lib/utils";

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
  yardSection?: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  } | null;
  mergedIds?: string[];
  mergedSections?: string[];
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_GROUP: Record<string, "Urgent" | "High" | "Routine"> = {
  urgent: "Urgent",
  high: "High",
  medium: "Routine",
  low: "Routine",
};

const GROUP_STYLES: Record<string, { heading: string }> = {
  Urgent: { heading: "text-red-600" },
  High: { heading: "text-orange-600" },
  Routine: { heading: "text-green-700" },
};

function formatDateRange(startStr: string, endStr: string): string {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const startMonth = start.toLocaleString("en-US", { month: "short" });
  const endMonth = end.toLocaleString("en-US", { month: "short" });
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
}

function isWindowActive(startStr: string, endStr: string): boolean {
  const now = new Date();
  const start = new Date(startStr);
  const end = new Date(endStr);
  return start <= now && end >= now;
}

function DateBadge({ scheduledStart, scheduledEnd }: { scheduledStart: string; scheduledEnd: string }) {
  const active = isWindowActive(scheduledStart, scheduledEnd);
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0",
        active ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
      )}
    >
      {formatDateRange(scheduledStart, scheduledEnd)}
    </span>
  );
}

function TaskCard({
  task,
  multiYard,
  onToggle,
}: {
  task: Task;
  multiYard: boolean;
  onToggle: (id: string, current: string) => void;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <button onClick={() => onToggle(task.id, task.status)} className="mt-0.5 shrink-0">
            <Circle className="w-5 h-5 text-gray-300 hover:text-green-500 transition-colors" />
          </button>
          <div className="flex-1 min-w-0">
            {task.mergedSections ? (
              <div className="text-xs text-green-700 font-medium mb-1">
                {task.mergedSections.join(" · ")}
              </div>
            ) : task.yardSection ? (
              <div className="text-xs text-green-700 font-medium mb-1">
                {multiYard && task.yardSection.yard.name !== task.yardSection.name
                  ? `${task.yardSection.yard.name} > ${task.yardSection.name}`
                  : task.yardSection.name}
              </div>
            ) : null}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-base">{task.title}</span>
              {task.scheduledStart && task.scheduledEnd && (
                <DateBadge scheduledStart={task.scheduledStart} scheduledEnd={task.scheduledEnd} />
              )}
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
            {task.product && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
                <Package className="w-3.5 h-3.5 shrink-0 text-green-600" />
                <span className="font-medium">{task.product}</span>
                {task.applicationRate && <span className="text-gray-400">· {task.applicationRate}</span>}
                {task.productSearchQuery && (
                  <a
                    href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(task.productSearchQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Shop"
                    className="ml-auto shrink-0 text-gray-400 hover:text-green-600 transition-colors"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
            {task.spreaderSetting && (
              <p className="text-xs text-gray-500 mt-1">Spreader: {task.spreaderSetting}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverdueSection({
  tasks,
  onDoIt,
  onSkip,
}: {
  tasks: Task[];
  onDoIt: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {tasks.length} overdue task{tasks.length > 1 ? "s" : ""}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className="border-gray-200">
              <CardContent className="p-4">
                <div className="font-medium text-sm text-gray-700 mb-0.5">{task.title}</div>
                {task.overdueNote && (
                  <div className="text-xs text-gray-500 mb-3">{task.overdueNote}</div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-7 text-xs",
                      task.stillWorthDoing === false && "opacity-40"
                    )}
                    onClick={() => onDoIt(task.id)}
                  >
                    Do it
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-gray-500"
                    onClick={() => onSkip(task.id)}
                  >
                    Skip
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenanceSection({
  tasks,
  multiYard,
  onToggle,
}: {
  tasks: Task[];
  multiYard: boolean;
  onToggle: (id: string, current: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-green-700 flex items-center gap-1.5">
        <CalendarCheck className="w-3.5 h-3.5" />
        Keep it up
      </h3>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} multiYard={multiYard} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

export function TaskList({
  tasks: initial,
  multiYard = false,
  hiddenTaskCount,
}: {
  tasks: Task[];
  multiYard?: boolean;
  hiddenTaskCount?: number;
}) {
  const [tasks, setTasks] = useState(initial);
  const router = useRouter();

  async function patchTask(id: string, status: string) {
    const target = tasks.find((t) => t.id === id);
    const ids = target?.mergedIds ?? [id];
    const prev = target?.status ?? "pending";
    setTasks((t) => t.map((task) => (ids.includes(task.id) ? { ...task, status } : task)));
    try {
      await Promise.all(ids.map((tid) =>
        fetch(`/api/tasks/${tid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }).then((r) => { if (!r.ok) throw new Error("Failed"); })
      ));
      router.refresh();
    } catch {
      setTasks((t) => t.map((task) => (ids.includes(task.id) ? { ...task, status: prev } : task)));
    }
  }

  async function resetOverdue(id: string) {
    const prev = tasks.find((t) => t.id === id);
    if (!prev) return;
    // Optimistic update: clear stillWorthDoing so task moves back to pending groups
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, stillWorthDoing: null } : task)));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stillWorthDoing: null }),
      });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
    } catch {
      // Rollback
      setTasks((t) => t.map((task) => (task.id === id ? prev : task)));
    }
  }

  // Tasks stay in pending until the cron assesses them (sets stillWorthDoing).
  // A task with a past scheduledEnd but stillWorthDoing === null remains in pending, not overdue.
  const allPending = tasks.filter((t) => t.status === "pending" && t.stillWorthDoing === null);
  const maintenancePending = allPending.filter((t) => t.taskMode === "maintenance");
  const pending = allPending.filter((t) => t.taskMode !== "maintenance");
  const overdue = tasks.filter((t) => t.status === "pending" && t.stillWorthDoing !== null);
  const completed = tasks.filter((t) => t.status === "completed");

  // Group pending tasks by priority group, preserving order within group by scheduledStart
  const groups: Array<{ label: "Urgent" | "High" | "Routine"; tasks: Task[] }> = [];

  for (const groupLabel of ["Urgent", "High", "Routine"] as const) {
    const groupTasks = pending
      .filter((t) => (PRIORITY_GROUP[t.priority] ?? "Routine") === groupLabel)
      .sort((a, b) => {
        if (a.scheduledStart && b.scheduledStart) {
          return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
        }
        return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      });

    if (groupTasks.length > 0) {
      groups.push({ label: groupLabel, tasks: groupTasks });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(({ label, tasks: groupTasks }) => {
        const styles = GROUP_STYLES[label];
        return (
          <div key={label}>
            <h3 className={cn("text-xs font-semibold uppercase tracking-wide mb-2", styles.heading)}>
              {label}
            </h3>
            <div className="space-y-2">
              {groupTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  multiYard={multiYard}
                  onToggle={(id) => patchTask(id, "completed")}
                />
              ))}
            </div>
          </div>
        );
      })}

      <MaintenanceSection
        tasks={maintenancePending}
        multiYard={multiYard}
        onToggle={(id) => patchTask(id, "completed")}
      />

      {groups.length === 0 && maintenancePending.length === 0 && overdue.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 className="mx-auto w-10 h-10 mb-2 text-green-300" />
          <p className="text-sm">All caught up! Analyze your lawn for new tasks.</p>
        </div>
      )}

      <OverdueSection
        tasks={overdue}
        onDoIt={resetOverdue}
        onSkip={(id) => patchTask(id, "skipped")}
      />

      {completed.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-500 cursor-pointer font-medium">
            {completed.length} completed task{completed.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-2 mt-2">
            {completed.map((task) => (
              <Card key={task.id} className="opacity-60">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-base line-through text-gray-400">{task.title}</span>
                        <button
                          onClick={() => patchTask(task.id, "pending")}
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1 transition-colors shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed">{task.description}</p>
                      {task.product && (
                        <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-400">
                          <Package className="w-3.5 h-3.5 shrink-0" />
                          <span>{task.product}</span>
                          {task.applicationRate && (
                            <span className="text-gray-300">· {task.applicationRate}</span>
                          )}
                          {task.productSearchQuery && (
                            <a
                              href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(task.productSearchQuery)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Shop"
                              className="ml-auto shrink-0 text-gray-300 hover:text-green-600 transition-colors"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      )}
                      {task.spreaderSetting && (
                        <p className="text-xs text-gray-400 mt-1">Spreader: {task.spreaderSetting}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {(hiddenTaskCount ?? 0) > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            {hiddenTaskCount} more recommendation{hiddenTaskCount !== 1 ? "s" : ""} — upgrade to see them
          </p>
          {Array.from({ length: Math.min(hiddenTaskCount!, 3) }).map((_, i) => (
            <LockedTaskCard key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
