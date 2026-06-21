# Schedule Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect watering and mowing schedule deviations on every analysis, persist structured AI suggestions per analysis, and surface a section-page UX for Apply/Ignore/Dismiss with per-section overrides for Home Plus and Professional.

**Architecture:** A single combined Claude call inside the analyze route returns both watering and mowing recommendations. Each recommendation persists onto the `LawnAnalysis` row that produced it. The section detail page renders two cards (Watering, Mowing) driven by the latest analysis. Apply writes to the yard (Basic) or section (Plus/Pro) based on plan. Ignore sets a dismissal timestamp on the analysis row.

**Tech Stack:** Next.js App Router, Prisma 5, PostgreSQL (Supabase-hosted), Vitest, Tailwind, Anthropic SDK (Claude Haiku 4.5 for the schedule call).

**Spec:** [`docs/superpowers/specs/2026-06-21-schedule-recommendations-design.md`](../specs/2026-06-21-schedule-recommendations-design.md)

---

## File Structure

**New files:**
- `lib/plan/can-set-section-schedule.ts` — boolean plan-tier gate (+ unit test)
- `lib/schedules/effective-schedule.ts` — pure helper for resolving yard/section overrides (+ unit test)
- `lib/ai/schedule-prompt.ts` — replaces watering-prompt; builds combined watering+mowing prompt (+ unit test)
- `lib/schedules/apply-handler.ts` — shared logic between watering and mowing Apply routes
- `app/api/sections/[sectionId]/watering/apply/route.ts`
- `app/api/sections/[sectionId]/watering/dismiss/route.ts`
- `app/api/sections/[sectionId]/mowing/apply/route.ts`
- `app/api/sections/[sectionId]/mowing/dismiss/route.ts`
- `components/sections/ScheduleRecommendationCard.tsx`
- Single new Prisma migration

**Modified:**
- `prisma/schema.prisma` — column additions on `Yard`, `YardSection`, `LawnAnalysis`
- `lib/claude.ts` — replace `generateWateringRecommendation` with `generateScheduleRecommendation`
- `app/api/analyze/route.ts` — call schedule prompt after analysis, persist result onto the new `LawnAnalysis` row in the same transaction
- `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` — render two ScheduleRecommendationCards
- `components/yard/YardEditForm.tsx` — add mowing inputs
- `components/yard/SectionForm.tsx` — add plan-gated override inputs
- `lib/observability/events.ts` — six new event functions

**Deleted:**
- `lib/ai/watering-prompt.ts` (single caller; superseded)
- `lib/__tests__/watering-prompt.test.ts`

---

## Pre-flight

- [ ] **Step 0: Confirm clean state**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean and 412 passing tests (baseline).

```bash
docker ps | grep postgres
```
Expected: a local Postgres container is running. If not, `npm run db:up` (or whichever command the repo provides — check `package.json`).

---

### Task 1: Schema additions and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_schedule_recommendations/migration.sql` (generated)

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add to the `Yard` model (after the existing `wateringMinutesPerSession`):
```prisma
  mowingDaysPerWeek         Int?
  mowingHeightInches        Float?
```

Add to the `YardSection` model (after `notes`):
```prisma
  wateringDaysPerWeek       Int?
  wateringMinutesPerSession Int?
  mowingDaysPerWeek         Int?
  mowingHeightInches        Float?
```

Add to the `LawnAnalysis` model (after `rawResponse`):
```prisma
  wateringSchedule                  String?    @db.Text
  wateringDeviates                  Boolean?
  wateringSuggestedDaysPerWeek      Int?
  wateringSuggestedMinutesPerSession Int?
  wateringRecommendationDismissedAt DateTime?
  mowingSchedule                    String?    @db.Text
  mowingDeviates                    Boolean?
  mowingSuggestedDaysPerWeek        Int?
  mowingSuggestedHeightInches       Float?
  mowingRecommendationDismissedAt   DateTime?
```

- [ ] **Step 2: Generate the migration**

```bash
npx prisma migrate dev --name add_schedule_recommendations
```
Expected: a new migration directory appears under `prisma/migrations/`. Prisma applies it locally and regenerates the client.

- [ ] **Step 3: Inspect the generated SQL and verify nothing else changed**

Open the generated `migration.sql` and confirm it only contains:
- `ALTER TABLE "Yard" ADD COLUMN "mowingDaysPerWeek" INTEGER, ADD COLUMN "mowingHeightInches" DOUBLE PRECISION;`
- `ALTER TABLE "YardSection" ADD COLUMN "wateringDaysPerWeek" INTEGER, ...` (4 columns)
- `ALTER TABLE "LawnAnalysis" ADD COLUMN "wateringSchedule" TEXT, ...` (10 columns)

Both `Yard.wateringDaysPerWeek` and `Yard.wateringMinutesPerSession` already exist — make sure the migration doesn't re-add them.

The codebase rule from the user's memory says new public tables need `ENABLE ROW LEVEL SECURITY`. This migration only adds columns to existing tables; no new tables, no RLS statement needed. Skip.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: clean. Existing code touching `LawnAnalysis`, `YardSection`, `Yard` should still compile because we only added optional columns.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add schedule recommendation columns to LawnAnalysis, Yard, YardSection"
```

---

### Task 2: Plan helper and effective-schedule helper

**Files:**
- Create: `lib/plan/can-set-section-schedule.ts`
- Create: `lib/__tests__/can-set-section-schedule.test.ts`
- Create: `lib/schedules/effective-schedule.ts`
- Create: `lib/__tests__/effective-schedule.test.ts`

- [ ] **Step 1: Write the failing plan helper test**

Create `lib/__tests__/can-set-section-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

