# Yard Areas & Multi-Yard Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users tag each yard profile with its area (front, back, left side, right side, garden, other), pass that context to AI recommendations, and overhaul the dashboard to show all yards with per-area task grouping.

**Architecture:** Add an optional `areaType` column to `YardProfile`; surface it in setup/edit forms and AI prompts; replace the single-yard dashboard with a yard overview grid + unified task list that labels each task by yard area.

**Tech Stack:** Next.js 16 App Router, Prisma 6, PostgreSQL (Supabase), React Hook Form + Zod, Tailwind CSS, Claude Sonnet via `lib/claude.ts`, lucide-react icons.

---

### Task 1: Database — add `areaType` to `YardProfile`

**Files:**
- Modify: `prisma/schema.prisma`
- (No migration file — user must run SQL directly in Supabase SQL editor)

- [ ] **Step 1: Update the Prisma schema**

In `prisma/schema.prisma`, add one line to `YardProfile` after `name`:

```prisma
model YardProfile {
  id            String         @id @default(cuid())
  userId        String
  name          String         @default("My Yard")
  areaType      String?        // front | back | left_side | right_side | garden | other
  zipCode       String
  // ... rest unchanged
```

- [ ] **Step 2: Run the migration SQL in Supabase**

In the Supabase dashboard → SQL Editor, run:

```sql
ALTER TABLE "YardProfile" ADD COLUMN IF NOT EXISTS "areaType" text;
```

- [ ] **Step 3: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add areaType column to YardProfile"
```

---

### Task 2: Types & Validation — `AreaType` type and schema field

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/validations/yard.ts`

- [ ] **Step 1: Add `AreaType` to types**

In `types/index.ts`, add after the `GrassType` union:

```typescript
export type AreaType =
  | "front"
  | "back"
  | "left_side"
  | "right_side"
  | "garden"
  | "other";
```

- [ ] **Step 2: Add `areaType` to the Zod schema**

In `lib/validations/yard.ts`, add after the `name` field:

```typescript
export const yardProfileSchema = z.object({
  name: z.string().min(1).default("My Yard"),
  areaType: z.enum(["front", "back", "left_side", "right_side", "garden", "other"]).optional(),
  zipCode: z.string().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code"),
  // ... rest unchanged
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts lib/validations/yard.ts
git commit -m "feat: add AreaType type and areaType validation field"
```

---

### Task 3: Area Type Selector component

**Files:**
- Create: `components/yard/AreaTypeSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { AreaType } from "@/types";
import { cn } from "@/lib/utils";
import { Home, TreePine, PanelLeft, PanelRight, Flower2, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AreaConfig {
  label: string;
  icon: LucideIcon;
  description: string;
}

export const AREA_CONFIG: Record<AreaType, AreaConfig> = {
  front:      { label: "Front Yard",  icon: Home,      description: "Street-facing, high visibility" },
  back:       { label: "Back Yard",   icon: TreePine,  description: "Private, recreational space" },
  left_side:  { label: "Left Side",   icon: PanelLeft, description: "Side yard, left of house" },
  right_side: { label: "Right Side",  icon: PanelRight,description: "Side yard, right of house" },
  garden:     { label: "Garden Area", icon: Flower2,   description: "Garden or landscaped area" },
  other:      { label: "Other",       icon: MapPin,    description: "Custom area" },
};

interface Props {
  value: AreaType | undefined | null;
  onChange: (value: AreaType) => void;
}

export function AreaTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {(Object.entries(AREA_CONFIG) as [AreaType, AreaConfig][]).map(([key, cfg]) => {
        const Icon = cfg.icon;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all hover:border-green-400",
              selected ? "border-green-600 bg-green-50" : "border-gray-200 bg-white"
            )}
          >
            <Icon className={cn("w-5 h-5", selected ? "text-green-700" : "text-gray-400")} />
            <span className="font-medium text-sm">{cfg.label}</span>
            <span className="text-xs text-gray-400 leading-tight">{cfg.description}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/yard/AreaTypeSelector.tsx
git commit -m "feat: add AreaTypeSelector component"
```

---

### Task 4: YardSetupForm — add area type as first field on Step 0

**Files:**
- Modify: `components/yard/YardSetupForm.tsx`

- [ ] **Step 1: Import AreaTypeSelector and AreaType**

At the top of `YardSetupForm.tsx`, add:

```typescript
import { AreaTypeSelector } from "./AreaTypeSelector";
import type { AreaType } from "@/types";
```

- [ ] **Step 2: Add area type field to Step 0**

Inside `{step === 0 && (`, insert before the Yard Name field:

