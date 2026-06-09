# Watering Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users record their yard-wide watering schedule (days/week + minutes/session) and get AI-generated per-section recommendations that either confirm the schedule suits each section or suggest a specific adjustment — displayed as a reference card, not tasks.

**Architecture:** Add `wateringDaysPerWeek`/`wateringMinutesPerSession` to the `Yard` model and `wateringSchedule`/`wateringDeviates` to `YardSection`. A new `POST /api/sections/[sectionId]/watering` endpoint calls Claude (Haiku) to generate the recommendation and stores it. A new `WateringCard` client component on the section detail page shows the result with a "Get / Refresh" button. The yard overview shows a one-line summary derived from sections' `wateringDeviates` values.

**Tech Stack:** Prisma (PostgreSQL migration), Next.js 15 App Router, Anthropic SDK (claude-haiku-4-5-20251001), react-hook-form + zod, Vitest.

---

## File Structure

**Modified:**
- `prisma/schema.prisma` — add 2 fields to `Yard`, 2 fields to `YardSection`
- `lib/validations/yard.ts` — add `wateringDaysPerWeek` and `wateringMinutesPerSession` to `yardSchema`
- `components/yard/YardSetupForm.tsx` — add watering inputs to Step 3
- `components/yard/YardEditForm.tsx` — add watering inputs
- `app/(dashboard)/yard/[id]/edit/page.tsx` — include new fields in Prisma select, pass to form
- `lib/claude.ts` — add `generateWateringRecommendation` function
- `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` — include watering fields, render `WateringCard`
- `app/(dashboard)/yard/[id]/page.tsx` — show watering summary line and section card indicator

**Created:**
- `lib/ai/watering-prompt.ts` — pure function `buildWateringPrompt(opts)`
- `lib/__tests__/watering-prompt.test.ts` — tests for the prompt builder
- `app/api/sections/[sectionId]/watering/route.ts` — POST endpoint
- `components/sections/WateringCard.tsx` — client component for the watering recommendation card

---

### Task 1: Add watering fields to Prisma schema and migrate

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to `Yard` model**

In `prisma/schema.prisma`, in the `Yard` model, add after `spreaderModel String?`:

```prisma
  wateringDaysPerWeek       Int?
  wateringMinutesPerSession Int?
```

- [ ] **Step 2: Add fields to `YardSection` model**

In the `YardSection` model, add after `currentRoutine String?`:

```prisma
  wateringSchedule  String?
  wateringDeviates  Boolean?
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add_watering_fields
```

Expected output: migration created and applied, `npx prisma generate` runs automatically.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add watering schedule fields to Yard and YardSection"
```

---

### Task 2: Add watering fields to yardSchema validation

**Files:**
- Modify: `lib/validations/yard.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/watering-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { yardSchema } from "@/lib/validations/yard";

describe("yardSchema watering fields", () => {
  it("accepts valid watering days and minutes", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 3,
      wateringMinutesPerSession: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wateringDaysPerWeek).toBe(3);
      expect(result.data.wateringMinutesPerSession).toBe(20);
    }
  });

  it("accepts empty string as undefined (form input behaviour)", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: "",
      wateringMinutesPerSession: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wateringDaysPerWeek).toBeUndefined();
      expect(result.data.wateringMinutesPerSession).toBeUndefined();
    }
  });

  it("rejects wateringDaysPerWeek outside 1-7", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 8,
    });
    expect(result.success).toBe(false);
  });

  it("accepts omitted watering fields (optional)", () => {
    const result = yardSchema.safeParse({ name: "My Yard", zipCode: "30301" });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run lib/__tests__/watering-validation.test.ts
```

Expected: FAIL — `wateringDaysPerWeek` not in schema.

- [ ] **Step 3: Add the fields to `yardSchema`**

In `lib/validations/yard.ts`, add after `buildingSqft`:

```typescript
  wateringDaysPerWeek: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(7).optional()
  ),
  wateringMinutesPerSession: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(120).optional()
  ),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run lib/__tests__/watering-validation.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/yard.ts lib/__tests__/watering-validation.test.ts
