# Dashboard & Setup UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the UUID display bug on the Analyze page, add section-level task filtering to the dashboard, allow adding multiple sections during yard setup, and polish the UX across the app.

**Architecture:** Four independent tasks touching the analyze page (replace broken Radix selects with card chips), the dashboard (add a new client `DashboardTaskSection` component with tab filtering), the setup form (add a "success + add another" step), and general label/polish fixes. No schema changes needed.

**Tech Stack:** Next.js 16 App Router, React Hook Form, Tailwind CSS v4, shadcn/ui, lucide-react, `useSearchParams` for analyze deep-link.

---

## File Map

| File | Change |
|---|---|
| `app/(dashboard)/analyze/page.tsx` | Full rewrite — chip picker + URL param pre-select |
| `components/dashboard/DashboardTaskSection.tsx` | **New** — client component with section tab filtering |
| `app/(dashboard)/dashboard/page.tsx` | Pass section list to `DashboardTaskSection` |
| `components/dashboard/TaskList.tsx` | Fix "Yard › Yard" duplicate label |
| `components/yard/YardSetupForm.tsx` | Add success step + "add another section" flow |

---

### Task 1: Fix Analyze page — section chip picker (kills UUID bug)

**Root cause:** Radix UI's `Select` renders in a portal and doesn't reliably display the label when `value` is set asynchronously after first mount. The section chips approach avoids Radix entirely.

**New UX:** Section cards in a grid, pre-selected via `?sectionId=` URL param (so the camera icon on the dashboard deep-links correctly), with yard name shown only when multiple yards exist.

**Files:**
- Modify: `app/(dashboard)/analyze/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import { AnalysisResults } from "@/components/analysis/AnalysisResults";
import type { AnalysisResult, AreaType } from "@/types";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";

interface YardSection { id: string; name: string; areaType: string | null; grassType: string; }
interface Yard { id: string; name: string; zipCode: string; sections: YardSection[]; }

interface SectionOption {
  sectionId: string;
  sectionName: string;
  grassType: string;
  areaType: string | null;
  yardName: string;
}

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    fetch("/api/yard")
      .then((r) => r.json())
      .then((data: Yard[]) => {
        if (!Array.isArray(data)) return;
        setYards(data);
        const allSections = data.flatMap((y) => y.sections);
        const preselect = searchParams.get("sectionId");
        if (preselect && allSections.some((s) => s.id === preselect)) {
          setSelectedSectionId(preselect);
        } else if (allSections.length > 0) {
          setSelectedSectionId(allSections[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchParams]);

  const multiYard = yards.length > 1;
  const allOptions: SectionOption[] = yards.flatMap((y) =>
    y.sections.map((s) => ({
      sectionId: s.id,
      sectionName: s.name,
      grassType: s.grassType,
      areaType: s.areaType,
      yardName: y.name,
    }))
  );

  async function handleUploaded(urls: string[]) {
    if (!selectedSectionId) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: selectedSectionId, imageUrls: urls }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setResult(data.result);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <h1 className="text-3xl font-bold text-green-700 mb-1">Analyze Your Lawn</h1>
      <p className="text-gray-500 mb-6">Upload photos and get AI-powered diagnosis and recommendations.</p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading your yards…</span>
        </div>
      ) : allOptions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>Set up a yard first before analyzing.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Which section are you photographing?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {allOptions.map((opt) => {
                const areaCfg = opt.areaType ? AREA_CONFIG[opt.areaType as AreaType] : null;
                const Icon = areaCfg?.icon;
                const selected = selectedSectionId === opt.sectionId;
                return (
                  <button
                    key={opt.sectionId}
                    onClick={() => { setSelectedSectionId(opt.sectionId); setResult(null); }}
                    className={cn(
                      "flex flex-col items-start rounded-lg border-2 px-3 py-2.5 text-left transition-all",
                      selected
                        ? "border-green-600 bg-green-50"
                        : "border-gray-200 bg-white hover:border-green-400"
                    )}
                  >
                    {multiYard && (
                      <span className="text-xs text-gray-400 mb-0.5">{opt.yardName}</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {Icon && (
                        <Icon className={cn("w-3.5 h-3.5 shrink-0", selected ? "text-green-700" : "text-gray-400")} />
                      )}
                      <span className={cn("font-medium text-sm", selected ? "text-green-900" : "text-gray-800")}>
                        {opt.sectionName}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 capitalize mt-0.5">
                      {opt.grassType.replace(/_/g, " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedSectionId && <PhotoUpload onUploaded={handleUploaded} />}

          {analyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              <span>Analyzing… this takes about 10 seconds</span>
            </div>
          )}
          {result && <div className="mt-6"><AnalysisResults result={result} /></div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d= -f2-)" npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/analyze/page.tsx
git commit -m "fix: replace broken Radix selects with section chip picker on analyze page"
```