describe("canSetSectionSchedule", () => {
  it("returns false for home_basic", () => {
    expect(canSetSectionSchedule("home_basic")).toBe(false);
  });
  it("returns false for trial", () => {
    expect(canSetSectionSchedule("trial")).toBe(false);
  });
  it("returns true for home_plus", () => {
    expect(canSetSectionSchedule("home_plus")).toBe(true);
  });
  it("returns true for professional", () => {
    expect(canSetSectionSchedule("professional")).toBe(true);
  });
  it("returns false for null", () => {
    expect(canSetSectionSchedule(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
npx vitest run lib/__tests__/can-set-section-schedule.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the plan helper**

Create `lib/plan/can-set-section-schedule.ts`:

```ts
export function canSetSectionSchedule(plan: string | null): boolean {
  return plan === "home_plus" || plan === "professional";
}
```

- [ ] **Step 4: Run the test, confirm passing**

```bash
npx vitest run lib/__tests__/can-set-section-schedule.test.ts
```
Expected: 5/5 passing.

- [ ] **Step 5: Write the failing effective-schedule test**

Create `lib/__tests__/effective-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";

const section = (over: Partial<{ wDays: number; wMin: number; mDays: number; mH: number }>) => ({
  wateringDaysPerWeek: over.wDays ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDaysPerWeek: over.mDays ?? null,
  mowingHeightInches: over.mH ?? null,
});

const yard = (over: Partial<{ wDays: number; wMin: number; mDays: number; mH: number }>) => ({
  wateringDaysPerWeek: over.wDays ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDaysPerWeek: over.mDays ?? null,
  mowingHeightInches: over.mH ?? null,
});

describe("effectiveWatering", () => {
  it("prefers section override when plan allows", () => {
    const result = effectiveWatering(section({ wDays: 3, wMin: 15 }), yard({ wDays: 5, wMin: 30 }), "home_plus");
    expect(result).toEqual({ daysPerWeek: 3, minutesPerSession: 15 });
  });
  it("falls back to yard when section override is null", () => {
    const result = effectiveWatering(section({}), yard({ wDays: 5, wMin: 30 }), "home_plus");
    expect(result).toEqual({ daysPerWeek: 5, minutesPerSession: 30 });
  });
  it("ignores section override on home_basic plan", () => {
    const result = effectiveWatering(section({ wDays: 3, wMin: 15 }), yard({ wDays: 5, wMin: 30 }), "home_basic");
    expect(result).toEqual({ daysPerWeek: 5, minutesPerSession: 30 });
  });
  it("returns nulls when nothing is set", () => {
    const result = effectiveWatering(section({}), yard({}), "home_plus");
    expect(result).toEqual({ daysPerWeek: null, minutesPerSession: null });
  });
});

describe("effectiveMowing", () => {
  it("prefers section override when plan allows", () => {
    const result = effectiveMowing(section({ mDays: 1, mH: 3.0 }), yard({ mDays: 2, mH: 2.5 }), "professional");
    expect(result).toEqual({ daysPerWeek: 1, heightInches: 3.0 });
  });
  it("falls back to yard when section is null", () => {
    const result = effectiveMowing(section({}), yard({ mDays: 2, mH: 2.5 }), "home_plus");
    expect(result).toEqual({ daysPerWeek: 2, heightInches: 2.5 });
  });
  it("ignores section override on home_basic", () => {
    const result = effectiveMowing(section({ mDays: 1, mH: 3.0 }), yard({ mDays: 2, mH: 2.5 }), "home_basic");
    expect(result).toEqual({ daysPerWeek: 2, heightInches: 2.5 });
  });
});
```

- [ ] **Step 6: Run test, confirm failure**

```bash
npx vitest run lib/__tests__/effective-schedule.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the effective-schedule helper**

Create `lib/schedules/effective-schedule.ts`:

```ts
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

type WateringSource = {
  wateringDaysPerWeek: number | null;
  wateringMinutesPerSession: number | null;
};

type MowingSource = {
  mowingDaysPerWeek: number | null;
  mowingHeightInches: number | null;
};

export function effectiveWatering(
  section: WateringSource,
  yard: WateringSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    daysPerWeek: (canOverride ? section.wateringDaysPerWeek : null) ?? yard.wateringDaysPerWeek ?? null,
    minutesPerSession: (canOverride ? section.wateringMinutesPerSession : null) ?? yard.wateringMinutesPerSession ?? null,
  };
}

export function effectiveMowing(
  section: MowingSource,
  yard: MowingSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    daysPerWeek: (canOverride ? section.mowingDaysPerWeek : null) ?? yard.mowingDaysPerWeek ?? null,
    heightInches: (canOverride ? section.mowingHeightInches : null) ?? yard.mowingHeightInches ?? null,
  };
}
```

- [ ] **Step 8: Run test, confirm passing**

```bash
npx vitest run lib/__tests__/effective-schedule.test.ts
```
Expected: 7/7 passing.

- [ ] **Step 9: Commit**

```bash
git add lib/plan/can-set-section-schedule.ts lib/schedules/effective-schedule.ts lib/__tests__/can-set-section-schedule.test.ts lib/__tests__/effective-schedule.test.ts
git commit -m "Add plan and effective-schedule helpers for watering and mowing"
```

---

### Task 3: Schedule prompt builder and Claude wrapper

**Files:**
- Create: `lib/ai/schedule-prompt.ts`
- Create: `lib/__tests__/schedule-prompt.test.ts`
- Modify: `lib/claude.ts` (replace `generateWateringRecommendation`)
- Delete: `lib/ai/watering-prompt.ts`
- Delete: `lib/__tests__/watering-prompt.test.ts`

- [ ] **Step 1: Write the failing prompt-builder test**

Create `lib/__tests__/schedule-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSchedulePrompt } from "@/lib/ai/schedule-prompt";

describe("buildSchedulePrompt", () => {
  it("includes grass type and zip on a minimal prompt", () => {
    const prompt = buildSchedulePrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain("Grass type: bermuda");
    expect(prompt).toContain("ZIP code: 30301");
  });

  it("renames underscored grass keys", () => {
    const prompt = buildSchedulePrompt({ grassType: "tall_fescue", zipCode: "30301" });
    expect(prompt).toContain("Grass type: tall fescue");
  });

  it("includes effective watering when both watering fields are set", () => {
    const prompt = buildSchedulePrompt({
      grassType: "kentucky_bluegrass",
      zipCode: "80202",
      wateringDaysPerWeek: 3,
      wateringMinutesPerSession: 20,
    });
    expect(prompt).toContain("Current watering: 3 day(s) per week, 20 minutes per session");
  });

  it("includes effective mowing when both mowing fields are set", () => {
    const prompt = buildSchedulePrompt({
      grassType: "tall_fescue",
      zipCode: "27513",
      mowingDaysPerWeek: 1,
      mowingHeightInches: 3.5,
    });
    expect(prompt).toContain("Current mowing: 1 time(s) per week at 3.5 inches");
  });

  it("falls back to from-scratch language when watering schedule is unset", () => {
    const prompt = buildSchedulePrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toMatch(/recommend a watering schedule from scratch/i);
  });

  it("declares the strict JSON response shape", () => {
    const prompt = buildSchedulePrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain('"watering"');
    expect(prompt).toContain('"mowing"');
    expect(prompt).toContain('"deviates"');
    expect(prompt).toContain('"suggestedDaysPerWeek"');
    expect(prompt).toContain('"suggestedMinutesPerSession"');
    expect(prompt).toContain('"suggestedHeightInches"');
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npx vitest run lib/__tests__/schedule-prompt.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/ai/schedule-prompt.ts`**

```ts
export interface SchedulePromptOpts {
  grassType: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  notes?: string | null;
  zipCode: string;
  wateringDaysPerWeek?: number | null;
  wateringMinutesPerSession?: number | null;
  mowingDaysPerWeek?: number | null;
  mowingHeightInches?: number | null;
  weatherSummary?: string;
}

export function buildSchedulePrompt(opts: SchedulePromptOpts): string {
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

  const wateringContext =
    opts.wateringDaysPerWeek != null && opts.wateringMinutesPerSession != null
      ? `Current watering: ${opts.wateringDaysPerWeek} day(s) per week, ${opts.wateringMinutesPerSession} minutes per session.\nAssess whether this watering schedule suits this section. Set "watering.deviates" to true only if a meaningfully different schedule is warranted.`
      : `No watering schedule has been set for this section. Recommend a watering schedule from scratch based on grass type, soil, area, and local climate. Set "watering.deviates" to false.`;

  const mowingContext =
    opts.mowingDaysPerWeek != null && opts.mowingHeightInches != null
      ? `Current mowing: ${opts.mowingDaysPerWeek} time(s) per week at ${opts.mowingHeightInches} inches.\nAssess whether this mowing schedule suits this section. Set "mowing.deviates" to true only if a meaningfully different schedule is warranted.`
      : `No mowing schedule has been set for this section. Recommend a mowing schedule from scratch (frequency and height) based on grass type and conditions. Set "mowing.deviates" to false.`;

  return [
    sectionDetails,
    "",
    wateringContext,
    "",
    mowingContext,
    "",
    `Return JSON only — no markdown, no explanation outside the JSON:`,
    `{`,
    `  "watering": {`,
    `    "schedule": "1-2 sentence natural-language recommendation",`,
    `    "deviates": true|false,`,
    `    "suggestedDaysPerWeek": integer 1-7,`,
    `    "suggestedMinutesPerSession": integer minutes`,
    `  },`,
    `  "mowing": {`,
    `    "schedule": "1-2 sentence natural-language recommendation",`,
    `    "deviates": true|false,`,
    `    "suggestedDaysPerWeek": integer 1-7,`,
    `    "suggestedHeightInches": number inches (decimals allowed, e.g. 2.5)`,
    `  }`,
    `}`,
    `"deviates" is true only when the suggested numbers meaningfully differ from the current values. If no current schedule is set, "deviates" is false and the suggested numbers become the recommended starting point.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run prompt-builder test, confirm passing**

```bash
npx vitest run lib/__tests__/schedule-prompt.test.ts
```
Expected: 6/6 passing.

- [ ] **Step 5: Replace `generateWateringRecommendation` in `lib/claude.ts`**

Open `lib/claude.ts`. Change the import at line 4:
```ts
import { buildWateringPrompt, WateringPromptOpts } from "@/lib/ai/watering-prompt";
```
to:
```ts
import { buildSchedulePrompt, SchedulePromptOpts } from "@/lib/ai/schedule-prompt";
```

Replace the `generateWateringRecommendation` function (currently at lines 670–687) with:

```ts
export type ScheduleRecommendationResult = {
  watering: { schedule: string; deviates: boolean; suggestedDaysPerWeek: number | null; suggestedMinutesPerSession: number | null };
  mowing: { schedule: string; deviates: boolean; suggestedDaysPerWeek: number | null; suggestedHeightInches: number | null };
};

export async function generateScheduleRecommendation(
  opts: SchedulePromptOpts,
  ctx: AiCallCtx,
): Promise<ScheduleRecommendationResult> {
  const msg = await callClaude({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are an expert lawn care agronomist. Given lawn section details, provide concise watering and mowing schedule recommendations. Return valid JSON only — no markdown, no text outside the JSON object.",
    messages: [{ role: "user", content: buildSchedulePrompt(opts) }],
  }, ctx);
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`generateScheduleRecommendation: Claude returned non-JSON: ${text.slice(0, 200)}`);
  }
  const obj = parsed as Record<string, unknown>;
  const w = (obj?.watering ?? {}) as Record<string, unknown>;
  const m = (obj?.mowing ?? {}) as Record<string, unknown>;
  return {
    watering: {
      schedule: typeof w.schedule === "string" ? w.schedule : "",
      deviates: w.deviates === true,
      suggestedDaysPerWeek: typeof w.suggestedDaysPerWeek === "number" ? Math.round(w.suggestedDaysPerWeek) : null,
      suggestedMinutesPerSession: typeof w.suggestedMinutesPerSession === "number" ? Math.round(w.suggestedMinutesPerSession) : null,
    },
    mowing: {
      schedule: typeof m.schedule === "string" ? m.schedule : "",
      deviates: m.deviates === true,
      suggestedDaysPerWeek: typeof m.suggestedDaysPerWeek === "number" ? Math.round(m.suggestedDaysPerWeek) : null,
      suggestedHeightInches: typeof m.suggestedHeightInches === "number" ? m.suggestedHeightInches : null,
    },
  };
}
```

- [ ] **Step 6: Delete the old watering prompt and its test**

```bash
git rm lib/ai/watering-prompt.ts lib/__tests__/watering-prompt.test.ts
```

- [ ] **Step 7: Type check and run the full suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean and all tests pass (412 baseline minus removed watering-prompt tests, plus the new schedule-prompt tests — so 411 + (5+6) = ~422 tests). The exact count isn't load-bearing; the failure signal is what matters.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Replace watering prompt with combined schedule prompt"
```

---

### Task 4: Analyze route integration

**Files:**
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Locate the LawnAnalysis creation**

Open `app/api/analyze/route.ts`. The current code (around line 245) calls `db.lawnAnalysis.create({ data: { ... } })`. Read the surrounding 40 lines to understand the context object (`ctx`), the section, the yard, the user plan, and the weather summary that's already computed for the analysis.

- [ ] **Step 2: Add the schedule call just before `db.lawnAnalysis.create`**

Above the existing `db.lawnAnalysis.create` call, add:

```ts
import { generateScheduleRecommendation } from "@/lib/claude";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";
```
(Add the imports near the existing imports at the top of the file.)

Inside the route handler, after the analysis Claude call has succeeded and `section`, `yard`, and `user.plan` are in scope, compute the effective schedules and call the schedule prompt:

```ts
const wEff = effectiveWatering(section, yard, user.plan);
const mEff = effectiveMowing(section, yard, user.plan);

let schedule: Awaited<ReturnType<typeof generateScheduleRecommendation>> | null = null;
try {
  schedule = await generateScheduleRecommendation(
    {
      grassType: section.grassType,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture,
      notes: section.notes,
      zipCode: yard.zipCode,
      wateringDaysPerWeek: wEff.daysPerWeek,
      wateringMinutesPerSession: wEff.minutesPerSession,
      mowingDaysPerWeek: mEff.daysPerWeek,
      mowingHeightInches: mEff.heightInches,
      weatherSummary,
    },
    { userId: session.user.id, route: "/api/analyze" },
  );
} catch (err) {
  // Schedule call is best-effort. If it fails we still save the analysis with
  // schedule fields null, and the section page renders a passive empty state.
  logger.warn("analyze: schedule call failed", { err: err instanceof Error ? err.message : String(err) });
}
```

Then in the `db.lawnAnalysis.create({ data: { ... } })` call, include the new fields:

```ts
const analysis = await db.lawnAnalysis.create({
  data: {
    yardSectionId: section.id,
    imageUrls,
    healthScore,
    issues,
    summary,
    rawResponse,
    // schedule fields — null when schedule call failed or returned malformed JSON
    wateringSchedule: schedule?.watering.schedule ?? null,
    wateringDeviates: schedule?.watering.deviates ?? null,
    wateringSuggestedDaysPerWeek: schedule?.watering.suggestedDaysPerWeek ?? null,
    wateringSuggestedMinutesPerSession: schedule?.watering.suggestedMinutesPerSession ?? null,
    mowingSchedule: schedule?.mowing.schedule ?? null,
    mowingDeviates: schedule?.mowing.deviates ?? null,
    mowingSuggestedDaysPerWeek: schedule?.mowing.suggestedDaysPerWeek ?? null,
    mowingSuggestedHeightInches: schedule?.mowing.suggestedHeightInches ?? null,
    // ...other existing fields stay the same
  },
});
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: clean. The new fields on `db.lawnAnalysis.create({ data })` align with the Prisma schema after Task 1's migration.

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```
Expected: all tests pass. If any existing test of the analyze route depends on the response shape, update it to assert the new fields are present (or null).

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "Persist watering and mowing schedule recommendation on each analysis"
```

---

### Task 5: Watering apply and dismiss endpoints

**Files:**
- Create: `lib/schedules/apply-handler.ts`
- Create: `app/api/sections/[sectionId]/watering/apply/route.ts`
- Create: `app/api/sections/[sectionId]/watering/dismiss/route.ts`
- Create: `lib/__tests__/apply-handler.test.ts`
- Create: integration tests under `app/api/sections/__tests__/watering.test.ts` (or wherever existing integration tests live — match repo convention)

- [ ] **Step 1: Identify existing integration test location**

```bash
find . -name "*.test.ts" -not -path "./node_modules/*" -not -path "./.next/*" | xargs grep -l "db.lawnAnalysis.create\|integration" 2>/dev/null | head -3
```
Look at the file structure to match the existing pattern for integration tests. Use that pattern for the new tests below.

- [ ] **Step 2: Write apply-handler signature + tests first**

Create `lib/__tests__/apply-handler.test.ts`. This tests the pure decision function — which target gets written based on plan:

```ts
import { describe, it, expect } from "vitest";
import { applyTargetForPlan } from "@/lib/schedules/apply-handler";

describe("applyTargetForPlan", () => {
  it("returns 'yard' for home_basic", () => {
    expect(applyTargetForPlan("home_basic")).toBe("yard");
  });
  it("returns 'yard' for trial", () => {
    expect(applyTargetForPlan("trial")).toBe("yard");
  });
  it("returns 'section' for home_plus", () => {
    expect(applyTargetForPlan("home_plus")).toBe("section");
  });
  it("returns 'section' for professional", () => {
    expect(applyTargetForPlan("professional")).toBe("section");
  });
  it("returns 'yard' for null", () => {
    expect(applyTargetForPlan(null)).toBe("yard");
  });
});
```

- [ ] **Step 3: Run the test, confirm failure**

```bash
npx vitest run lib/__tests__/apply-handler.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the apply handler**

Create `lib/schedules/apply-handler.ts`:

```ts
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

export type ApplyTarget = "yard" | "section";

export function applyTargetForPlan(plan: string | null): ApplyTarget {
  return canSetSectionSchedule(plan) ? "section" : "yard";
}
```

- [ ] **Step 5: Run the test, confirm passing**

```bash
npx vitest run lib/__tests__/apply-handler.test.ts
```
Expected: 5/5 passing.

- [ ] **Step 6: Create the watering apply route**

Create `app/api/sections/[sectionId]/watering/apply/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyTargetForPlan } from "@/lib/schedules/apply-handler";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitWateringApplied } from "@/lib/observability/events";

export const POST = withAxiom(async (req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { include: { user: { select: { id: true, plan: true } } } } },
  });
  if (!section || section.yard.user.id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to apply" }, { status: 404 });

  const days = latest.wateringSuggestedDaysPerWeek;
  const mins = latest.wateringSuggestedMinutesPerSession;
  if (days == null || mins == null) {
    return NextResponse.json({ error: "No structured suggestion available" }, { status: 400 });
  }

  const target = applyTargetForPlan(section.yard.user.plan);
  await db.$transaction(async (tx) => {
    if (target === "yard") {
      await tx.yard.update({
        where: { id: section.yardId },
        data: { wateringDaysPerWeek: days, wateringMinutesPerSession: mins },
      });
    } else {
      await tx.yardSection.update({
        where: { id: sectionId },
        data: { wateringDaysPerWeek: days, wateringMinutesPerSession: mins },
      });
    }
    await tx.lawnAnalysis.update({
      where: { id: latest.id },
      data: { wateringRecommendationDismissedAt: null },
    });
  });

  emitWateringApplied({ sectionId, plan: section.yard.user.plan, target });
  logger.info("watering applied", { sectionId, target });

  return NextResponse.json({ target, daysPerWeek: days, minutesPerSession: mins });
});
```

Note: `emitWateringApplied` doesn't exist yet — it's added in Task 7. For now this will fail to compile; that's OK because Task 7 introduces it.

- [ ] **Step 7: Create the watering dismiss route**

Create `app/api/sections/[sectionId]/watering/dismiss/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom } from "@/lib/observability/logger";
import { emitWateringDismissed } from "@/lib/observability/events";

export const POST = withAxiom(async (_req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { select: { userId: true } } },
  });
  if (!section || section.yard.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to dismiss" }, { status: 404 });
  if (latest.wateringDeviates !== true) {
    return NextResponse.json({ error: "Nothing to dismiss" }, { status: 409 });
  }

  await db.lawnAnalysis.update({
    where: { id: latest.id },
    data: { wateringRecommendationDismissedAt: new Date() },
  });

  emitWateringDismissed({ sectionId });
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 8: Type check (expect known failure on emit helpers)**

```bash
npx tsc --noEmit 2>&1 | grep -v "emitWatering" | tail -10
```
Expected: only the unresolved `emitWatering*` symbols. They land in Task 7.

- [ ] **Step 9: Commit (defer running tests until Task 7 lands the missing helpers)**

```bash
git add lib/schedules/apply-handler.ts lib/__tests__/apply-handler.test.ts app/api/sections/
git commit -m "Add watering apply and dismiss endpoints"
```

---

### Task 6: Mowing apply and dismiss endpoints

**Files:**
- Create: `app/api/sections/[sectionId]/mowing/apply/route.ts`
- Create: `app/api/sections/[sectionId]/mowing/dismiss/route.ts`

- [ ] **Step 1: Create the mowing apply route**

Create `app/api/sections/[sectionId]/mowing/apply/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyTargetForPlan } from "@/lib/schedules/apply-handler";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitMowingApplied } from "@/lib/observability/events";

export const POST = withAxiom(async (req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { include: { user: { select: { id: true, plan: true } } } } },
  });
  if (!section || section.yard.user.id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to apply" }, { status: 404 });

  const days = latest.mowingSuggestedDaysPerWeek;
  const height = latest.mowingSuggestedHeightInches;
  if (days == null || height == null) {
    return NextResponse.json({ error: "No structured suggestion available" }, { status: 400 });
  }

  const target = applyTargetForPlan(section.yard.user.plan);
  await db.$transaction(async (tx) => {
    if (target === "yard") {
      await tx.yard.update({
        where: { id: section.yardId },
        data: { mowingDaysPerWeek: days, mowingHeightInches: height },
      });
    } else {
      await tx.yardSection.update({
        where: { id: sectionId },
        data: { mowingDaysPerWeek: days, mowingHeightInches: height },
      });
    }
    await tx.lawnAnalysis.update({
      where: { id: latest.id },
      data: { mowingRecommendationDismissedAt: null },
    });
  });

  emitMowingApplied({ sectionId, plan: section.yard.user.plan, target });
  logger.info("mowing applied", { sectionId, target });

  return NextResponse.json({ target, daysPerWeek: days, heightInches: height });
});
```

- [ ] **Step 2: Create the mowing dismiss route**

Create `app/api/sections/[sectionId]/mowing/dismiss/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom } from "@/lib/observability/logger";
import { emitMowingDismissed } from "@/lib/observability/events";

export const POST = withAxiom(async (_req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { select: { userId: true } } },
  });
  if (!section || section.yard.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No analysis to dismiss" }, { status: 404 });
  if (latest.mowingDeviates !== true) {
    return NextResponse.json({ error: "Nothing to dismiss" }, { status: 409 });
  }

  await db.lawnAnalysis.update({
    where: { id: latest.id },
    data: { mowingRecommendationDismissedAt: new Date() },
  });

  emitMowingDismissed({ sectionId });
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 3: Commit (still defer test runs until Task 7)**

```bash
git add app/api/sections/[sectionId]/mowing/
git commit -m "Add mowing apply and dismiss endpoints"
```

---

### Task 7: Telemetry events

**Files:**
- Modify: `lib/observability/events.ts`
- Modify: `lib/observability/__tests__/events.test.ts` (add tests for new emitters)
- Modify: `app/api/analyze/route.ts` (call `emitWateringRecommended` + `emitMowingRecommended` after a successful schedule call)

- [ ] **Step 1: Inspect existing event emitter patterns**

Open `lib/observability/events.ts` and read it. Match the style of the existing `emitAi*` helpers when adding the new ones.

- [ ] **Step 2: Add six new emitters**

In `lib/observability/events.ts`, after the existing emitter helpers add:

```ts
type Plan = string | null;

export function emitWateringRecommended(args: { sectionId: string; deviates: boolean; plan: Plan }) {
  logger.info("watering.recommended", { ...args, kind: "watering.recommended", ...commonFields() });
}

export function emitWateringApplied(args: { sectionId: string; plan: Plan; target: "yard" | "section" }) {
  logger.info("watering.applied", { ...args, kind: "watering.applied", ...commonFields() });
}

export function emitWateringDismissed(args: { sectionId: string }) {
  logger.info("watering.dismissed", { ...args, kind: "watering.dismissed", ...commonFields() });
}

export function emitMowingRecommended(args: { sectionId: string; deviates: boolean; plan: Plan }) {
  logger.info("mowing.recommended", { ...args, kind: "mowing.recommended", ...commonFields() });
}

export function emitMowingApplied(args: { sectionId: string; plan: Plan; target: "yard" | "section" }) {
  logger.info("mowing.applied", { ...args, kind: "mowing.applied", ...commonFields() });
}

export function emitMowingDismissed(args: { sectionId: string }) {
  logger.info("mowing.dismissed", { ...args, kind: "mowing.dismissed", ...commonFields() });
}
```

(The existing file already imports `logger` and defines `commonFields`. Reuse them as-is. Do not change the existing AI emitters.)

- [ ] **Step 3: Add unit tests for the new emitters**

Append to `lib/observability/__tests__/events.test.ts`:

```ts
import {
  emitWateringRecommended, emitWateringApplied, emitWateringDismissed,
  emitMowingRecommended, emitMowingApplied, emitMowingDismissed,
} from "@/lib/observability/events";

describe("schedule recommendation emitters", () => {
  it("emits watering.recommended with payload", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitWateringRecommended({ sectionId: "sec_1", deviates: true, plan: "home_plus" });
    expect(spy).toHaveBeenCalledWith(
      "watering.recommended",
      expect.objectContaining({ kind: "watering.recommended", sectionId: "sec_1", deviates: true, plan: "home_plus" }),
    );
    spy.mockRestore();
  });

  it("emits watering.applied with target", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitWateringApplied({ sectionId: "sec_1", plan: "home_basic", target: "yard" });
    expect(spy).toHaveBeenCalledWith(
      "watering.applied",
      expect.objectContaining({ kind: "watering.applied", target: "yard" }),
    );
    spy.mockRestore();
  });

  it("emits watering.dismissed", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitWateringDismissed({ sectionId: "sec_1" });
    expect(spy).toHaveBeenCalledWith("watering.dismissed", expect.objectContaining({ kind: "watering.dismissed", sectionId: "sec_1" }));
    spy.mockRestore();
  });

  it("emits mowing.recommended", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitMowingRecommended({ sectionId: "sec_1", deviates: false, plan: "professional" });
    expect(spy).toHaveBeenCalledWith("mowing.recommended", expect.objectContaining({ kind: "mowing.recommended", deviates: false }));
    spy.mockRestore();
  });

  it("emits mowing.applied with target", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitMowingApplied({ sectionId: "sec_1", plan: "home_plus", target: "section" });
    expect(spy).toHaveBeenCalledWith("mowing.applied", expect.objectContaining({ target: "section" }));
    spy.mockRestore();
  });

  it("emits mowing.dismissed", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitMowingDismissed({ sectionId: "sec_1" });
    expect(spy).toHaveBeenCalledWith("mowing.dismissed", expect.objectContaining({ kind: "mowing.dismissed" }));
    spy.mockRestore();
  });
});
```

Make sure `vi` and `logger` are imported at the top of the file already; otherwise add them.

- [ ] **Step 4: Wire `emitWateringRecommended` and `emitMowingRecommended` into the analyze route**

In `app/api/analyze/route.ts`, immediately after the `db.lawnAnalysis.create` from Task 4 succeeds and `schedule` is non-null, add:

```ts
import { emitWateringRecommended, emitMowingRecommended } from "@/lib/observability/events";

// after the analysis row is created:
if (schedule) {
  emitWateringRecommended({ sectionId: section.id, deviates: schedule.watering.deviates, plan: user.plan });
  emitMowingRecommended({ sectionId: section.id, deviates: schedule.mowing.deviates, plan: user.plan });
}
```

- [ ] **Step 5: Run the full suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean and all tests pass. The previous tasks' apply/dismiss endpoints now type-check because the emitter symbols exist.

- [ ] **Step 6: Commit**

```bash
git add lib/observability/ app/api/analyze/route.ts
git commit -m "Emit schedule recommendation telemetry events"
```

---

### Task 8: ScheduleRecommendationCard component

**Files:**
- Create: `components/sections/ScheduleRecommendationCard.tsx`
- Create: `components/sections/__tests__/ScheduleRecommendationCard.test.tsx`

- [ ] **Step 1: Look at an existing card component to match style**

```bash
ls components/sections/
```
Read `components/sections/PersonalizedRemindersCard.tsx` to match the visual idiom (Tailwind classes, header layout, button styling).

- [ ] **Step 2: Write a component test for state B (no deviation)**

Create `components/sections/__tests__/ScheduleRecommendationCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScheduleRecommendationCard } from "@/components/sections/ScheduleRecommendationCard";

const baseAnalysis = {
  id: "an_1",
  wateringSchedule: "Your 3x/week, 20 min schedule works well.",
  wateringDeviates: false,
  wateringSuggestedDaysPerWeek: 3,
  wateringSuggestedMinutesPerSession: 20,
  wateringRecommendationDismissedAt: null,
  mowingSchedule: null,
  mowingDeviates: null,
  mowingSuggestedDaysPerWeek: null,
  mowingSuggestedHeightInches: null,
  mowingRecommendationDismissedAt: null,
};

const baseEffective = { daysPerWeek: 3, minutesPerSession: 20, heightInches: null };

describe("ScheduleRecommendationCard - watering", () => {
  it("state A: shows empty state when no analysis", () => {
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={null} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByText(/run an analysis/i)).toBeInTheDocument();
  });

  it("state B: shows neutral confirmation when not deviating", () => {
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={baseAnalysis} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByText(/works well/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ignore/i })).not.toBeInTheDocument();
  });

  it("state C: shows Apply and Ignore when deviating and not dismissed", () => {
    const dev = { ...baseAnalysis, wateringDeviates: true, wateringSuggestedMinutesPerSession: 15 };
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={dev} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ignore/i })).toBeInTheDocument();
  });

  it("state D: shows banner when deviating and dismissed", () => {
    const dev = { ...baseAnalysis, wateringDeviates: true, wateringSuggestedMinutesPerSession: 15, wateringRecommendationDismissedAt: new Date() };
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={dev} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByText(/schedule override/i)).toBeInTheDocument();
  });

  it("collapses state D to B when effective schedule matches saved suggestion", () => {
    // User manually edited yard to match the suggestion; even though dismissed, stillDeviates is false.
    const dev = { ...baseAnalysis, wateringDeviates: true, wateringSuggestedDaysPerWeek: 3, wateringSuggestedMinutesPerSession: 15, wateringRecommendationDismissedAt: new Date() };
    const matching = { daysPerWeek: 3, minutesPerSession: 15, heightInches: null };
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={dev} effective={matching} plan="home_basic" />);
    expect(screen.queryByText(/schedule override/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test, confirm failure**

```bash
npx vitest run components/sections/__tests__/ScheduleRecommendationCard.test.tsx
```
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the component**

Create `components/sections/ScheduleRecommendationCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

type Kind = "watering" | "mowing";

type AnalysisShape = {
  id: string;
  wateringSchedule: string | null;
  wateringDeviates: boolean | null;
  wateringSuggestedDaysPerWeek: number | null;
  wateringSuggestedMinutesPerSession: number | null;
  wateringRecommendationDismissedAt: Date | string | null;
  mowingSchedule: string | null;
  mowingDeviates: boolean | null;
  mowingSuggestedDaysPerWeek: number | null;
  mowingSuggestedHeightInches: number | null;
  mowingRecommendationDismissedAt: Date | string | null;
};

type Effective = {
  daysPerWeek: number | null;
  minutesPerSession: number | null;
  heightInches: number | null;
};

interface Props {
  kind: Kind;
  sectionId: string;
  latestAnalysis: AnalysisShape | null;
  effective: Effective;
  plan: string | null;
}

export function ScheduleRecommendationCard({ kind, sectionId, latestAnalysis, effective, plan }: Props) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!latestAnalysis) {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-white">
        <h3 className="font-semibold mb-1">{kind === "watering" ? "Watering" : "Mowing"}</h3>
        <p className="text-sm text-gray-500">
          Run an analysis to see your {kind} recommendation.{" "}
          <Link href="/analyze" className="text-green-600 hover:underline">Analyze now</Link>
        </p>
      </div>
    );
  }

  const schedule = kind === "watering" ? latestAnalysis.wateringSchedule : latestAnalysis.mowingSchedule;
  const deviates = kind === "watering" ? latestAnalysis.wateringDeviates : latestAnalysis.mowingDeviates;
  const suggestedDays = kind === "watering" ? latestAnalysis.wateringSuggestedDaysPerWeek : latestAnalysis.mowingSuggestedDaysPerWeek;
  const suggestedSecond = kind === "watering" ? latestAnalysis.wateringSuggestedMinutesPerSession : latestAnalysis.mowingSuggestedHeightInches;
  const dismissedAt = kind === "watering" ? latestAnalysis.wateringRecommendationDismissedAt : latestAnalysis.mowingRecommendationDismissedAt;
  const currentDays = effective.daysPerWeek;
  const currentSecond = kind === "watering" ? effective.minutesPerSession : effective.heightInches;

  const stillDeviates = deviates === true
    && (suggestedDays !== currentDays || suggestedSecond !== currentSecond);

  // State B - no deviation (or recomputed away)
  if (!stillDeviates) {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-white">
        <h3 className="font-semibold mb-1">{kind === "watering" ? "Watering" : "Mowing"}</h3>
        {schedule && <p className="text-sm text-gray-700">{schedule}</p>}
      </div>
    );
  }

  // State D - dismissed, collapsed
  if (dismissedAt && !expanded) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          {kind === "watering" ? "Watering" : "Mowing"} schedule override — not following our guidance.
          <button onClick={() => setExpanded(true)} className="ml-2 underline">Show suggestion</button>
        </p>
      </div>
    );
  }

  // State C - deviating, action buttons
  const formatSecond = (v: number | null) =>
    kind === "watering" ? `${v ?? "—"} min/session` : `${v ?? "—"} in`;
  const apply = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/${kind}/apply`, { method: "POST" });
      if (res.ok) location.reload();
    } finally { setBusy(false); }
  };
  const dismiss = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/${kind}/dismiss`, { method: "POST" });
      if (res.ok) location.reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="font-semibold mb-1 text-amber-900">
        This section may need a different {kind} schedule
      </h3>
      {schedule && <p className="text-sm text-amber-900 mb-3">{schedule}</p>}
      <div className="grid grid-cols-2 gap-3 text-sm text-amber-900 mb-4">
        <div>
          <div className="text-xs text-amber-700">Current</div>
          <div>{currentDays ?? "—"} days/week, {formatSecond(currentSecond)}</div>
        </div>
        <div>
          <div className="text-xs text-amber-700">Suggested</div>
          <div>{suggestedDays ?? "—"} days/week, {formatSecond(suggestedSecond)}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={apply} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          Apply suggestion
        </button>
        <button disabled={busy} onClick={dismiss} className="text-amber-900 underline px-3 py-2 text-sm disabled:opacity-50">
          Ignore
        </button>
      </div>
      {plan === "home_basic" && (
        <p className="text-xs text-amber-700 mt-3">Applies to your whole yard. Upgrade to Home Plus to override per section.</p>
      )}
    </div>
  );
}
```

(The Apply button does not show a confirmation dialog in v1 — a confirmation `window.confirm` could be added if the team wants it. The plan-aware footnote already disambiguates yard-wide vs section scope for Home Basic users.)

- [ ] **Step 5: Run the component tests, confirm passing**

```bash
npx vitest run components/sections/__tests__/ScheduleRecommendationCard.test.tsx
```
Expected: 5/5 passing.

- [ ] **Step 6: Commit**

```bash
git add components/sections/
git commit -m "Add ScheduleRecommendationCard for watering and mowing"
```

---

### Task 9: Section detail page integration

**Files:**
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`