git commit -m "feat: add wateringDaysPerWeek and wateringMinutesPerSession to yardSchema"
```

---

### Task 3: Add watering inputs to YardSetupForm (Step 3)

**Files:**
- Modify: `components/yard/YardSetupForm.tsx`

The form manages yard-level fields (like `spreaderType`, `spreaderModel`) as local `useState` rather than through react-hook-form, because the form schema is `YardSectionInput` (section fields only). Follow the same pattern for the watering fields.

- [ ] **Step 1: Add local state for watering fields**

In `YardSetupForm.tsx`, find where `spreaderModel` state is declared (around line 55):

```typescript
const [spreaderModel, setSpreaderModel] = useState("");
```

Add immediately after:

```typescript
const [wateringDaysPerWeek, setWateringDaysPerWeek] = useState("");
const [wateringMinutesPerSession, setWateringMinutesPerSession] = useState("");
```

- [ ] **Step 2: Add inputs to Step 3 UI**

In the `{step === 3 && ...}` block, find the "Additional Notes" field (the last field in Step 3). Add the two watering inputs **before** it:

```tsx
<div className="space-y-1">
  <Label>Watering days per week <span className="text-gray-400 font-normal">(optional)</span></Label>
  <Input
    type="number"
    min="1"
    max="7"
    placeholder="3"
    value={wateringDaysPerWeek}
    onChange={(e) => setWateringDaysPerWeek(e.target.value)}
  />
  <p className="text-sm text-gray-400">How many days per week do you currently water?</p>
</div>
<div className="space-y-1">
  <Label>Minutes per watering session <span className="text-gray-400 font-normal">(optional)</span></Label>
  <Input
    type="number"
    min="1"
    max="120"
    placeholder="20"
    value={wateringMinutesPerSession}
    onChange={(e) => setWateringMinutesPerSession(e.target.value)}
  />
</div>
```

- [ ] **Step 3: Include watering fields in the yard POST request**

In `onSubmit`, find the yard creation fetch body (the `body: JSON.stringify({ name: propertyName, zipCode, ... })` block). Add the two watering fields:

```typescript
wateringDaysPerWeek: wateringDaysPerWeek ? Number(wateringDaysPerWeek) : undefined,
wateringMinutesPerSession: wateringMinutesPerSession ? Number(wateringMinutesPerSession) : undefined,
```

The full yard body becomes:

```typescript
body: JSON.stringify({
  name: propertyName,
  zipCode,
  spreaderType: spreaderType || undefined,
  spreaderModel: spreaderModel || undefined,
  streetAddress: streetAddress || undefined,
  lotSqft: lotData?.lotSqft ?? undefined,
  buildingSqft: lotData?.buildingSqft ?? undefined,
  wateringDaysPerWeek: wateringDaysPerWeek ? Number(wateringDaysPerWeek) : undefined,
  wateringMinutesPerSession: wateringMinutesPerSession ? Number(wateringMinutesPerSession) : undefined,
}),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/yard/YardSetupForm.tsx
git commit -m "feat: add watering schedule inputs to yard setup form"
```

---

### Task 4: Add watering inputs to YardEditForm and edit page

**Files:**
- Modify: `components/yard/YardEditForm.tsx`
- Modify: `app/(dashboard)/yard/[id]/edit/page.tsx`

`YardEditForm` uses `yardSchema` via zodResolver, so the fields are already validated. Just need to add them to `initialData`, register them in the form, and add the UI.

- [ ] **Step 1: Update the `Props` interface in `YardEditForm.tsx`**

Find the `interface Props` block:

```typescript
interface Props {
  yardId: string;
  initialData: { name: string; zipCode: string; spreaderType?: string; spreaderModel?: string };
}
```

Replace with:

```typescript
interface Props {
  yardId: string;
  initialData: {
    name: string;
    zipCode: string;
    spreaderType?: string;
    spreaderModel?: string;
    wateringDaysPerWeek?: number;
    wateringMinutesPerSession?: number;
  };
}
```

- [ ] **Step 2: Add watering fields to `defaultValues`**

In the `useForm` call, add to `defaultValues`:

```typescript
wateringDaysPerWeek: initialData.wateringDaysPerWeek,
wateringMinutesPerSession: initialData.wateringMinutesPerSession,
```

- [ ] **Step 3: Add inputs to the form JSX**

In the form, after the `spreaderModel` field (the last field before the button row), add:

```tsx
<div className="space-y-1">
  <Label>Watering days per week <span className="text-gray-400 font-normal">(optional)</span></Label>
  <Input
    type="number"
    min="1"
    max="7"
    placeholder="3"
    {...register("wateringDaysPerWeek")}
  />