---

### Task 2: Dashboard — filterable task list with section tabs

**New component:** `DashboardTaskSection` is a client component that receives all tasks + a flat section list. It renders pill tabs (All | Section Name ...) and filters the task list to match. The dashboard page becomes a thin server component that just fetches and passes data.

**Files:**
- Create: `components/dashboard/DashboardTaskSection.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create `components/dashboard/DashboardTaskSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaskList } from "./TaskList";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskSection {
  id: string;
  name: string;
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
  tasks: Task[];
  sections: TaskSection[];
}

export function DashboardTaskSection({ tasks, sections }: Props) {
  const [activeSection, setActiveSection] = useState<"all" | string>("all");

  const filteredTasks =
    activeSection === "all"
      ? tasks
      : tasks.filter((t) => t.yardSection?.id === activeSection);

  const multiYard = sections.some((s) => s.showYardLabel);

  return (
    <div>
      {sections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
          <button
            onClick={() => setActiveSection("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
              activeSection === "all"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            All
          </button>
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors whitespace-nowrap",
                activeSection === sec.id
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {sec.showYardLabel ? `${sec.yardName}: ${sec.name}` : sec.name}
            </button>
          ))}
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500 mb-3">No tasks yet. Analyze a section to get started.</p>
            <Link href="/analyze">
              <Button className="bg-green-600 hover:bg-green-700">
                <Camera className="mr-2 w-4 h-4" /> Analyze My Lawn
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <TaskList
          tasks={filteredTasks}
          multiYard={multiYard && activeSection === "all"}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(dashboard)/dashboard/page.tsx`**

Replace the imports at the top — add `DashboardTaskSection`, remove the inline Card/Button empty-state:

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { DashboardTaskSection } from "@/components/dashboard/DashboardTaskSection";
import { YardOverviewCard } from "@/components/dashboard/YardOverviewCard";
import { Plus } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
          tasks: { select: { status: true } },
        },
      },
    },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const sectionIds = yards.flatMap((y) => y.sections.map((s) => s.id));

  const tasks = await db.lawnTask.findMany({
    where: { yardSectionId: { in: sectionIds } },
    orderBy: { createdAt: "desc" },
    include: {
      yardSection: {
        select: { id: true, name: true, areaType: true, yard: { select: { name: true } } },
      },
    },
  });

  const yardSummaries = yards.map((yard) => ({
    id: yard.id,
    name: yard.name,
    zipCode: yard.zipCode,
    sections: yard.sections.map((s) => ({
      id: s.id,
      name: s.name,
      areaType: s.areaType,
      grassType: s.grassType,
      latestHealthScore: s.analyses[0]?.healthScore ?? null,
      pendingTaskCount: s.tasks.filter((t) => t.status !== "completed").length,
    })),
  }));

  const allSections = yards.flatMap((y) =>
    y.sections.map((s) => ({
      id: s.id,
      name: s.name,
      yardName: y.name,
      showYardLabel: yards.length > 1,
    }))
  );

  const primaryZip = yards[0].zipCode;

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {session.user.name?.split(" ")[0]}!
        </h1>
        <Link href="/yard/setup">
          <Button size="sm" className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Yard
          </Button>
        </Link>
      </div>

      <WeatherWidget zip={primaryZip} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">My Yards</h2>
          <Link href="/yard" className="text-sm text-green-700 hover:underline">Manage →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {yardSummaries.map((yard) => <YardOverviewCard key={yard.id} yard={yard} />)}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">Tasks</h2>
        <DashboardTaskSection tasks={tasks} sections={allSections} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d= -f2-)" npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/DashboardTaskSection.tsx app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: dashboard task filtering with section tabs"
```

---

### Task 3: Fix "Yard › Yard" duplicate label in TaskList

When yard.name === section.name (a common case after migration), the label "My Yard › My Yard" is shown. Fix: only show the section name when they are the same; otherwise show "Yard › Section".

**Files:**
- Modify: `components/dashboard/TaskList.tsx`

- [ ] **Step 1: Update the section label in the pending task render**

Find this block in `TaskList.tsx`:
```tsx
{multiYard && task.yardSection && (
  <div className="text-xs text-green-700 font-medium mb-1">
    {task.yardSection.yard.name} › {task.yardSection.name}
  </div>
)}
```

Replace with:
```tsx
{multiYard && task.yardSection && (
  <div className="text-xs text-green-700 font-medium mb-1">
    {task.yardSection.yard.name === task.yardSection.name
      ? task.yardSection.name
      : `${task.yardSection.yard.name} › ${task.yardSection.name}`}
  </div>
)}
```

- [ ] **Step 2: TypeScript check**

```bash
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d= -f2-)" npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/TaskList.tsx
git commit -m "fix: skip redundant yard name in task label when yard and section share a name"
```

---

### Task 4: Yard setup — add another section after completion

After completing the setup wizard (Step 4 → submit), instead of immediately navigating to the dashboard, show a "Done" state with two options:
1. **Add Another Section** → resets section fields, keeps the created `yardId`, goes back to Step 1 (Area Type)
2. **Go to Dashboard** → navigates to `/dashboard`

The setup form tracks `createdYardId` and `createdPropertyName` in state. On "Add Another Section", `reset()` clears the react-hook-form fields and the step jumps to 1, skipping Step 0.

**Files:**
- Modify: `components/yard/YardSetupForm.tsx`

- [ ] **Step 1: Add success state variables near the top of `YardSetupForm`**

After the existing `const [error, setError]` line, add:
```tsx
const [createdYardId, setCreatedYardId] = useState<string | null>(null);
const [createdPropertyName, setCreatedPropertyName] = useState<string>("");
const [showSuccess, setShowSuccess] = useState(false);
```

Also import `Plus` and `CheckCircle2` from lucide-react alongside the existing imports:
```tsx
import { Camera, CheckCircle, CheckCircle2, Loader2, Plus, Search } from "lucide-react";
```

- [ ] **Step 2: Update `onSubmit` to set success state instead of navigating**

Replace the entire `async function onSubmit(sectionData: YardSectionInput)` with:

```tsx
async function onSubmit(sectionData: YardSectionInput) {
  setError(null);

  let yardId = createdYardId;

  if (!yardId) {
    // First section — create the yard first
    if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); setStep(0); return; }
    try {
      const yardRes = await fetch("/api/yard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: propertyName, zipCode }),
      });
      if (!yardRes.ok) { setError("Failed to save property. Please try again."); return; }
      const yard = await yardRes.json();
      yardId = yard.id;
      setCreatedYardId(yard.id);
      setCreatedPropertyName(propertyName);
    } catch {
      setError("Network error. Please check your connection.");
      return;
    }
  }

  try {
    const sectionRes = await fetch(`/api/yard/${yardId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sectionData),
    });
    if (!sectionRes.ok) { setError("Failed to save section. Please try again."); return; }
    setShowSuccess(true);
  } catch {
    setError("Network error. Please check your connection.");
  }
}
```

- [ ] **Step 3: Add `handleAddAnotherSection` function**

After `onSubmit`, add:

```tsx
function handleAddAnotherSection() {
  reset({ name: "Front Yard", grassType: "unknown" });
  setSizeDisplay("");
  setStreetAddress("");
  setLookupNote(null);
  setIdentified(null);
  setIdentifyError(null);
  setHighlightUpload(false);
  setShowSuccess(false);
  setStep(1);
}
```

- [ ] **Step 4: Add the import for `useRouter` to destructure `push`**

The form already imports `useRouter`. Also import `reset` from the existing `useForm` destructure — update the destructure line:

```tsx
const { handleSubmit, watch, setValue, register, reset, trigger, formState: { errors, isSubmitting } } =
  useForm<YardSectionFormInput, unknown, YardSectionInput>({
    resolver: zodResolver(yardSectionSchema),
    defaultValues: { name: "Front Yard", grassType: "unknown" },
  });