```tsx
<div className="space-y-2">
  <Label>What part of your property is this?</Label>
  <AreaTypeSelector
    value={watch("areaType") as AreaType | undefined}
    onChange={(v) => {
      setValue("areaType", v);
      // Auto-fill name only if user hasn't changed it from the default
      const currentName = watch("name");
      const AREA_LABELS: Record<string, string> = {
        front: "Front Yard", back: "Back Yard",
        left_side: "Left Side Yard", right_side: "Right Side Yard",
        garden: "Garden", other: "My Yard",
      };
      const defaultNames = new Set(Object.values(AREA_LABELS));
      if (!currentName || defaultNames.has(currentName)) {
        setValue("name", AREA_LABELS[v] ?? "My Yard");
      }
    }}
  />
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/yard/YardSetupForm.tsx
git commit -m "feat: add area type selector to yard setup form step 0"
```

---

### Task 5: YardEditForm — add area type selector

**Files:**
- Modify: `components/yard/YardEditForm.tsx`

- [ ] **Step 1: Import AreaTypeSelector**

```typescript
import { AreaTypeSelector, AREA_CONFIG } from "./AreaTypeSelector";
import type { AreaType } from "@/types";
```

- [ ] **Step 2: Update YardData interface**

```typescript
interface YardData {
  id: string;
  name: string;
  areaType: string | null;   // ADD THIS
  zipCode: string;
  // ... rest unchanged
}
```

- [ ] **Step 3: Add to form defaultValues**

```typescript
defaultValues: {
  name: yard.name,
  areaType: (yard.areaType as AreaType) ?? undefined,   // ADD THIS
  zipCode: yard.zipCode,
  // ... rest unchanged
},
```

- [ ] **Step 4: Add selector to the form (first field in the first section)**

Insert before the Yard Name field:

```tsx
<div className="space-y-2">
  <Label>Property area</Label>
  <AreaTypeSelector
    value={watch("areaType") as AreaType | undefined}
    onChange={(v) => setValue("areaType", v)}
  />
</div>
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add components/yard/YardEditForm.tsx
git commit -m "feat: add area type selector to yard edit form"
```

---

### Task 6: AI Context — pass area type to Claude prompts

**Files:**
- Modify: `lib/claude.ts`
- Modify: `app/api/recommendations/route.ts`

- [ ] **Step 1: Add areaType to LawnContext**

In `lib/claude.ts`, update the `LawnContext` interface:

```typescript
export interface LawnContext {
  grassType: GrassType;
  zipCode: string;
  areaType?: string | null;          // ADD
  yardSizeSqft?: number | null;
  spreaderType?: string | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  weatherSummary?: string;
  notes?: string | null;
}
```

- [ ] **Step 2: Add area context line to generateRecommendations prompt**

In the `generateRecommendations` function, add after the Grass Type line:

```typescript
${context.areaType ? `Yard Area: ${context.areaType.replace(/_/g, " ")} (${
  context.areaType === "front" ? "high visibility, prioritize aesthetics" :
  context.areaType === "back"  ? "recreational use, durability matters" :
  context.areaType === "left_side" || context.areaType === "right_side" ? "narrow side yard, often shaded" :
  context.areaType === "garden" ? "garden/landscaped area, mixed plantings" :
  "custom area"
})` : ""}
```

- [ ] **Step 3: Add the same context line to analyzeImages prompt**

Find the `analyzeImages` function's `Known context:` text block and add the same line after Grass Type.

- [ ] **Step 4: Pass areaType in the recommendations API**

In `app/api/recommendations/route.ts`, update the `generateRecommendations` call:

```typescript
const recommendations = await generateRecommendations({
  grassType: profile.grassType as import("@/types").GrassType,
  zipCode: profile.zipCode,
  areaType: profile.areaType,           // ADD
  yardSizeSqft: profile.yardSizeSqft,
  spreaderType: profile.spreaderType,
  soilPh: profile.soilPh,
  soilMoisture: profile.soilMoisture ?? undefined,
  weatherSummary,
  notes: profile.notes,
});
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add lib/claude.ts app/api/recommendations/route.ts
git commit -m "feat: pass yard area type context to Claude AI prompts"
```

---

### Task 7: YardCard — show area type badge

**Files:**
- Modify: `components/yard/YardCard.tsx`

- [ ] **Step 1: Update YardCard interface and display**

Import `AREA_CONFIG` and add `areaType` to the `Yard` interface:

```typescript
import { AREA_CONFIG } from "./AreaTypeSelector";
import type { AreaType } from "@/types";

interface Yard {
  id: string;
  name: string;
  areaType: string | null;   // ADD
  zipCode: string;
  // ... rest unchanged
}
```

- [ ] **Step 2: Show area type badge in the card header**

Replace the `<h2 className="font-semibold text-gray-900">{yard.name}</h2>` line with:

```tsx
<div>
  <h2 className="font-semibold text-gray-900">{yard.name}</h2>
  {yard.areaType && (
    (() => {
      const cfg = AREA_CONFIG[yard.areaType as AreaType];
      if (!cfg) return null;
      const Icon = cfg.icon;
      return (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
          <Icon className="w-3 h-3" /> {cfg.label}
        </div>
      );
    })()
  )}
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/yard/YardCard.tsx
git commit -m "feat: show area type icon and label on YardCard"
```

---

### Task 8: Dashboard — multi-yard overview + grouped task list

This is the largest task. The dashboard currently shows only the first yard and its tasks. It needs to show all yards as overview cards and all tasks with yard labels.

**Files:**
- Create: `components/dashboard/YardOverviewCard.tsx`
- Modify: `components/dashboard/TaskList.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

#### Part A — YardOverviewCard component

- [ ] **Step 1: Create `components/dashboard/YardOverviewCard.tsx`**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { Camera, Pencil } from "lucide-react";

interface YardSummary {
  id: string;
  name: string;
  areaType: string | null;
  grassType: string;
  pendingTaskCount: number;
  latestHealthScore: number | null;
}

export function YardOverviewCard({ yard }: { yard: YardSummary }) {
  const scoreColor =
    yard.latestHealthScore == null ? "text-gray-400" :
    yard.latestHealthScore >= 70   ? "text-green-600" :
    yard.latestHealthScore >= 40   ? "text-yellow-600" : "text-red-600";

  const areaCfg = yard.areaType ? AREA_CONFIG[yard.areaType as AreaType] : null;
  const AreaIcon = areaCfg?.icon;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">{yard.name}</div>
          {areaCfg && AreaIcon && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <AreaIcon className="w-3 h-3" /> {areaCfg.label}
            </div>
          )}
        </div>
        {yard.latestHealthScore != null && (
          <div className="text-center shrink-0">
            <div className={`text-2xl font-bold ${scoreColor}`}>{yard.latestHealthScore}</div>
            <div className="text-xs text-gray-400 leading-none">score</div>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-500 capitalize">
        {yard.grassType.replace(/_/g, " ")} grass
      </div>

      {yard.pendingTaskCount > 0 && (
        <div className="text-xs text-orange-600 font-medium">
          {yard.pendingTaskCount} task{yard.pendingTaskCount > 1 ? "s" : ""} pending
        </div>
      )}

      <div className="flex gap-2 mt-auto pt-1">
        <Link href={`/analyze?profileId=${yard.id}`} className="flex-1">
          <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-xs h-8">
            <Camera className="w-3 h-3 mr-1" /> Analyze
          </Button>
        </Link>
        <Link href={`/yard/${yard.id}/edit`}>
          <Button size="sm" variant="outline" className="h-8 px-3">
            <Pencil className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
```

#### Part B — Update TaskList to show yard label