</div>

<div className="space-y-1">
  <Label>Minutes per watering session <span className="text-gray-400 font-normal">(optional)</span></Label>
  <Input
    type="number"
    min="1"
    max="120"
    placeholder="20"
    {...register("wateringMinutesPerSession")}
  />
</div>
```

- [ ] **Step 4: Update `app/(dashboard)/yard/[id]/edit/page.tsx`**

Find the Prisma select:

```typescript
select: { id: true, name: true, zipCode: true, spreaderType: true, spreaderModel: true },
```

Replace with:

```typescript
select: {
  id: true,
  name: true,
  zipCode: true,
  spreaderType: true,
  spreaderModel: true,
  wateringDaysPerWeek: true,
  wateringMinutesPerSession: true,
},
```

Find where `YardEditForm` receives `initialData`:

```typescript
initialData={{
  name: yard.name,
  zipCode: yard.zipCode,
  spreaderType: yard.spreaderType ?? undefined,
  spreaderModel: yard.spreaderModel ?? undefined,
}}
```

Replace with:

```typescript
initialData={{
  name: yard.name,
  zipCode: yard.zipCode,
  spreaderType: yard.spreaderType ?? undefined,
  spreaderModel: yard.spreaderModel ?? undefined,
  wateringDaysPerWeek: yard.wateringDaysPerWeek ?? undefined,
  wateringMinutesPerSession: yard.wateringMinutesPerSession ?? undefined,
}}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/yard/YardEditForm.tsx "app/(dashboard)/yard/[id]/edit/page.tsx"
git commit -m "feat: add watering schedule fields to yard edit form"
```

---

### Task 5: Create watering prompt builder and tests

**Files:**
- Create: `lib/ai/watering-prompt.ts`
- Create: `lib/__tests__/watering-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/watering-prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildWateringPrompt } from "@/lib/ai/watering-prompt";