- [ ] **Step 1: Read the page**

```bash
wc -l "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
```
Open it. Identify where the existing cards (health, watering placeholder, tasks) render. The two new ScheduleRecommendationCards go between the health card and the tasks section.

- [ ] **Step 2: Load the latest analysis with the new fields**

In the page's data-fetching block, ensure the section query (or a sibling query) loads the latest analysis. If not already loaded, add:

```ts
const latestAnalysis = await db.lawnAnalysis.findFirst({
  where: { yardSectionId: section.id },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    wateringSchedule: true,
    wateringDeviates: true,
    wateringSuggestedDaysPerWeek: true,
    wateringSuggestedMinutesPerSession: true,
    wateringRecommendationDismissedAt: true,
    mowingSchedule: true,
    mowingDeviates: true,
    mowingSuggestedDaysPerWeek: true,
    mowingSuggestedHeightInches: true,
    mowingRecommendationDismissedAt: true,
  },
});
```

- [ ] **Step 3: Compute the effective schedules and render two cards**

Add the imports:
```ts
import { ScheduleRecommendationCard } from "@/components/sections/ScheduleRecommendationCard";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";
```

In the page body where the existing schedule placeholder lives (or beneath the health card), add:

```tsx
{(() => {
  const wEff = effectiveWatering(section, section.yard, user.plan);
  const mEff = effectiveMowing(section, section.yard, user.plan);
  return (
    <>
      <ScheduleRecommendationCard
        kind="watering"
        sectionId={section.id}
        latestAnalysis={latestAnalysis}
        effective={{ daysPerWeek: wEff.daysPerWeek, minutesPerSession: wEff.minutesPerSession, heightInches: null }}
        plan={user.plan}
      />
      <ScheduleRecommendationCard
        kind="mowing"
        sectionId={section.id}
        latestAnalysis={latestAnalysis}
        effective={{ daysPerWeek: mEff.daysPerWeek, minutesPerSession: null, heightInches: mEff.heightInches }}
        plan={user.plan}
      />
    </>
  );
})()}
```

