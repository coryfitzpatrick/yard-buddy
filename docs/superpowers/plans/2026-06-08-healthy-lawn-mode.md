# Healthy Lawn Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user's lawn scores ≥ 75, shift from corrective to maintenance framing — generate analysis tasks with the right tone, and offer an optional routine capture flow where the user describes their existing process, previews + edits a generated reminder list, and saves only what they approve. Routine text feeds back into all future analyses.

**Architecture:** Claude assigns `taskMode` values per task and adopts maintenance framing when it determines a healthy lawn. Routine capture is a separate, opt-in flow: three focused inputs → Claude generates a preview task list → user edits in place → confirm saves to DB. Nothing is written until the user approves. A `routineMode` flag signals Claude to generate maintenance-only tasks for the preview path.

**Tech Stack:** TypeScript, Prisma, PostgreSQL (Supabase), Anthropic Claude SDK, Next.js 15 App Router, shadcn/ui, React, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `types/index.ts` | Add `TaskMode` union type; add `taskMode` to `RecommendationItem` |
| Modify | `prisma/schema.prisma` | Add `taskMode String?` to `LawnTask`; add `currentRoutine String?` to `YardSection` |
| Modify | `lib/claude.ts` | Add `taskMode` + `routineMode` to `LawnContext`; add to both JSON schemas; add healthy-lawn + routine-mode system prompt rules |
| Modify | `lib/ai/analysis-prompt.ts` | Add healthy-lawn section; include `currentRoutine` in context |
| Modify | `lib/ai/__tests__/analysis-prompt.test.ts` | Add test: healthy lawn framing instruction appears in prompt |
| Modify | `app/api/analyze/route.ts` | Pass `taskMode` when creating tasks; pass `currentRoutine` to `LawnContext` |
| Create | `app/api/sections/[sectionId]/routine/preview/route.ts` | POST: takes `{ mowing, watering, fertilizer }`, calls Claude, returns task list (no DB write) |
| Create | `app/api/sections/[sectionId]/routine/confirm/route.ts` | POST: saves `currentRoutine` + creates confirmed tasks in one transaction |
| Create | `components/sections/RoutineCaptureCard.tsx` | 4-state card: form → loading → preview (editable) → saved |
| Modify | `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` | Show `RoutineCaptureCard` alongside tasks when healthScore ≥ 75 |
| Modify | `components/dashboard/TaskList.tsx` | Add `taskMode` to `Task` interface; split maintenance tasks into "Keep it up" visual bucket |

---

### Task 1: Add `taskMode` to types, schema, and task creation

**Files:**
- Modify: `types/index.ts`
- Modify: `prisma/schema.prisma`
- Modify: `app/api/analyze/route.ts`
- Modify: `lib/claude.ts`

- [ ] **Step 1: Add `TaskMode` type and update `RecommendationItem` in `types/index.ts`**

After `export type TaskPriority = "urgent" | "high" | "medium" | "low";` (line 40), add:

```typescript
export type TaskMode = "corrective" | "maintenance" | "improvement";
```

Replace the existing `RecommendationItem` interface with:

```typescript
export interface RecommendationItem {
  title: string;
  description: string;
  priority: TaskPriority;
  timing: string;
  scheduledStartDays: number;
  scheduledEndDays: number;
  weatherCondition: WeatherCondition;
  productSuggestion?: string;
  productSearchQuery?: string;
  estimatedPrice?: string;
  applicationRate?: string;
  spreaderSetting?: string;
  spreaderType?: SpreadType;
  taskMode?: TaskMode;
}
```

- [ ] **Step 2: Add `taskMode` to `LawnTask` in `prisma/schema.prisma`**

In the `LawnTask` model, after `spreaderSetting String?`:

```prisma
  taskMode         String?
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add_task_mode
```

Expected: migration file created in `prisma/migrations/`, Prisma client regenerated, no errors.

- [ ] **Step 4: Add `taskMode` to both Claude JSON schemas in `lib/claude.ts`**

In `generateRecommendations`, in the user message JSON schema block, add after `"spreaderType"`:

```
  "taskMode": "corrective" | "maintenance" | "improvement"
    (corrective = fixing a problem; maintenance = ongoing care; improvement = optional upgrade for a healthy lawn)
```