```

- [ ] **Step 5: Add the success screen to the form JSX**

In the returned JSX, before the `<div className="flex justify-between mt-8">` navigation row, add a conditional that shows the success screen when `showSuccess` is true and wraps the rest in `{!showSuccess && ...}`.

Replace the entire `return (...)` block with:

```tsx
return (
  <div className="max-w-2xl mx-auto">
    {showSuccess ? (
      <div className="text-center space-y-6 py-8">
        <CheckCircle2 className="mx-auto w-16 h-16 text-green-500" />
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Section added!</h3>
          <p className="text-gray-500 mt-1">
            <span className="font-medium">{createdPropertyName}</span> is set up with your new section.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" onClick={handleAddAnotherSection}>
            <Plus className="w-4 h-4 mr-2" /> Add Another Section
          </Button>
          <Button
            type="button"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => { router.push("/dashboard"); router.refresh(); }}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    ) : (
      <>
        <div className="flex gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-2 rounded-full transition-colors ${i <= step ? "bg-green-500" : "bg-gray-200"}`} />
          ))}
        </div>
        <h2 className="text-xl font-semibold mb-1">{STEPS[step]}</h2>
        <p className="text-sm text-gray-400 mb-4">All details can be updated later.</p>

        <form onSubmit={handleSubmit(onSubmit)}>
          {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Property Name</Label>
                <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="My Home" />
              </div>
              <div className="space-y-1">
                <Label>ZIP Code *</Label>
                <Input placeholder="90210" maxLength={5} value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                {zipError && <p className="text-sm text-red-500">{zipError}</p>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Which part of your property are we setting up?</p>
              <AreaTypeSelector
                value={areaType}
                onChange={(v) => {
                  setValue("areaType", v);
                  const defaultNames = new Set(Object.values(AREA_NAME_MAP));
                  const cur = watch("name");
                  if (!cur || defaultNames.has(cur)) setValue("name", AREA_NAME_MAP[v]);
                }}
              />
              <div className="space-y-1">
                <Label>Section Name</Label>
                <Input placeholder="Front Yard" value={watch("name") ?? ""} onChange={(e) => setValue("name", e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Select your grass type, or upload a photo for AI identification.</p>
              <div
                ref={uploadZoneRef}
                className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors duration-300 ${highlightUpload ? "border-green-500 bg-green-50 animate-pulse" : "border-green-200"}`}
              >
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    setHighlightUpload(false);
                    if (file) identifyGrass(file);
                  }}
                />
                {identifying ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                    {identifyPhase === "uploading" ? "Uploading photo…" : "Analyzing your grass…"}
                  </div>
                ) : identified ? (
                  <div className="text-left space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                      <CheckCircle className="w-4 h-4" /> Identified — {identified.confidence} confidence
                    </div>
                    <p className="text-sm text-gray-500">{identified.explanation}</p>
                    <button type="button" onClick={() => photoRef.current?.click()} className="text-sm text-green-600 underline">Try a different photo</button>
                  </div>
                ) : identifyError ? (
                  <div className="text-left space-y-2">
                    <p className="text-sm text-red-500">{identifyError}</p>
                    <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-2 text-sm text-green-600 font-medium hover:text-green-700">
                      <Camera className="w-4 h-4" /> Try again
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-2 mx-auto text-sm text-green-600 font-medium hover:text-green-700">
                    <Camera className="w-4 h-4" /> Upload a photo to identify my grass
                  </button>
                )}
              </div>
              <GrassTypeSelector
                value={grassType}
                onChange={(v) => {
                  setValue("grassType", v);
                  setIdentified(null);
                  if (v === "unknown") {
                    setHighlightUpload(true);
                    uploadZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  } else {
                    setHighlightUpload(false);
                  }
                }}
              />
              {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Street Address (optional — used to look up yard size)</Label>
                <div className="flex gap-2">
                  <Input placeholder="123 Main St" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupYardSize(); } }} />
                  <Button type="button" variant="outline" size="sm" disabled={!streetAddress.trim() || lookingUp} onClick={lookupYardSize} className="shrink-0">
                    {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {lookupNote && <p className="text-sm text-gray-500">{lookupNote}</p>}
              </div>
              <div className="space-y-1">
                <Label>Section Size</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder={sizeUnit === "sqft" ? "5000" : "0.115"} value={sizeDisplay}
                    onChange={(e) => handleSizeInput(e.target.value)} min="0" step={sizeUnit === "acres" ? "0.001" : "1"} />
                  <Select value={sizeUnit} onValueChange={(v) => handleUnitChange(v as "sqft" | "acres")}>
                    <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sqft">sq ft</SelectItem>
                      <SelectItem value="acres">acres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-gray-400">Optional — helps calculate product amounts</p>
              </div>
              <div className="space-y-1">
                <Label>Soil pH</Label>
                <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
                <p className="text-sm text-gray-400">Test with a soil kit from your local hardware store</p>
              </div>
              <div className="space-y-1">
                <Label>Soil Moisture</Label>
                <Select onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
                  <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dry">Dry — cracks easily, water beads</SelectItem>
                    <SelectItem value="moderate">Moderate — moist 1 inch down</SelectItem>
                    <SelectItem value="moist">Moist — stays damp, possible overwatering</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-400">Push a screwdriver 6" into soil: slides in = moist, resistance = moderate, very hard = dry.</p>
              </div>
              <div className="space-y-1">
                <Label>Spreader Type</Label>
                <Select onValueChange={(v) => setValue("spreaderType", v as YardSectionInput["spreaderType"])}>
                  <SelectTrigger><SelectValue placeholder="Select spreader" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broadcast">Broadcast / Rotary</SelectItem>
                    <SelectItem value="drop">Drop Spreader</SelectItem>
                    <SelectItem value="handheld">Handheld Spreader</SelectItem>
                    <SelectItem value="liquid">Liquid / Hose-end Sprayer</SelectItem>
                    <SelectItem value="none">None / Hand Apply</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Spreader Model (optional)</Label>
                <Input placeholder="e.g. Scotts EdgeGuard DLX" {...register("spreaderModel")} />
                {spreaderType && SPREADER_BRANDS[spreaderType]?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {SPREADER_BRANDS[spreaderType].map((brand) => (
                      <button key={brand} type="button" onClick={() => setValue("spreaderModel", brand)}
                        className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
                        {brand}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Additional Notes</Label>
                <Textarea placeholder="Shady areas, problem spots, recent treatments…" {...register("notes")} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <p className="text-gray-500">Review before saving.</p>
              <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                {!createdYardId && <div><span className="font-medium">Property:</span> {propertyName} ({zipCode})</div>}
                {createdYardId && <div><span className="font-medium">Property:</span> {createdPropertyName}</div>}
                <div><span className="font-medium">Section:</span> {watch("name")}</div>
                <div><span className="font-medium">Area:</span> {watch("areaType")?.replace(/_/g, " ") ?? "Not specified"}</div>
                <div><span className="font-medium">Grass:</span> {watch("grassType")?.replace(/_/g, " ")}</div>
                {!!watch("yardSizeSqft") && (
                  <div><span className="font-medium">Size:</span> {String(watch("yardSizeSqft"))} sq ft</div>
                )}
                {!!watch("spreaderType") && (
                  <div><span className="font-medium">Spreader:</span> {String(watch("spreaderType"))}</div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>
            ) : <div />}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={async () => { if (await canAdvance()) setStep((s) => s + 1); }}
                className="bg-green-600 hover:bg-green-700">Next</Button>
            ) : (
              <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </form>
      </>
    )}
  </div>
);
```

- [ ] **Step 6: TypeScript check**

```bash
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d= -f2-)" npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/yard/YardSetupForm.tsx
git commit -m "feat: setup form shows success state with option to add another section"
```

---

### Task 5: Push and deploy

- [ ] **Step 1: Final TypeScript check across everything**

```bash
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d= -f2-)" npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Verify on production**

Check these flows:
1. `/analyze` — section chips show names (not UUIDs), camera icon from dashboard pre-selects correct section
2. `/dashboard` — Tasks section shows "All | Front Yard | Back Yard" pill tabs; clicking a tab filters the list
3. `/yard/setup` — completing the form shows success state with "Add Another Section" button; clicking it returns to Step 1 with the same property
4. Tasks with matching yard/section names show single label, not "Foo › Foo"

---

## Self-Review

**Spec coverage:**
- ✅ Analyze UUID bug fixed — chips avoid Radix Select async state entirely
- ✅ Analyze pre-selects section when camera icon deep-links with `?sectionId=`
- ✅ Dashboard shows "All | Section..." tab filter above task list
- ✅ Clicking a section tab shows only that section's tasks
- ✅ Multi-section setup: success screen offers "Add Another Section" which re-enters the wizard for the same yard
- ✅ Task labels deduplicated when yard and section share a name
- ✅ General UX: loading state on analyze, larger chip targets, scrollable tab strip on mobile

**Placeholder scan:** All steps contain complete code. No TBDs.

**Type consistency:**
- `DashboardTaskSection` receives `Task[]` using the same interface shape already in `TaskList.tsx`
- `TaskSection` interface in `DashboardTaskSection` has `{ id, name, yardName, showYardLabel }` — used consistently in both the dashboard page (where it's built) and the component
- `SectionOption` in the analyze page has `sectionId` (not `id`) — used only internally in that file, no cross-component leak