If the page already shows a watering/mowing placeholder, remove it.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
git commit -m "Render watering and mowing recommendation cards on section page"
```

---

### Task 10: Yard edit form mowing inputs

**Files:**
- Modify: `components/yard/YardEditForm.tsx`

- [ ] **Step 1: Read the form**

Open `components/yard/YardEditForm.tsx`. Find the existing `wateringDaysPerWeek` and `wateringMinutesPerSession` inputs and the surrounding form group.

- [ ] **Step 2: Add two symmetric mowing inputs**

Below the existing watering inputs, add:

```tsx
<div className="grid grid-cols-2 gap-3">
  <NumberInput
    label="Mowing days per week"
    min={1}
    max={7}
    value={mowingDaysPerWeek}
    onChange={(v) => setValue("mowingDaysPerWeek", v)}
  />
  <NumberInput
    label="Mowing height (inches)"
    min={1}
    max={5}
    step={0.5}
    value={mowingHeightInches}
    onChange={(v) => setValue("mowingHeightInches", v)}
  />
</div>
```

Replace `NumberInput` with whatever the existing watering inputs use (likely a shared input component). Match the existing pattern verbatim.

Update the form's TypeScript type to include `mowingDaysPerWeek?: number` and `mowingHeightInches?: number`. Update the form submit handler to include the new fields in its PATCH body.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/yard/YardEditForm.tsx
git commit -m "Add mowing schedule inputs to yard edit form"
```