In `analyzeImages`, in the `recommendations` array schema in the user message, add the same field after `"spreaderType"`.

- [ ] **Step 5: Pass `taskMode` when creating tasks in `app/api/analyze/route.ts`**

In the `tasks.create` map block, add:

```typescript
taskMode: r.taskMode ?? null,
```

Full updated map:

```typescript
tasks: {
  create: result.recommendations.map((r) => ({
    yardSectionId: sectionId,
    title: r.title,
    description: r.description,
    priority: r.priority,
    product: r.productSuggestion,
    applicationRate: r.applicationRate,
    spreaderSetting: r.spreaderSetting,
    taskMode: r.taskMode ?? null,
    scheduledStart: typeof r.scheduledStartDays === "number"
      ? addDays(today, r.scheduledStartDays)
      : null,
    scheduledEnd: typeof r.scheduledEndDays === "number"
      ? addDays(today, r.scheduledEndDays)
      : null,
    weatherCondition: r.weatherCondition ?? null,
  })),
},
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add types/index.ts prisma/schema.prisma prisma/migrations/ lib/claude.ts app/api/analyze/route.ts
git commit -m "feat: add taskMode field to LawnTask, RecommendationItem, and Claude JSON schema"
```

---

### Task 2: Update Claude prompts for healthy lawn mode

Claude determines health score in the same response as recommendations — we can't set a mode before calling. Instead we instruct it via system prompt to assign `taskMode` values appropriately and adopt a maintenance tone when it assesses a healthy lawn.

**Files:**
- Modify: `lib/claude.ts`
- Modify: `lib/ai/analysis-prompt.ts`
- Modify: `lib/ai/__tests__/analysis-prompt.test.ts`

- [ ] **Step 1: Add healthy-lawn and routine-mode rules to `SYSTEM_PROMPT` in `lib/claude.ts`**

After the `TASK SEQUENCING RULES` block (before the closing backtick of the template literal), append:

```
HEALTHY LAWN MODE — Apply when your analysis determines healthScore ≥ 75:
- Open your summary by acknowledging what the homeowner is doing right.
- Do NOT suggest changing their core routine unless you observe a specific problem.
- Assign taskMode "maintenance" to tasks that reinforce good ongoing habits (mowing cadence, watering schedule, seasonal fertilization windows, pre-emergent timing).
- Assign taskMode "improvement" to optional enhancements (overseeding for density, topdressing, color).
- Reserve taskMode "corrective" only for actual problems visible in the image or data.
- Aim for 2–4 total tasks — fewer focused tasks beats a long list for a healthy lawn.
- Phrase maintenance tasks positively: "Continue your..." / "Keep up your..." / "Maintain your..." framing.

ROUTINE REMINDER MODE — Apply when the prompt includes "ROUTINE REMINDER MODE":
- Generate maintenance-only reminder tasks based on the homeowner's stated routine.
- Set taskMode to "maintenance" for every task.
- Do not generate corrective tasks — the lawn is healthy and the goal is a personalized reminder schedule.
- Phrase tasks as confirmations of what they're already doing: "Continue mowing at X", "Maintain watering on Y schedule".

For all other lawns (healthScore < 75), assign taskMode "corrective" to problem-fixing tasks and "maintenance" to any routine upkeep tasks included alongside corrections.
```

- [ ] **Step 2: Add `currentRoutine` and `routineMode` to `LawnContext` in `lib/claude.ts`**

Add to the `LawnContext` interface after `notes`:

```typescript
currentRoutine?: string | null;
routineMode?: boolean;
```

In the `generateRecommendations` user message, after the notes line, add:

```typescript
${context.currentRoutine ? `Homeowner's Current Routine:\n${context.currentRoutine.slice(0, 500)}` : ""}
${context.routineMode ? "\nROUTINE REMINDER MODE: Generate maintenance-only reminder tasks based on the routine above." : ""}
```

In the `analyzeImages` user message text block, after the notes line, add:

```typescript
${context.currentRoutine ? `- Current Routine: ${context.currentRoutine.slice(0, 500)}` : ""}
```

- [ ] **Step 3: Add healthy-lawn rules and `currentRoutine` to `buildSectionAnalysisPrompt` in `lib/ai/analysis-prompt.ts`**

First, read the file to understand its current structure:

```bash
cat -n /Users/cory/Projects/yard-buddy/lib/ai/analysis-prompt.ts
```

Add `currentRoutine?: string | null` to the `SectionInput` type after `streetAddress`.

In the user message template, after `streetAddress`, add:

```typescript
${section.currentRoutine ? `Current Routine: ${section.currentRoutine.slice(0, 500)}\n` : ""}
```

After the existing sequencing/deduplication rules in the returned `systemPrompt` string, append:

```
HEALTHY LAWN MODE — Apply when your analysis determines healthScore ≥ 75:
- Open your summary by acknowledging what the homeowner is doing right.
- Do NOT suggest changing their core routine unless you observe a specific problem.
- Assign taskMode "maintenance" to tasks reinforcing good habits.
- Assign taskMode "improvement" to optional enhancements for an already-healthy lawn.
- Reserve taskMode "corrective" only for actual problems you can see.
- Aim for 2–4 total tasks. Fewer focused tasks beats a long list for a healthy lawn.
- Phrase maintenance tasks positively: "Continue your..." / "Maintain your..." framing.
```

- [ ] **Step 4: Write failing test**

Add to `lib/ai/__tests__/analysis-prompt.test.ts`:

```typescript
it("includes healthy lawn mode instructions", () => {
  const { systemPrompt } = buildSectionAnalysisPrompt({
    section: {
      name: "Front Yard",
      grassType: "bermuda",
      soilPh: null,
      nitrogenPpm: null,
      phosphorusPpm: null,
      potassiumPpm: null,
      soilTestSource: null,
      sunExposure: null,
      squareFootage: null,
      streetAddress: null,
      currentRoutine: null,
    },
    weather: {
      temp: 75,
      humidity: 50,
      condition: "Clear",
      recentRainfall: 0,
      forecast: [],
    },
  });
  expect(systemPrompt).toContain("HEALTHY LAWN MODE");
  expect(systemPrompt).toContain("taskMode");
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
npx vitest run lib/ai/__tests__/analysis-prompt.test.ts
```

Expected: FAIL — "HEALTHY LAWN MODE" not found.

- [ ] **Step 6: Implement prompt changes (per Steps 3 above), then run tests**

```bash
npx vitest run lib/ai/__tests__/analysis-prompt.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Pass `currentRoutine` in `app/api/analyze/route.ts`**

Add to the `LawnContext` object passed to `analyzeImages`:

```typescript
currentRoutine: section.currentRoutine,
```

- [ ] **Step 8: Commit**

```bash
git add lib/claude.ts lib/ai/analysis-prompt.ts lib/ai/__tests__/analysis-prompt.test.ts app/api/analyze/route.ts
git commit -m "feat: healthy lawn mode — Claude adopts maintenance framing when healthScore >= 75"
```

---

### Task 3: Routine capture schema and API endpoints

Two endpoints handle the two-step flow: `preview` calls Claude and returns a task list without writing to DB; `confirm` saves the routine text and creates the approved (possibly edited) tasks.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `app/api/sections/[sectionId]/routine/preview/route.ts`
- Create: `app/api/sections/[sectionId]/routine/confirm/route.ts`

- [ ] **Step 1: Add `currentRoutine` to `YardSection` in `prisma/schema.prisma`**

After `notes String?`:

```prisma
  currentRoutine    String?
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_section_routine
```

Expected: migration created, client regenerated, no errors.

- [ ] **Step 3: Create the preview endpoint**

Create `app/api/sections/[sectionId]/routine/preview/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const { mowing, watering, fertilizer } = await req.json();

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true, spreaderType: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const routineParts = [
    mowing ? `Mowing: ${mowing}` : null,
    watering ? `Watering: ${watering}` : null,
    fertilizer ? `Fertilizer & treatments: ${fertilizer}` : null,
  ].filter(Boolean);
  const currentRoutine = routineParts.length > 0 ? routineParts.join("\n") : null;

  let weatherSummary: string | undefined;
  let forecastText: string | undefined;
  try {
    const weather = await Promise.race([
      getWeatherByZip(section.yard.zipCode),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity`;
    forecastText = formatForecastForClaude(weather.forecast);
  } catch { /* weather is optional */ }

  const tasks = await generateRecommendations({
    grassType: section.grassType as import("@/types").GrassType,
    zipCode: section.yard.zipCode,
    areaType: section.areaType,
    yardSizeSqft: section.yardSizeSqft,
    spreaderType: section.yard.spreaderType,
    soilPh: section.soilPh,
    nitrogenPpm: section.nitrogenPpm,
    phosphorusPpm: section.phosphorusPpm,
    potassiumPpm: section.potassiumPpm,
    soilTestSource: section.soilTestSource,
    soilMoisture: section.soilMoisture ?? undefined,
    weatherSummary,
    forecastText,
    notes: section.notes,
    currentRoutine,
    routineMode: true,
  });

  return NextResponse.json({ tasks });
}
```

- [ ] **Step 4: Create the confirm endpoint**

Create `app/api/sections/[sectionId]/routine/confirm/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

