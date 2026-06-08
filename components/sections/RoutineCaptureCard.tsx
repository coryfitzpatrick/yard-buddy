"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarCheck, CheckCircle2, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import type { RecommendationItem } from "@/types";

type CardState = "form" | "loading" | "preview" | "saved";

interface EditableTask extends RecommendationItem {
  clientId: string;
}

interface Props {
  sectionId: string;
  grassType: string;
  initialRoutine: string | null;
}

function formatWindow(startDays: number, endDays: number): string {
  const fmt = (days: number) => {
    if (days === 0) return "Today";
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return startDays === endDays ? fmt(startDays) : `${fmt(startDays)} – ${fmt(endDays)}`;
}

function TaskPreviewCard({
  task,
  onRemove,
  onEdit,
}: {
  task: EditableTask;
  onRemove: () => void;
  onEdit: (title: string, description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);

  function commit() {
    onEdit(title.trim() || task.title, description.trim() || task.description);
    setEditing(false);
  }

  return (
    <Card className="border-green-100 bg-white">
      <CardContent className="p-3">
        {editing ? (
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm font-medium h-8"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm border rounded-md px-3 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs bg-green-700 hover:bg-green-800 text-white" onClick={commit}>
                Done
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-sm font-medium">{task.title}</span>
                <span className="text-xs text-gray-400">
                  {formatWindow(task.scheduledStartDays, task.scheduledEndDays)}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
            </div>
            <div className="flex gap-1 shrink-0 mt-0.5">
              <button
                onClick={() => setEditing(true)}
                className="text-gray-300 hover:text-blue-500 transition-colors"
                aria-label="Edit task"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onRemove}
                className="text-gray-300 hover:text-red-400 transition-colors"
                aria-label="Remove task"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RoutineCaptureCard({ sectionId, grassType, initialRoutine }: Props) {
  const [open, setOpen] = useState(!initialRoutine);
  const [state, setState] = useState<CardState>(initialRoutine ? "saved" : "form");
  const [mowing, setMowing] = useState("");
  const [watering, setWatering] = useState("");
  const [fertilizer, setFertilizer] = useState("");
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  const grassLabel = grassType.replace(/_/g, " ");

  async function preview() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/routine/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mowing: mowing.trim(),
          watering: watering.trim(),
          fertilizer: fertilizer.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTasks(
        (data.tasks as RecommendationItem[]).map((t, i) => ({ ...t, clientId: `preview-${i}` }))
      );
      setState("preview");
    } catch {
      setError("Something went wrong generating reminders. Please try again.");
      setState("form");
    }
  }

  async function confirm() {
    setState("loading");
    setError(null);
    try {
      const routine = [
        mowing.trim() ? `Mowing: ${mowing.trim()}` : null,
        watering.trim() ? `Watering: ${watering.trim()}` : null,
        fertilizer.trim() ? `Fertilizer & treatments: ${fertilizer.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n") || null;

      const res = await fetch(`/api/sections/${sectionId}/routine/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routine, tasks }),
      });
      if (!res.ok) throw new Error("Failed");
      setState("saved");
      setOpen(false);
    } catch {
      setError("Could not save. Please try again.");
      setState("preview");
    }
  }

  function removeTask(clientId: string) {
    setTasks((prev) => prev.filter((t) => t.clientId !== clientId));
  }

  function editTask(clientId: string, title: string, description: string) {
    setTasks((prev) =>
      prev.map((t) => (t.clientId === clientId ? { ...t, title, description } : t))
    );
  }

  return (
    <Card className="border-green-200 bg-green-50">
      <CardContent className="p-4">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-sm font-medium text-green-800">
              {state === "saved" ? "Routine saved — reminders set" : "Personalize your reminders"}
            </span>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-green-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-green-600" />
          )}
        </button>

        {open && state === "form" && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-green-700">
              Tell us what you&apos;re already doing and we&apos;ll turn it into a reminder
              schedule. Fill in what you know —{" "}
              <strong>we&apos;ll use best practices for {grassLabel} for anything you leave blank.</strong>
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium text-green-800 mb-1 block">Mowing</Label>
                <Input
                  value={mowing}
                  onChange={(e) => setMowing(e.target.value)}
                  placeholder="e.g. Weekly at 3.5 inches"
                  className="text-sm bg-white border-green-200 h-8"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-green-800 mb-1 block">Watering</Label>
                <Input
                  value={watering}
                  onChange={(e) => setWatering(e.target.value)}
                  placeholder="e.g. Tue/Thu/Sat mornings, 20 min per zone"
                  className="text-sm bg-white border-green-200 h-8"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-green-800 mb-1 block">
                  Fertilizer &amp; treatments
                </Label>
                <Input
                  value={fertilizer}
                  onChange={(e) => setFertilizer(e.target.value)}
                  placeholder="e.g. Scotts Turf Builder in April, pre-emergent in March"
                  className="text-sm bg-white border-green-200 h-8"
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="space-y-1">
              <Button
                size="sm"
                onClick={preview}
                className="bg-green-700 hover:bg-green-800 text-white"
              >
                Preview reminders
              </Button>
              <p className="text-xs text-green-600">
                You&apos;ll see and edit the tasks before anything is saved.
              </p>
            </div>
          </div>
        )}

        {open && state === "loading" && (
          <p className="mt-4 text-sm text-green-700 animate-pulse">Generating your reminders...</p>
        )}

        {open && state === "preview" && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-green-700 font-medium">
              Here&apos;s what we&apos;ll add to your task list. Edit or remove anything that doesn&apos;t fit.
            </p>
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskPreviewCard
                  key={task.clientId}
                  task={task}
                  onRemove={() => removeTask(task.clientId)}
                  onEdit={(title, description) => editTask(task.clientId, title, description)}
                />
              ))}
              {tasks.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  All tasks removed —{" "}
                  <button className="underline" onClick={() => setState("form")}>
                    go back to adjust your inputs
                  </button>
                  .
                </p>
              )}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={confirm}
                disabled={tasks.length === 0}
                className="bg-green-700 hover:bg-green-800 text-white"
              >
                Save these reminders
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-green-700"
                onClick={() => setState("form")}
              >
                Go back
              </Button>
            </div>
          </div>
        )}

        {open && state === "saved" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-green-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Your routine is saved. Future analyses will build around it.</span>
            <button
              className="underline ml-auto shrink-0"
              onClick={() => {
                setState("form");
                setOpen(true);
              }}
            >
              Edit
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