---

### Task 11: Section edit form plan-gated overrides

**Files:**
- Modify: `components/yard/SectionForm.tsx`

- [ ] **Step 1: Read the form**

Open `components/yard/SectionForm.tsx`. Find the existing `wateringSchedule` and `mowingSchedule` free-text fields (around line 313–327).

- [ ] **Step 2: Add the plan-gated structured overrides**

Above the existing free-text fields, add a block that's only rendered when `canSetSectionSchedule(plan)` is true. The form receives `plan: string | null` as a prop (or via context — match the existing pattern):

```tsx
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

// inside the JSX, above the free-text "your own notes" section:
{canSetSectionSchedule(plan) ? (
  <div className="grid grid-cols-2 gap-3">
    <NumberInput
      label="Watering days per week (override)"
      min={1}
      max={7}
      placeholder={yardWateringDaysPerWeek?.toString() ?? "—"}
      value={watch("wateringDaysPerWeek")}
      onChange={(v) => setValue("wateringDaysPerWeek", v)}
    />
    <NumberInput
      label="Watering minutes per session (override)"
      min={1}
      placeholder={yardWateringMinutesPerSession?.toString() ?? "—"}
      value={watch("wateringMinutesPerSession")}
      onChange={(v) => setValue("wateringMinutesPerSession", v)}
    />
    <NumberInput
      label="Mowing days per week (override)"
      min={1}
      max={7}
      placeholder={yardMowingDaysPerWeek?.toString() ?? "—"}
      value={watch("mowingDaysPerWeek")}
      onChange={(v) => setValue("mowingDaysPerWeek", v)}
    />
    <NumberInput
      label="Mowing height in inches (override)"
      min={1}
      max={5}
      step={0.5}
      placeholder={yardMowingHeightInches?.toString() ?? "—"}
      value={watch("mowingHeightInches")}
      onChange={(v) => setValue("mowingHeightInches", v)}
    />
  </div>
) : (
  <p className="text-sm text-gray-500">
    Watering and mowing schedules are set at the yard level on your current plan.{" "}
    <Link href={`/yard/${yardId}/edit`} className="text-green-600 hover:underline">Edit yard schedule</Link>
  </p>
)}
```