- [ ] **Step 2: Update the `Task` interface in `components/dashboard/TaskList.tsx`**

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  product?: string | null;
  applicationRate?: string | null;
  spreaderSetting?: string | null;
  yardProfile?: { id: string; name: string; areaType: string | null } | null; // ADD
}
```

- [ ] **Step 3: Update TaskList props to accept `multiYard` flag**

```typescript
export function TaskList({
  tasks: initial,
  multiYard = false,
}: {
  tasks: Task[];
  multiYard?: boolean;
}) {
```

- [ ] **Step 4: Show yard label on each task when `multiYard` is true**

Inside the pending task card, after the title row, add:

```tsx
{multiYard && task.yardProfile && (
  <span className="text-xs text-green-700 font-medium">
    {task.yardProfile.name}
  </span>
)}
```

Insert this as the first item inside the `<div className="flex-1 min-w-0">` div, before the existing title row.

#### Part C — Rewrite dashboard/page.tsx

- [ ] **Step 5: Replace `app/(dashboard)/dashboard/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { TaskList } from "@/components/dashboard/TaskList";
import { YardOverviewCard } from "@/components/dashboard/YardOverviewCard";
import { Plus, Camera } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yardProfile.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
      _count: { select: { tasks: { where: { status: { not: "completed" } } } } },
    },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const tasks = await db.lawnTask.findMany({
    where: { yardProfileId: { in: yards.map((y) => y.id) } },
    orderBy: { createdAt: "desc" },
    include: { yardProfile: { select: { id: true, name: true, areaType: true } } },
  });

  const yardSummaries = yards.map((y) => ({
    id: y.id,
    name: y.name,
    areaType: y.areaType,
    grassType: y.grassType,
    pendingTaskCount: y._count.tasks,
    latestHealthScore: y.analyses[0]?.healthScore ?? null,
  }));

  const primaryZip = yards[0].zipCode;
  const multiYard = yards.length > 1;

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
          {multiYard && (
            <Link href="/yard" className="text-sm text-green-700 hover:underline">
              Manage all →
            </Link>
          )}
        </div>
        <div className={`grid gap-3 ${multiYard ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {yardSummaries.map((yard) => (
            <YardOverviewCard key={yard.id} yard={yard} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">
          {multiYard ? "All Tasks" : "Your Tasks"}
        </h2>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 text-sm mb-3">
                No tasks yet. Analyze a yard to get started.
              </p>
              <Link href="/analyze">
                <Button className="bg-green-600 hover:bg-green-700">
                  <Camera className="mr-2 w-4 h-4" /> Analyze My Lawn
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <TaskList tasks={tasks} multiYard={multiYard} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/YardOverviewCard.tsx components/dashboard/TaskList.tsx app/(dashboard)/dashboard/page.tsx
git commit -m "feat: multi-yard dashboard with yard overview cards and labeled task list"
```

---

### Task 9: Typography pass — increase text sizes for readability

**Files:**
- Modify: `components/dashboard/TaskList.tsx`
- Modify: `components/analysis/AnalysisResults.tsx`
- Modify: `components/yard/YardSetupForm.tsx`
- Modify: `components/yard/YardEditForm.tsx`
- Modify: `components/yard/GrassTypeSelector.tsx`

The goal: no user-facing content text should be `text-xs`. Secondary metadata (timestamps, helper labels) may stay `text-xs`. Body copy and task descriptions should be at least `text-sm`.

- [ ] **Step 1: TaskList — bump description from `text-xs` to `text-sm`**

In `components/dashboard/TaskList.tsx`:

```tsx
// Change:
<p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
// To:
<p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
```

- [ ] **Step 2: TaskList — bump task title from `text-sm` to `text-base`**

```tsx
// Change:
<span className="font-medium text-sm">{task.title}</span>
// To:
<span className="font-medium text-base">{task.title}</span>
```

- [ ] **Step 3: AnalysisResults — bump recommendation description**

In `components/analysis/AnalysisResults.tsx`:

```tsx
// Change:
<p className="text-sm text-gray-600 mb-2">{rec.description}</p>
// To:
<p className="text-base text-gray-600 mb-2">{rec.description}</p>
```

Also bump the product info box from `text-xs` to `text-sm`:

```tsx
// Change:
<div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
// To:
<div className="mt-2 text-sm bg-gray-50 rounded p-2 space-y-1">
```

- [ ] **Step 4: GrassTypeSelector — bump description text**

In `components/yard/GrassTypeSelector.tsx`:

```tsx
// Change all three text sizes in the card:
<div className="font-medium text-sm">{grass.label}</div>
<div className="text-xs text-gray-500 mt-0.5">{grass.zone} season</div>
<div className="text-xs text-gray-400 mt-0.5">{grass.description}</div>
// To:
<div className="font-medium text-base">{grass.label}</div>
<div className="text-sm text-gray-500 mt-0.5">{grass.zone} season</div>
<div className="text-sm text-gray-400 mt-0.5">{grass.description}</div>
```

- [ ] **Step 5: Form helper text — bump from `text-xs` to `text-sm`**

In `YardSetupForm.tsx` and `YardEditForm.tsx`, change helper text paragraphs:

```tsx
// Change (all instances):
<p className="text-xs text-gray-400">...</p>
// To:
<p className="text-sm text-gray-400">...</p>
```

Also bump validation error messages:

```tsx
// Change:
<p className="text-xs text-red-500">...</p>
// To:
<p className="text-sm text-red-500">...</p>
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/TaskList.tsx components/analysis/AnalysisResults.tsx components/yard/YardSetupForm.tsx components/yard/YardEditForm.tsx components/yard/GrassTypeSelector.tsx
git commit -m "style: increase text sizes for readability — xs→sm, sm→base for content"
```

---

## Self-Review

**Spec coverage:**
- ✅ Front/back/left/right/garden area types → Task 2, 3
- ✅ Area type on setup form → Task 4
- ✅ Area type on edit form → Task 5
- ✅ AI recommendations use area context → Task 6
- ✅ Dashboard shows all yards logically → Task 8
- ✅ Tasks labeled by yard when multiple yards → Task 8B
- ✅ Text readability pass → Task 9
- ✅ Multiple yards supported (no artificial limit; premium gating deferred) → Task 8C

**Future premium hook:** The data model supports unlimited yards. A free-tier limit (e.g., max 1 yard) can be enforced in `app/api/yard/route.ts` POST handler by checking `count` before creation — no schema changes needed.