interface ConfirmedTask {
  title: string;
  description: string;
  priority: string;
  scheduledStartDays: number;
  scheduledEndDays: number;
  weatherCondition: string;
  product?: string;
  applicationRate?: string;
  spreaderSetting?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const { routine, tasks }: { routine: string | null; tasks: ConfirmedTask[] } = await req.json();

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = new Date();

  await db.$transaction([
    db.yardSection.update({
      where: { id: sectionId },
      data: { currentRoutine: routine ?? null },
    }),
    ...tasks.map((t) =>
      db.lawnTask.create({
        data: {
          yardSectionId: sectionId,
          title: t.title,
          description: t.description,
          priority: t.priority,
          product: t.product ?? null,
          applicationRate: t.applicationRate ?? null,
          spreaderSetting: t.spreaderSetting ?? null,
          taskMode: "maintenance",
          scheduledStart: typeof t.scheduledStartDays === "number"
            ? addDays(today, t.scheduledStartDays)
            : null,
          scheduledEnd: typeof t.scheduledEndDays === "number"
            ? addDays(today, t.scheduledEndDays)
            : null,
          weatherCondition: t.weatherCondition ?? null,
        },
      })
    ),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ "app/api/sections/"
git commit -m "feat: routine capture API — preview (Claude) and confirm (save to DB) endpoints"
```

---

### Task 4: RoutineCaptureCard component

Four-state card shown alongside the task list when `healthScore ≥ 75`. The card is optional and additive — it appears below the generated tasks, not instead of them.

States: `form` → `loading` → `preview` → `saved`.

**Files:**
- Create: `components/sections/RoutineCaptureCard.tsx`
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`

- [ ] **Step 1: Create `components/sections/RoutineCaptureCard.tsx`**

```typescript
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
              Tell us what you're already doing and we'll turn it into a reminder schedule.
              Fill in what you know —{" "}
              <strong>we'll use best practices for {grassLabel} for anything you leave blank.</strong>
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
                You'll see and edit the tasks before anything is saved.
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
              Here's what we'll add to your task list. Edit or remove anything that doesn't fit.
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
```

- [ ] **Step 2: Show `RoutineCaptureCard` on the section detail page**

Read the current section page to find the right location:

```bash
cat -n "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
```

The card should render after the analysis result card but alongside the task list — it's supplementary, not a replacement.

Add the import at the top of the page file:

```typescript
import { RoutineCaptureCard } from "@/components/sections/RoutineCaptureCard";
```

Where `latestAnalysis` is used, add after the existing analysis/task content:

```typescript
{latestAnalysis && latestAnalysis.healthScore >= 75 && (
  <RoutineCaptureCard
    sectionId={section.id}
    grassType={section.grassType}
    initialRoutine={section.currentRoutine}
  />
)}
```

The section query must return `currentRoutine`. If the query uses a `select` block, add `currentRoutine: true`. If it uses `include` or `findFirst` without select, all fields are returned automatically.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/sections/RoutineCaptureCard.tsx "app/(dashboard)/yard/"
git commit -m "feat: RoutineCaptureCard — 4-state routine capture with editable preview before saving"
```

---

### Task 5: UI visual differentiation for maintenance tasks

Show `maintenance` tasks in a separate "Keep it up" section with a CalendarCheck icon. Corrective and improvement tasks stay in the existing priority-based groups.

**Files:**
- Modify: `components/dashboard/TaskList.tsx`

- [ ] **Step 1: Add `taskMode` to the `Task` interface**

After `spreaderSetting: string | null`:

```typescript
  taskMode: string | null;
```

- [ ] **Step 2: Add `CalendarCheck` to the lucide-react import**

```typescript
import {
  CheckCircle2,
  Circle,
  Package,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  CalendarCheck,
} from "lucide-react";
```

- [ ] **Step 3: Split pending tasks by taskMode**

Replace:

```typescript
const pending = tasks.filter((t) => t.status === "pending" && t.stillWorthDoing === null);
```

With:

```typescript
const allPending = tasks.filter((t) => t.status === "pending" && t.stillWorthDoing === null);
const maintenancePending = allPending.filter((t) => t.taskMode === "maintenance");
const pending = allPending.filter((t) => t.taskMode !== "maintenance");
```

- [ ] **Step 4: Add `MaintenanceSection` component after `OverdueSection`**

```typescript
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
```

- [ ] **Step 5: Render `MaintenanceSection` and update empty state**

In the `TaskList` return, after `groups.map(...)`, add:

```typescript
<MaintenanceSection
  tasks={maintenancePending}
  multiYard={multiYard}
  onToggle={(id) => patchTask(id, "completed")}
/>
```

Update the empty state condition:

```typescript
{groups.length === 0 && maintenancePending.length === 0 && overdue.length === 0 && (
  <div className="text-center py-8 text-gray-400">
    <CheckCircle2 className="mx-auto w-10 h-10 mb-2 text-green-300" />
    <p className="text-sm">All caught up! Analyze your lawn for new tasks.</p>
  </div>
)}
```

- [ ] **Step 6: Update Prisma queries that feed `TaskList` to include `taskMode`**

Find all pages that pass tasks to `TaskList`:

```bash
grep -rn "TaskList" /Users/cory/Projects/yard-buddy/app --include="*.tsx"
```

For each page found, if its Prisma query uses an explicit `select` block, add `taskMode: true`. If it uses `findMany` / `findFirst` without select, `taskMode` is included automatically.

- [ ] **Step 7: Verify TypeScript compiles and all tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: no errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/TaskList.tsx
git commit -m "ux: maintenance tasks shown in 'Keep it up' section with calendar icon"
```

---

## Self-Review

**Spec coverage:**
- ✅ Don't ruin a good thing → healthy lawn mode prompt rules; maintenance framing when healthScore ≥ 75 (Task 2)
- ✅ Tips to improve → `improvement` taskMode tasks still generated alongside `maintenance` (Task 1 + 2)
- ✅ Reminders for current process → routine capture generates personalized maintenance tasks (Task 3 + 4)
- ✅ Routine capture is optional → card is supplementary to generated task list, not a gate (Task 4)
- ✅ Three structured inputs → mowing / watering / fertilizer fields with tight example placeholders (Task 4)
- ✅ "Fill in what you know" copy + best-practice fallback explained in card (Task 4)
- ✅ Preview before saving → form → loading → editable preview → confirm (Task 3 + 4)
- ✅ Inline edit and remove in preview → `TaskPreviewCard` with Pencil/X buttons (Task 4)
- ✅ Nothing hits DB until user confirms (Task 3 confirm endpoint, Task 4 card flow)
- ✅ `currentRoutine` feeds future analyses (Task 2 LawnContext + Task 3 analyze route)
- ✅ `taskMode` persisted to DB from both analyze route and confirm endpoint (Task 1 + 3)
- ✅ "Keep it up" visual bucket in task list (Task 5)

**Type consistency:**
- `TaskMode` in `types/index.ts`, optional on `RecommendationItem`, nullable `String?` in Prisma
- `EditableTask extends RecommendationItem` — all fields flow from Claude response to preview to confirm
- `ConfirmedTask` in confirm endpoint matches the `EditableTask` shape (minus `clientId` which is client-only)
- `Task.taskMode: string | null` in `TaskList` matches Prisma field type

**Partial input behavior is communicated:** Card copy explicitly says best practices fill in any blanks. Confirm endpoint accepts null routine (all blanks) gracefully.