Update the form's TypeScript type to include the four new optional fields. Update the submit handler to include them in its PATCH body. The form must receive `yardId` and the yard's current `watering*` and `mowing*` fields as props for the placeholders — pass them from the section detail page.

- [ ] **Step 3: Type check and run full suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean and all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/yard/SectionForm.tsx
git commit -m "Add plan-gated watering and mowing overrides to section form"
```

---

### Task 12: Final verification (manual + automated)

This task confirms the whole feature works end-to-end. No commits expected.

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: Test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 3: Migration sanity check**

```bash
npx prisma migrate status
```
Expected: "Database schema is up to date!".

- [ ] **Step 4: Manual smoke walkthrough**

```bash
npm run dev
```
With a Home Basic test user:
1. Edit a yard — confirm mowing inputs appear next to watering inputs.
2. Edit a section — confirm the structured override block is hidden, replaced by the "set at the yard level" message linking to the yard edit form.
3. Run an analysis on a section. After completion, navigate to the section detail page and confirm two new cards appear — Watering and Mowing.
4. If the AI flagged a deviation, confirm the amber card with Apply/Ignore renders. Click Ignore — confirm it collapses to the dismissed banner.
5. Click "Show suggestion" — confirm the card expands back. Click Apply — confirm the page reloads, the yard's structured watering/mowing fields are updated, and the card moves to the neutral state.

With a Home Plus test user:
1. Edit a section — confirm the override block IS visible.
2. Set an override that differs from the yard default.
3. Run an analysis. Confirm the Watering card's "Current" line reflects the section override, not the yard default.
4. Click Apply on a deviating suggestion. Confirm the section's override is updated (yard fields stay unchanged).

- [ ] **Step 5: No commit needed**

This task is verification only.

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Implementation task |
|---|---|
| Data model: LawnAnalysis fields | Task 1 |
| Data model: Yard mowing fields | Task 1 |
| Data model: YardSection override fields | Task 1 |
| Plan gating helper | Task 2 |
| Effective schedule helper | Task 2 |
| Prompt update: buildSchedulePrompt | Task 3 |
| Claude call: generateScheduleRecommendation | Task 3 |
| Analyze route integration | Task 4 |
| Watering apply/dismiss endpoints | Task 5 |
| Mowing apply/dismiss endpoints | Task 6 |
| Telemetry events | Task 7 |
| ScheduleRecommendationCard component | Task 8 |
| Section detail page integration | Task 9 |
| Yard edit form mowing inputs | Task 10 |
| Section edit form plan-gated overrides | Task 11 |
| End-to-end manual verification | Task 12 |

**Placeholder scan:** No TBD/TODO. Every code step contains the literal code to be written.

**Type consistency:**
- `applyTargetForPlan` returns `"yard" | "section"` (Task 5); the emitter signatures use `target: "yard" | "section"` (Task 7). Matches.
- `ScheduleRecommendationResult` shape (Task 3) is consumed by the analyze route (Task 4) via `schedule?.watering.deviates` etc. Field names match.
- The `AnalysisShape` in `ScheduleRecommendationCard` (Task 8) matches the Prisma schema columns added in Task 1.
- `effective` prop shape on the card has `daysPerWeek | minutesPerSession | heightInches` — mowing cards leave `minutesPerSession: null` and watering cards leave `heightInches: null`, matching how the page wires them up in Task 9.

**Risks for the implementing engineer:**
- Task 5 commits with `tsc` errors on the unresolved emitter imports. Task 7 fixes them. Don't dispatch a separate "fix tsc" task in between — the sequence is intentional.
- The analyze route (Task 4) is non-trivial. Read the surrounding context carefully before editing — the existing analysis Claude call, the transaction structure, and where the user.plan is in scope are all important.
- The exact prop name for the existing `NumberInput` (Tasks 10 and 11) may differ — match the file's own existing usage rather than the placeholder above.
