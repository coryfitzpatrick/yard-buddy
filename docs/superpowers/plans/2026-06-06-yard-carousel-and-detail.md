# Yard Carousel, Detail Page & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the dashboard "My Yards" grid into a selectable carousel that filters the task list; add a rich yard detail page at `/yard/[id]` with section health charts; add View and Delete actions to the `/yard` management page.

**Architecture:** Four independent tasks. Task 1 builds the yard detail page (new server page + `SectionHealthChart` client component + `recharts` install). Task 2 adds a `YardDeleteButton` client component and View link to the `/yard` management page — no API changes needed (DELETE endpoint already exists with cascade). Task 3 replaces the dashboard yard grid with a new `YardCarousel` client component and a `DashboardInteractiveSection` wrapper that holds the selected-yard state and pre-filters tasks and sections before passing them to the existing `DashboardTaskSection`. Task 4 pushes.

**Tech Stack:** Next.js 16 App Router, Prisma 6, recharts (new), date-fns (already installed), Tailwind CSS v4, lucide-react, shadcn/ui.

---

## File Map

| File | Change |
|---|---|
| `app/(dashboard)/yard/[id]/page.tsx` | **New** — yard detail server page with section analysis history |
| `components/yard/SectionHealthChart.tsx` | **New** — client line chart (recharts) for health score over time |
| `components/yard/YardDeleteButton.tsx` | **New** — client delete button with inline confirm |
| `app/(dashboard)/yard/page.tsx` | Modify — add View link + YardDeleteButton to each yard header |
| `components/dashboard/YardCarousel.tsx` | **New** — horizontal scroll carousel of selectable yard cards |
| `components/dashboard/DashboardInteractiveSection.tsx` | **New** — client wrapper holding selectedYardId; renders YardCarousel + filtered DashboardTaskSection |
| `app/(dashboard)/dashboard/page.tsx` | Modify — use DashboardInteractiveSection; add yardId to allSections array |

---

### Task 1: Yard detail page with section health chart

The yard detail page at `/yard/[id]` shows all sections for that yard. Each section shows: area icon, name, grass type, size; the latest health score (color-coded); a line chart of health score over time (when ≥ 2 analyses exist); the latest analysis summary + issue list; and links to Edit and Analyze.

**Files:**
- Install: `recharts`
- Create: `components/yard/SectionHealthChart.tsx`
- Create: `app/(dashboard)/yard/[id]/page.tsx`

- [ ] **Step 1: Install recharts**

```bash
cd /Users/cory/Projects/yard-buddy && npm install recharts
```

Expected: recharts added to `package.json` dependencies with no peer-dependency warnings.

- [ ] **Step 2: Create `components/yard/SectionHealthChart.tsx`**

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

interface Props {
  data: { date: string; score: number }[];
}