describe("buildWateringPrompt", () => {
  it("includes grass type and zip code", () => {
    const prompt = buildWateringPrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain("bermuda");
    expect(prompt).toContain("30301");
  });

  it("includes yard schedule context when both watering fields are provided", () => {
    const prompt = buildWateringPrompt({
      grassType: "bermuda",
      zipCode: "30301",
      wateringDaysPerWeek: 3,
      wateringMinutesPerSession: 20,
    });
    expect(prompt).toContain("3 day(s) per week");
    expect(prompt).toContain("20 minutes per session");
    expect(prompt).not.toContain("No yard watering schedule");
  });

  it("indicates no schedule when yard defaults are absent", () => {
    const prompt = buildWateringPrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain("No yard watering schedule has been set");
  });

  it("includes optional section fields when present", () => {
    const prompt = buildWateringPrompt({
      grassType: "bermuda",
      zipCode: "30301",
      areaType: "back",
      soilPh: 6.5,
      soilMoisture: "dry",
      weatherSummary: "85°F, sunny",
      notes: "Partial shade",
    });
    expect(prompt).toContain("back");
    expect(prompt).toContain("6.5");
    expect(prompt).toContain("dry");
    expect(prompt).toContain("85°F, sunny");
    expect(prompt).toContain("Partial shade");
  });

  it("omits optional fields when absent", () => {
    const prompt = buildWateringPrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).not.toContain("Area type:");
    expect(prompt).not.toContain("Soil pH:");
    expect(prompt).not.toContain("Notes:");
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run lib/__tests__/watering-prompt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/ai/watering-prompt.ts`**

```typescript
export interface WateringPromptOpts {
  grassType: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  notes?: string | null;
  zipCode: string;
  wateringDaysPerWeek?: number | null;
  wateringMinutesPerSession?: number | null;
  weatherSummary?: string;
}

export function buildWateringPrompt(opts: WateringPromptOpts): string {
  const lines: string[] = [
    `Grass type: ${opts.grassType.replace(/_/g, " ")}`,
    `ZIP code: ${opts.zipCode}`,
  ];
  if (opts.areaType) lines.push(`Area type: ${opts.areaType.replace(/_/g, " ")}`);
  if (opts.yardSizeSqft) lines.push(`Section size: ${opts.yardSizeSqft.toLocaleString()} sq ft`);
  if (opts.soilPh != null) lines.push(`Soil pH: ${opts.soilPh}`);
  if (opts.soilMoisture) lines.push(`Soil moisture: ${opts.soilMoisture}`);
  if (opts.weatherSummary) lines.push(`Current weather: ${opts.weatherSummary}`);
  if (opts.notes) lines.push(`Notes: ${opts.notes}`);

  const sectionDetails = lines.join("\n");

  const scheduleContext =
    opts.wateringDaysPerWeek != null && opts.wateringMinutesPerSession != null
      ? `Current yard watering schedule: ${opts.wateringDaysPerWeek} day(s) per week, ${opts.wateringMinutesPerSession} minutes per session.\nAssess whether this schedule suits this specific section. Consider grass type, soil drainage, shade, and local climate. Set "deviates" to true only if a meaningfully different schedule is warranted.`
      : `No yard watering schedule has been set. Recommend an appropriate schedule for this section based on its properties and local climate. Set "deviates" to false since there is no default to deviate from.`;

  return [
    sectionDetails,
    "",
    scheduleContext,
    "",
    `Return JSON only — no markdown, no explanation outside the JSON:`,
    `{"schedule": "...", "deviates": true|false}`,
    `"schedule": 1-2 sentence natural language recommendation. If the existing schedule works, affirm it briefly. If not, specify the change and why.`,
    `"deviates": true only if recommending a meaningfully different schedule from the yard default.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run lib/__tests__/watering-prompt.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/watering-prompt.ts lib/__tests__/watering-prompt.test.ts
git commit -m "feat: add watering prompt builder and tests"
```

---

### Task 6: Add generateWateringRecommendation to lib/claude.ts

**Files:**
- Modify: `lib/claude.ts`

- [ ] **Step 1: Add the import for `buildWateringPrompt` at the top of `lib/claude.ts`**

Find the existing import:

```typescript
import { buildSectionAnalysisPrompt } from "@/lib/ai/analysis-prompt";
```

Add after it:

```typescript
import { buildWateringPrompt, WateringPromptOpts } from "@/lib/ai/watering-prompt";
```

- [ ] **Step 2: Add `generateWateringRecommendation` at the end of `lib/claude.ts`**

```typescript
export async function generateWateringRecommendation(
  opts: WateringPromptOpts
): Promise<{ schedule: string; deviates: boolean }> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system:
      "You are an expert lawn care agronomist. Given lawn section details, provide a concise watering schedule recommendation. Return valid JSON only — no markdown, no text outside the JSON object.",
    messages: [{ role: "user", content: buildWateringPrompt(opts) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  return JSON.parse(text) as { schedule: string; deviates: boolean };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/claude.ts
git commit -m "feat: add generateWateringRecommendation to Claude lib"
```

---

### Task 7: Create POST /api/sections/[sectionId]/watering route

**Files:**
- Create: `app/api/sections/[sectionId]/watering/route.ts`

Note: `app/api/sections/[sectionId]/` already exists (the `routine` subdirectory is there). Create the `watering` subdirectory alongside it.

- [ ] **Step 1: Create `app/api/sections/[sectionId]/watering/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateWateringRecommendation } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: {
      yard: {
        select: {
          zipCode: true,
          wateringDaysPerWeek: true,
          wateringMinutesPerSession: true,
        },
      },
    },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await Promise.race([
      getWeatherByZip(section.yard.zipCode),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      ),
    ]);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity`;
  } catch { /* weather is optional */ }

  try {
    const result = await generateWateringRecommendation({
      grassType: section.grassType,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture,
      notes: section.notes,
      zipCode: section.yard.zipCode,
      wateringDaysPerWeek: section.yard.wateringDaysPerWeek,
      wateringMinutesPerSession: section.yard.wateringMinutesPerSession,
      weatherSummary,
    });

    await db.yardSection.update({
      where: { id: sectionId },
      data: {
        wateringSchedule: result.schedule,
        wateringDeviates: result.deviates,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Watering recommendation failed:", err);
    return NextResponse.json({ error: "Failed to generate recommendation. Please try again." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/sections/[sectionId]/watering/route.ts"
git commit -m "feat: add watering recommendation API route"
```

---

### Task 8: Create WateringCard component

**Files:**
- Create: `components/sections/WateringCard.tsx`

- [ ] **Step 1: Create `components/sections/WateringCard.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Droplets } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  sectionId: string;
  yardId: string;
  initialSchedule: string | null;
  initialDeviates: boolean | null;
  hasYardSchedule: boolean;
}

export function WateringCard({
  sectionId,
  yardId,
  initialSchedule,
  initialDeviates,
  hasYardSchedule,
}: Props) {
  const [schedule, setSchedule] = useState(initialSchedule);
  const [deviates, setDeviates] = useState(initialDeviates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRecommendation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/watering`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to get recommendation. Try again.");
        return;
      }
      const data = await res.json();
      setSchedule(data.schedule);
      setDeviates(data.deviates);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="w-4 h-4 text-blue-500" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Watering</h2>
      </div>

      {schedule && (
        <div
          className={cn(
            "rounded-lg p-3 mb-3 text-sm border",
            deviates
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-green-50 text-green-800 border-green-200"
          )}
        >
          {schedule}
        </div>
      )}

      {!schedule && !hasYardSchedule && (
        <p className="text-sm text-gray-500 mb-3">
          <Link href={`/yard/${yardId}/edit`} className="text-green-600 hover:underline">
            Add a watering schedule to your yard
          </Link>{" "}
          for a personalised assessment, or get a general recommendation below.
        </p>
      )}

      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}

      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={fetchRecommendation}
        className="text-xs"
      >
        <Droplets className="w-3 h-3 mr-1" />
        {loading
          ? "Getting recommendation…"
          : schedule
          ? "Refresh"
          : "Get watering recommendation"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/sections/WateringCard.tsx
git commit -m "feat: add WateringCard component"
```

---

### Task 9: Integrate WateringCard into section detail page

**Files:**
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`

- [ ] **Step 1: Update the Prisma query to include yard watering fields**

Find the section query's `yard` include:

```typescript
yard: { select: { id: true, name: true } },
```

Replace with:

```typescript
yard: {
  select: {
    id: true,
    name: true,
    wateringDaysPerWeek: true,
    wateringMinutesPerSession: true,
  },
},
```

The section's own `wateringSchedule` and `wateringDeviates` fields are already present on `section` because the query uses `findFirst` with `include` (not a restricted `select` on the section itself).

- [ ] **Step 2: Add the `WateringCard` import**

At the top of the file, add:

```typescript
import { WateringCard } from "@/components/sections/WateringCard";
```

- [ ] **Step 3: Render the WateringCard after the health score card**

Find the closing `)}` of the health score block (after the `No analyses yet` empty state, around line 177). Add the `WateringCard` immediately after:

```tsx
      <WateringCard
        sectionId={sectionId}
        yardId={yardId}
        initialSchedule={section.wateringSchedule}
        initialDeviates={section.wateringDeviates}
        hasYardSchedule={
          section.yard.wateringDaysPerWeek != null &&
          section.yard.wateringMinutesPerSession != null
        }
      />
```

The full insertion point (between the health card and past analyses) looks like:

```tsx
      )} {/* end of health score block */}

      <WateringCard
        sectionId={sectionId}
        yardId={yardId}
        initialSchedule={section.wateringSchedule}
        initialDeviates={section.wateringDeviates}
        hasYardSchedule={
          section.yard.wateringDaysPerWeek != null &&
          section.yard.wateringMinutesPerSession != null
        }
      />

      {/* Past analyses */}
      {section.analyses.length > 1 && (
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
git commit -m "feat: show WateringCard on section detail page"
```

---

### Task 10: Add watering summary to yard detail page

**Files:**
- Modify: `app/(dashboard)/yard/[id]/page.tsx`

- [ ] **Step 1: Add `Droplets` to the lucide-react import**

Find the lucide import line:

```typescript
import { ChevronLeft, Plus, Camera, Pencil, ArrowRight } from "lucide-react";
```

Add `Droplets`:

```typescript
import { ChevronLeft, Plus, Camera, Pencil, ArrowRight, Droplets } from "lucide-react";
```

- [ ] **Step 2: Add the watering summary line above the section list**

Find the sections list rendering (after the weather widget, inside the `yard.sections.length > 0` branch). The current structure is:

```tsx
      ) : (
        <>
          <div className="space-y-4">
            {yard.sections.map((section: ...
```

Add the summary between the outer `<>` and `<div className="space-y-4">`:

```tsx
      ) : (
        <>
          {(() => {
            const sectionsWithRecs = yard.sections.filter(
              (s) => s.wateringDeviates !== null && s.wateringDeviates !== undefined
            );
            const deviating = sectionsWithRecs.filter((s) => s.wateringDeviates === true);
            if (sectionsWithRecs.length === 0) return null;
            return (
              <div
                className={`flex items-center gap-2 text-sm mb-4 px-1 ${
                  deviating.length === 0 ? "text-green-700" : "text-amber-700"
                }`}
              >
                <Droplets className="w-4 h-4 shrink-0" />
                {deviating.length === 0
                  ? "Watering schedule works well across all sections ✓"
                  : `${deviating.length} section${deviating.length > 1 ? "s" : ""} may need watering adjustments`}
              </div>
            );
          })()}
          <div className="space-y-4">
            {yard.sections.map((section: ...
```

- [ ] **Step 3: Add amber water-drop indicator on deviating section cards**

Inside the sections map, find the section header block (around lines 130–138 where the section name and grass type are displayed). Add a small indicator after the section name on sections where `section.wateringDeviates === true`:

```tsx
<div className="flex items-center gap-2">
  {AreaIcon && <AreaIcon className="w-4 h-4 text-gray-400" />}
  <h2 className="font-semibold text-gray-900 text-lg">{section.name}</h2>
  {section.wateringDeviates === true && (
    <Droplets className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Watering adjustment suggested" />
  )}
</div>
```

This replaces the existing:

```tsx
<div className="flex items-center gap-2">
  {AreaIcon && <AreaIcon className="w-4 h-4 text-gray-400" />}
  <h2 className="font-semibold text-gray-900 text-lg">{section.name}</h2>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/yard/[id]/page.tsx"
git commit -m "feat: add watering summary and section indicators to yard detail page"
```
