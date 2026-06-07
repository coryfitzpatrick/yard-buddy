"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Circle, Package, RotateCcw } from "lucide-react";

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

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-green-400",
};

export function TaskList({
  tasks: initial,
  multiYard = false,
}: {
  tasks: Task[];
  multiYard?: boolean;
}) {
  const [tasks, setTasks] = useState(initial);

  async function toggleTask(id: string, current: string) {
    const newStatus = current === "completed" ? "pending" : "completed";
    setTasks((t) => t.map((task) => task.id === id ? { ...task, status: newStatus } : task));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setTasks((t) => t.map((task) => task.id === id ? { ...task, status: current } : task));
    }
  }

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-3">
      {pending.map((task) => (
        <Card key={task.id} className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <button onClick={() => toggleTask(task.id, task.status)} className="mt-0.5 shrink-0">
                <Circle className="w-5 h-5 text-gray-300 hover:text-green-500 transition-colors" />
              </button>
              <div className="flex-1 min-w-0">
                {multiYard && task.yardSection && (
                  <div className="text-xs text-green-700 font-medium mb-1">
                    {task.yardSection.yard.name === task.yardSection.name
                      ? task.yardSection.name
                      : `${task.yardSection.yard.name} › ${task.yardSection.name}`}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-gray-400"}`} />
                  <span className="font-medium text-base">{task.title}</span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
                {task.product && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <Package className="w-3 h-3" />
                    <span>{task.product}</span>
                    {task.applicationRate && <span>· {task.applicationRate}</span>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {pending.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 className="mx-auto w-10 h-10 mb-2 text-green-300" />
          <p className="text-sm">All caught up! Analyze your lawn for new tasks.</p>
        </div>
      )}
      {completed.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-500 cursor-pointer font-medium">
            {completed.length} completed task{completed.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-2 mt-2">
            {completed.map((task) => (
              <Card key={task.id} className="opacity-60">
                <CardContent className="p-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  <span className="text-sm line-through text-gray-400 flex-1">{task.title}</span>
                  <button
                    onClick={() => toggleTask(task.id, task.status)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                    title="Mark as not done"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