export function SectionHealthChart({ data }: Props) {
  const points = data.map((d) => ({
    date: format(new Date(d.date), "MMM d"),
    score: d.score,
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(val: number) => [`${val}`, "Health"]}
          contentStyle={{ fontSize: 12 }}
          labelStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ fill: "#16a34a", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create `app/(dashboard)/yard/[id]/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus, Camera } from "lucide-react";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { SectionHealthChart } from "@/components/yard/SectionHealthChart";
import { format } from "date-fns";

export default async function YardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const yard = await db.yard.findFirst({
    where: { id, userId: session.user.id },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: {
            orderBy: { createdAt: "asc" },
            select: { id: true, healthScore: true, issues: true, summary: true, createdAt: true },
          },
        },
      },
    },
  });
  if (!yard) notFound();

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <Link
        href="/yard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> My Yards
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{yard.name}</h1>
          <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
        </div>
        <Link href={`/yard/${id}/sections/new`}>
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Add Section
          </Button>
        </Link>
      </div>

      {yard.sections.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-4">No sections yet. Add your first section to get started.</p>
          <Link href={`/yard/${id}/sections/new`}>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-1" /> Add Section
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {yard.sections.map((section) => {
            const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
            const AreaIcon = areaCfg?.icon;
            const latestAnalysis = section.analyses[section.analyses.length - 1] ?? null;
            const chartData = section.analyses.map((a) => ({
              date: a.createdAt.toISOString(),
              score: a.healthScore,
            }));
            const scoreColor =
              latestAnalysis == null ? "text-gray-300" :
              latestAnalysis.healthScore >= 70 ? "text-green-600" :
              latestAnalysis.healthScore >= 40 ? "text-yellow-600" : "text-red-600";

            return (
              <div key={section.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {AreaIcon && <AreaIcon className="w-4 h-4 text-gray-400" />}
                      <h2 className="font-semibold text-gray-900 text-lg">{section.name}</h2>
                    </div>
                    <p className="text-sm text-gray-400 capitalize mt-0.5">
                      {section.grassType.replace(/_/g, " ")}
                      {section.yardSizeSqft ? ` · ${section.yardSizeSqft.toLocaleString()} sq ft` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/yard/${yard.id}/sections/${section.id}/edit`}>
                      <Button variant="outline" size="sm">Edit</Button>
                    </Link>
                    <Link href={`/analyze?sectionId=${section.id}`}>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
                        <Camera className="w-3.5 h-3.5 mr-1" /> Analyze
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Health score + chart */}
                {latestAnalysis && (
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className={`text-3xl font-bold ${scoreColor}`}>
                        {latestAnalysis.healthScore}
                      </span>
                      <span className="text-sm text-gray-400">/ 100 health score</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {format(new Date(latestAnalysis.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    {chartData.length >= 2 && (
                      <SectionHealthChart data={chartData} />
                    )}
                  </div>
                )}

                {/* Latest analysis summary */}
                {latestAnalysis && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700">{latestAnalysis.summary}</p>
                    {latestAnalysis.issues.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {latestAnalysis.issues.map((issue) => (
                          <span
                            key={issue}
                            className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
                          >
                            {issue}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!latestAnalysis && (
                  <p className="text-sm text-gray-400">No analyses yet — tap Analyze to get started.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/cory/Projects/yard-buddy && npx tsc --noEmit 2>&1
```

Expected: no errors. If recharts types are missing, run `npm install @types/recharts` (recharts v2+ ships its own types so this likely won't be needed).

- [ ] **Step 5: Commit**

```bash
git add components/yard/SectionHealthChart.tsx "app/(dashboard)/yard/[id]/page.tsx" package.json package-lock.json
git commit -m "feat: yard detail page with section health score history chart"
```

---

### Task 2: Delete yard + View button on /yard management page

Add a "View" button (linking to `/yard/[id]`) and a delete button with inline confirmation to each yard group on the `/yard` management page. The delete API (`DELETE /api/yard/[id]`) already exists and cascades to sections, analyses, and tasks via Prisma's `onDelete: Cascade`.

**Files:**
- Create: `components/yard/YardDeleteButton.tsx`
- Modify: `app/(dashboard)/yard/page.tsx`

- [ ] **Step 1: Create `components/yard/YardDeleteButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function YardDeleteButton({ yardId }: { yardId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/yard/${yardId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/yard");
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-red-600">Delete yard and all sections?</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-red-600 hover:bg-red-50 px-2"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Confirm"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2"
          onClick={() => setConfirm(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-gray-400 hover:text-red-500"
      onClick={() => setConfirm(true)}
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  );
}
```

- [ ] **Step 2: Rewrite `app/(dashboard)/yard/page.tsx`**

Read the current file first. Replace the entire content with:

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/yard/SectionCard";
import { YardDeleteButton } from "@/components/yard/YardDeleteButton";

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { sections: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Yards</h1>
        <Link href="/yard/setup">
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Add Yard
          </Button>
        </Link>
      </div>

      {yards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">No yards yet. Add your first to get started.</p>
          <Link href="/yard/setup">
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-1" /> Add Yard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {yards.map((yard) => (
            <div key={yard.id}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{yard.name}</h2>
                  <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Link href={`/yard/${yard.id}`}>
                    <Button variant="outline" size="sm">
                      <ArrowRight className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                  </Link>
                  <Link href={`/yard/${yard.id}/sections/new`}>
                    <Button variant="outline" size="sm">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                    </Button>
                  </Link>
                  <YardDeleteButton yardId={yard.id} />
                </div>
              </div>
              {yard.sections.length === 0 ? (
                <p className="text-sm text-gray-400 pl-1">No sections yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {yard.sections.map((section) => (
                    <SectionCard key={section.id} section={section} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/cory/Projects/yard-buddy && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/yard/YardDeleteButton.tsx "app/(dashboard)/yard/page.tsx"
git commit -m "feat: add View link and delete yard action to /yard management page"
```

---

### Task 3: Dashboard yard carousel with selection

Replace the `YardOverviewCard` grid on the dashboard with a horizontal scrollable `YardCarousel` where each card is selectable. Selecting a yard filters the task list below to show only that yard's tasks (and only that yard's section tabs). Clicking a selected card deselects it (returns to "All" tasks). Each card has an arrow-link to the yard detail page.

State lives in a new `DashboardInteractiveSection` wrapper client component. `DashboardTaskSection` is unchanged — it simply receives pre-filtered tasks and sections.

**Files:**
- Create: `components/dashboard/YardCarousel.tsx`
- Create: `components/dashboard/DashboardInteractiveSection.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create `components/dashboard/YardCarousel.tsx`**

```tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { ArrowRight } from "lucide-react";

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

interface Props {
  yards: YardCard[];
  selectedYardId: string | null;
  onSelect: (yardId: string | null) => void;
}

export function YardCarousel({ yards, selectedYardId, onSelect }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
      {yards.map((yard) => {
        const selected = yard.id === selectedYardId;
        return (
          <button
            key={yard.id}
            type="button"
            onClick={() => onSelect(selected ? null : yard.id)}
            className={cn(
              "shrink-0 w-48 text-left rounded-xl border-2 p-3 transition-all bg-white",
              selected
                ? "border-green-500 ring-1 ring-green-300 bg-green-50"
                : "border-gray-200 hover:border-green-300"
            )}
          >
            <div className="flex items-start justify-between gap-1 mb-1">
              <span
                className={cn(
                  "font-semibold text-sm leading-tight",
                  selected ? "text-green-900" : "text-gray-900"
                )}
              >
                {yard.name}
              </span>
              <Link
                href={`/yard/${yard.id}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 p-0.5 rounded text-gray-400 hover:text-green-600 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-gray-400 mb-2">ZIP {yard.zipCode}</p>
            <div className="space-y-1">
              {yard.sections.slice(0, 3).map((s) => {
                const areaCfg = s.areaType ? AREA_CONFIG[s.areaType as AreaType] : null;
                const Icon = areaCfg?.icon;
                const dotColor =
                  s.latestHealthScore == null ? "bg-gray-200" :
                  s.latestHealthScore >= 70 ? "bg-green-400" :
                  s.latestHealthScore >= 40 ? "bg-yellow-400" : "bg-red-400";
                return (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                    {Icon && <Icon className="w-3 h-3 text-gray-400 shrink-0" />}
                    <span className="text-xs text-gray-600 truncate">{s.name}</span>
                  </div>
                );
              })}
              {yard.sections.length > 3 && (
                <p className="text-xs text-gray-400">+{yard.sections.length - 3} more</p>
              )}
              {yard.sections.length === 0 && (
                <p className="text-xs text-gray-400">No sections yet</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/dashboard/DashboardInteractiveSection.tsx`**

```tsx
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
```

- [ ] **Step 3: Rewrite `app/(dashboard)/dashboard/page.tsx`**

Read the current file first. Replace the entire content with:

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { DashboardInteractiveSection } from "@/components/dashboard/DashboardInteractiveSection";
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
      latestHealthScore: s.analyses[0]?.healthScore ?? null,
    })),
  }));

  const allSections = yards.flatMap((y) =>
    y.sections.map((s) => ({
      id: s.id,
      name: s.name,
      yardId: y.id,
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

      <DashboardInteractiveSection
        yards={yardSummaries}
        tasks={tasks}
        allSections={allSections}
      />
    </div>
  );
}
```

Note: `YardOverviewCard` is no longer imported by the dashboard page. The file `components/dashboard/YardOverviewCard.tsx` can remain as dead code or be deleted separately.

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/cory/Projects/yard-buddy && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/YardCarousel.tsx components/dashboard/DashboardInteractiveSection.tsx "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: replace yard grid with selectable carousel; clicking a yard filters the task list"
```

---

### Task 4: Push and deploy

- [ ] **Step 1: Final TypeScript check**

```bash
cd /Users/cory/Projects/yard-buddy && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Verify on production**

Check these flows:
1. `/dashboard` — "My Yards" is a horizontal carousel. Clicking a card highlights it and filters the "Tasks" section to only that yard. Clicking again deselects. Arrow icon on each card navigates to the yard detail page without selecting the card.
2. `/yard/[id]` — Shows all sections with health score, chart (if ≥ 2 analyses), summary, and issue tags. Edit and Analyze buttons on each section card.
3. `/yard` — Each yard header now has a "View" button (links to `/yard/[id]`) and a trash icon that triggers an inline delete confirmation.
4. Delete a yard — confirm deletes the yard and all sections/tasks, redirects to `/yard`.

---

## Self-Review

**Spec coverage:**
- ✅ Dashboard carousel — horizontal scroll, tap to select, deselect by tapping again
- ✅ Carousel card has arrow button linking to yard detail page (does not trigger selection)
- ✅ Carousel selection filters the task list to that yard only
- ✅ Section tabs in task list update to show only sections of the selected yard
- ✅ "All" tab label becomes "{Yard Name} Tasks" when a yard is selected
- ✅ Yard detail page shows all sections with health score history chart
- ✅ Chart only rendered when ≥ 2 analyses (single point isn't meaningful as a line)
- ✅ Latest analysis summary and issue tags shown per section
- ✅ View button added to /yard page yard headers
- ✅ Delete yard button on /yard page with inline confirmation
- ✅ Delete cascades to sections, analyses, and tasks (Prisma `onDelete: Cascade` already set)

**Placeholder scan:** All steps contain complete code. No TBDs.

**Type consistency:**
- `YardCardSection` interface in `YardCarousel.tsx` has `{ id, name, areaType, latestHealthScore }` — matches what `DashboardInteractiveSection` passes and what the dashboard page builds from its Prisma query
- `TaskSection` in `DashboardInteractiveSection` includes `yardId` (used for filtering) but the mapped `displaySections` passed to `DashboardTaskSection` strips `yardId` so it matches `DashboardTaskSection`'s existing interface exactly
- `SectionHealthChart` receives `{ date: string; score: number }[]` — the yard detail page maps `a.createdAt.toISOString()` to match
