# Personalized Schedule during analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make schedule setup a first-class part of the analyze flow by adding a `PersonalizedScheduleCard` to `AnalysisResults` that pre-fills via deterministic day distribution, saves through a combined endpoint, and falls back gracefully when the schedule Claude call fails.

**Architecture:** A pure `distributeDays` helper turns AI's count into specific days. The analyze route gets a 2-attempt retry around `generateScheduleRecommendation` and extends its response with the user's plan and the current effective schedule. A new client component renders three modes (picker, confirmation, placeholder) based on the analysis row and effective schedule. A single combined endpoint writes both watering and mowing in one transaction.

**Tech Stack:** Next.js 16 App Router, Prisma 5, Vitest, Tailwind, React Hook Form (existing patterns).

**Spec:** [`docs/superpowers/specs/2026-06-22-personalized-schedule-during-analysis-design.md`](../specs/2026-06-22-personalized-schedule-during-analysis-design.md)

---

## File Structure

**New files:**
- `lib/schedules/distribute-days.ts` — pure day-distribution functions
- `lib/__tests__/distribute-days.test.ts`
- `app/api/sections/[sectionId]/schedule/apply/route.ts` — combined save endpoint
- `app/api/sections/[sectionId]/schedule/apply/__tests__/route.test.ts`
- `components/analysis/PersonalizedScheduleCard.tsx`
- `components/analysis/__tests__/PersonalizedScheduleCard.test.tsx`

**Modified files:**
- `app/api/analyze/route.ts` — 2-attempt retry + extend response with `plan` and `effective`
- `app/(dashboard)/analyze/AnalyzeClient.tsx` — destructure `plan` and `effective` from response, pass to `AnalysisResults`
- `components/analysis/AnalysisResults.tsx` — accept new optional props, render `PersonalizedScheduleCard` after existing sections
- `components/yard/SectionForm.tsx` — rename heading, remove footer line
- `components/sections/ScheduleRecommendationCard.tsx` — state B enhancement: "Set up watering/mowing" button when effective is empty

---

## Pre-flight

- [ ] **Step 0: Confirm clean state**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (allow the existing `public/ya-logo-old.af` untracked artifact).

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3
```
Expected: clean and 518/518 tests passing (the baseline after the prior plan).

---

### Task 1: Day distribution helper

A pure helper that turns AI's day-per-week count into a specific list of days. Reused by the analyze-page picker (default chip selection) and the section-page card's "Set up" button.

**Files:**
- Create: `lib/schedules/distribute-days.ts`
- Create: `lib/__tests__/distribute-days.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/distribute-days.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { distributeWateringDays, distributeMowingDays } from "@/lib/schedules/distribute-days";

describe("distributeWateringDays", () => {
  it("returns empty for null", () => {
    expect(distributeWateringDays(null)).toEqual([]);
  });
  it("returns empty for 0 or negative", () => {
    expect(distributeWateringDays(0)).toEqual([]);
    expect(distributeWateringDays(-1)).toEqual([]);
  });
  it("returns Wed for 1 day", () => {
    expect(distributeWateringDays(1)).toEqual(["Wed"]);
  });
  it("returns Mon,Thu for 2 days", () => {
    expect(distributeWateringDays(2)).toEqual(["Mon", "Thu"]);
  });
  it("returns Mon,Wed,Fri for 3 days", () => {
    expect(distributeWateringDays(3)).toEqual(["Mon", "Wed", "Fri"]);
  });
  it("returns Mon,Tue,Thu,Sat for 4 days", () => {
    expect(distributeWateringDays(4)).toEqual(["Mon", "Tue", "Thu", "Sat"]);
  });
  it("returns weekdays for 5 days", () => {
    expect(distributeWateringDays(5)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });
  it("returns Mon-Sat for 6 days", () => {
    expect(distributeWateringDays(6)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
  it("returns all days for 7", () => {
    expect(distributeWateringDays(7)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
  it("clamps out-of-range high values to empty", () => {
    expect(distributeWateringDays(8)).toEqual([]);
  });
});

describe("distributeMowingDays", () => {
  it("returns empty for null or 0", () => {
    expect(distributeMowingDays(null)).toEqual([]);
    expect(distributeMowingDays(0)).toEqual([]);
  });
  it("returns Sat for 1 day (weekend bias)", () => {
    expect(distributeMowingDays(1)).toEqual(["Sat"]);
  });
  it("returns Wed,Sat for 2 days", () => {
    expect(distributeMowingDays(2)).toEqual(["Wed", "Sat"]);
  });
  it("returns Mon,Wed,Sat for 3 days", () => {
    expect(distributeMowingDays(3)).toEqual(["Mon", "Wed", "Sat"]);
  });
  it("returns Mon,Wed,Fri,Sat for 4 days", () => {
    expect(distributeMowingDays(4)).toEqual(["Mon", "Wed", "Fri", "Sat"]);
  });
  it("returns Mon-Sat for 6 days", () => {
    expect(distributeMowingDays(6)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run lib/__tests__/distribute-days.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/schedules/distribute-days.ts`**

```ts
const WATERING: Record<number, string[]> = {
  1: ["Wed"],
  2: ["Mon", "Thu"],
  3: ["Mon", "Wed", "Fri"],
  4: ["Mon", "Tue", "Thu", "Sat"],
  5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const MOWING: Record<number, string[]> = {
  1: ["Sat"],
  2: ["Wed", "Sat"],
  3: ["Mon", "Wed", "Sat"],
  4: ["Mon", "Wed", "Fri", "Sat"],
  5: ["Mon", "Tue", "Thu", "Fri", "Sat"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function distributeWateringDays(count: number | null): string[] {
  if (count == null || count < 1 || count > 7) return [];
  return WATERING[count];
}

export function distributeMowingDays(count: number | null): string[] {
  if (count == null || count < 1 || count > 7) return [];
  return MOWING[count];
}
```

- [ ] **Step 4: Run tests, confirm passing**

```bash
npx vitest run lib/__tests__/distribute-days.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/schedules/distribute-days.ts lib/__tests__/distribute-days.test.ts
git commit -m "Add deterministic day distribution for AI schedule counts"
```

---

### Task 2: Analyze route retry + response extension

Wrap `generateScheduleRecommendation` in a 2-attempt loop with 500ms backoff so transient Claude failures don't leave the picker with null suggestions. Extend the route's JSON response to include `plan` and `effective` so the picker on AnalyzeClient has what it needs without a second round-trip.

**Files:**
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Find the schedule call and the response**

```bash
grep -n "generateScheduleRecommendation\|NextResponse.json({ analysis" app/api/analyze/route.ts
```
Expected: the call site (around line 211) and the final 200 return (around line 332).

- [ ] **Step 2: Replace the schedule call with a retry loop**

Find this block in `app/api/analyze/route.ts`:

```ts
let schedule: Awaited<ReturnType<typeof generateScheduleRecommendation>> | null = null;
try {
  schedule = await generateScheduleRecommendation(
    {
      // ...opts
    },
    { userId: session.user.id, feature: "schedule" },
  );
} catch (err) {
  logger.warn("analyze: schedule call failed", { /* ... */ });
}
```

Replace the body with a 2-attempt loop. Keep the same opts and ctx. Final code:

```ts
let schedule: Awaited<ReturnType<typeof generateScheduleRecommendation>> | null = null;
const scheduleOpts = {
  grassType: section.grassType,
  areaType: section.areaType,
  yardSizeSqft: section.yardSizeSqft,
  soilPh: section.soilPh,
  soilMoisture: section.soilMoisture,
  notes: section.notes,
  zipCode: section.yard.zipCode,
  wateringDaysPerWeek: wEff.days.length > 0 ? wEff.days.length : null,
  wateringMinutesPerSession: wEff.minutesPerSession,
  mowingDaysPerWeek: mEff.days.length > 0 ? mEff.days.length : null,
  mowingHeightInches: mEff.heightInches,
  weatherSummary,
};
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    schedule = await generateScheduleRecommendation(
      scheduleOpts,
      { userId: session.user.id, feature: "schedule" },
    );
    break;
  } catch (err) {
    if (attempt === 1) {
      logger.warn("analyze: schedule call failed after retry", {
        err: err instanceof Error ? err.message : String(err),
        userId: session.user.id,
        sectionId: section.id,
        yardId: section.yardId,
        grassType: section.grassType,
      });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
```

- [ ] **Step 3: Extend the final response with plan + effective**

Find the 200 return at the end of the route:
```ts
return NextResponse.json({ analysis, result });
```

Replace with:
```ts
return NextResponse.json({
  analysis,
  result,
  plan: subUser.plan,
  effective: {
    wateringDays: wEff.days,
    wateringTime: wEff.time,
    wateringMinutesPerSession: wEff.minutesPerSession,
    mowingDays: mEff.days,
    mowingTime: mEff.time,
    mowingHeightInches: mEff.heightInches,
  },
});
```

`wEff` and `mEff` are already in scope from the existing `effectiveWatering`/`effectiveMowing` calls above. `subUser` is already in scope (used by `canRunAnalysis`).

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
```
Expected: 518 still passing. Any existing analyze-route tests that assert response shape may need a `plan: expect.any(String)` and `effective: expect.objectContaining(...)`; if no such tests exist, no test updates needed.

- [ ] **Step 6: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "Retry schedule call once and return plan and effective schedule"
```

---

### Task 3: Combined `/schedule/apply` endpoint

One endpoint that writes both watering and mowing in a single transaction. Plus the route tests.

**Files:**
- Create: `app/api/sections/[sectionId]/schedule/apply/route.ts`
- Create: `app/api/sections/[sectionId]/schedule/apply/__tests__/route.test.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitWateringApplied, emitMowingApplied } from "@/lib/observability/events";

const DAY = z.enum(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const TIME = z.string().regex(/^\d{2}:\d{2}$/).nullable();

const bodySchema = z.object({
  watering: z.object({
    days: z.array(DAY),
    time: TIME,
    minutesPerSession: z.number().int().min(1).max(120).nullable(),
  }),
  mowing: z.object({
    days: z.array(DAY),
    time: TIME,
    heightInches: z.number().min(1).max(6).nullable(),
  }),
  applyToYard: z.boolean(),
});

export const POST = withAxiom(async (req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { watering, mowing } = parsed.data;

  const section = await db.yardSection.findUnique({
    where: { id: sectionId },
    include: { yard: { include: { user: { select: { id: true, plan: true } } } } },
  });
  if (!section || section.yard.user.id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canOverride = canSetSectionSchedule(section.yard.user.plan);
  const target: "yard" | "section" = canOverride && !parsed.data.applyToYard ? "section" : "yard";

  const latest = await db.lawnAnalysis.findFirst({
    where: { yardSectionId: sectionId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await db.$transaction(async (tx) => {
    const data = {
      wateringDays: watering.days,
      wateringTime: watering.time,
      wateringMinutesPerSession: watering.minutesPerSession,
      mowingDays: mowing.days,
      mowingTime: mowing.time,
      mowingHeightInches: mowing.heightInches,
    };
    if (target === "yard") {
      await tx.yard.update({ where: { id: section.yardId }, data });
    } else {
      await tx.yardSection.update({ where: { id: sectionId }, data });
    }
    if (latest) {
      await tx.lawnAnalysis.update({
        where: { id: latest.id },
        data: {
          wateringRecommendationDismissedAt: null,
          mowingRecommendationDismissedAt: null,
        },
      });
    }
  });

  emitWateringApplied({ sectionId, plan: section.yard.user.plan, target });
  emitMowingApplied({ sectionId, plan: section.yard.user.plan, target });
  logger.info("schedule applied", { sectionId, target });

  return NextResponse.json({ target, watering, mowing });
});
```

- [ ] **Step 2: Write route tests**

Create `app/api/sections/[sectionId]/schedule/apply/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  withAxiom: (fn: (...a: unknown[]) => unknown) => fn,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/observability/events", () => ({
  emitWateringApplied: vi.fn(),
  emitMowingApplied: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const findUnique = vi.fn();
const findFirst = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    yardSection: { findUnique: (...a: unknown[]) => findUnique(...a) },
    lawnAnalysis: { findFirst: (...a: unknown[]) => findFirst(...a) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import { POST } from "@/app/api/sections/[sectionId]/schedule/apply/route";
import { auth } from "@/lib/auth";
import { emitWateringApplied, emitMowingApplied } from "@/lib/observability/events";

const params = (id: string) => ({ params: Promise.resolve({ sectionId: id }) });
const body = (overrides: Partial<Record<string, unknown>> = {}) => ({
  watering: { days: ["Mon", "Wed", "Fri"], time: "07:00", minutesPerSession: 20 },
  mowing: { days: ["Sat"], time: "10:00", heightInches: 3 },
  applyToYard: false,
  ...overrides,
});

const req = (b: unknown) =>
  new Request("https://example.com/api/sections/s1/schedule/apply", {
    method: "POST",
    body: JSON.stringify(b),
  });

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  transaction.mockReset();
  (auth as ReturnType<typeof vi.fn>).mockReset();
  (emitWateringApplied as ReturnType<typeof vi.fn>).mockReset();
  (emitMowingApplied as ReturnType<typeof vi.fn>).mockReset();
});

describe("POST /api/sections/[sectionId]/schedule/apply", () => {
  it("401 unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req(body()) as never, params("s1") as never);
    expect(res.status).toBe(401);
  });

  it("400 invalid body", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(req({ watering: "nope" }) as never, params("s1") as never);
    expect(res.status).toBe(400);
  });

  it("404 not found or wrong owner", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue(null);
    const res = await POST(req(body()) as never, params("s1") as never);
    expect(res.status).toBe(404);
  });

  it("Basic with applyToYard:false still writes to yard (plan override)", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    findFirst.mockResolvedValue({ id: "a1" });
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body({ applyToYard: false })) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(yardUpdate).toHaveBeenCalled();
    expect(sectionUpdate).not.toHaveBeenCalled();
    expect(analysisUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { wateringRecommendationDismissedAt: null, mowingRecommendationDismissedAt: null },
    });
    expect(emitWateringApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_basic", target: "yard" });
    expect(emitMowingApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_basic", target: "yard" });
  });

  it("Plus with applyToYard:false writes to section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_plus" } },
    });
    findFirst.mockResolvedValue({ id: "a1" });
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body({ applyToYard: false })) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(sectionUpdate).toHaveBeenCalled();
    expect(yardUpdate).not.toHaveBeenCalled();
    expect(emitWateringApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_plus", target: "section" });
  });

  it("Plus with applyToYard:true writes to yard", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_plus" } },
    });
    findFirst.mockResolvedValue({ id: "a1" });
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body({ applyToYard: true })) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(yardUpdate).toHaveBeenCalled();
    expect(sectionUpdate).not.toHaveBeenCalled();
  });

  it("skips analysis update when no analysis exists yet", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    findFirst.mockResolvedValue(null);
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body()) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(analysisUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run "app/api/sections/[sectionId]/schedule/apply/"
```
Expected: 6/6 pass.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "app/api/sections/[sectionId]/schedule/"
git commit -m "Add combined /schedule/apply endpoint for analyze-page picker"
```

---

### Task 4: PersonalizedScheduleCard component

The picker with three render modes. Reuses `ScheduleEditor` (day chips + dropdowns), `WateringWarning`/`MowingWarning`, `canSetSectionSchedule`, and the new `distributeWateringDays`/`distributeMowingDays` helpers.

**Files:**
- Create: `components/analysis/PersonalizedScheduleCard.tsx`
- Create: `components/analysis/__tests__/PersonalizedScheduleCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/analysis/__tests__/PersonalizedScheduleCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { PersonalizedScheduleCard } from "@/components/analysis/PersonalizedScheduleCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

const baseAnalysis = {
  wateringSuggestedDaysPerWeek: 3,
  wateringSuggestedMinutesPerSession: 20,
  mowingSuggestedDaysPerWeek: 1,
  mowingSuggestedHeightInches: 3,
};
const emptyEffective = {
  wateringDays: [],
  wateringTime: null,
  wateringMinutesPerSession: null,
  mowingDays: [],
  mowingTime: null,
  mowingHeightInches: null,
};

describe("PersonalizedScheduleCard - picker mode", () => {
  it("renders picker when user has no schedule", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByRole("button", { name: /save schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
  });

  it("hides apply-to-yard checkbox for home_basic", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.queryByLabelText(/apply to whole yard/i)).not.toBeInTheDocument();
  });

  it("shows apply-to-yard checkbox for home_plus", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_plus"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByLabelText(/apply to whole yard/i)).toBeInTheDocument();
  });
});

describe("PersonalizedScheduleCard - confirmation mode", () => {
  it("renders confirmation when both kinds match user's current effective", () => {
    const matching = {
      wateringDays: ["Mon", "Wed", "Fri"],
      wateringTime: "07:00",
      wateringMinutesPerSession: 20,
      mowingDays: ["Sat"],
      mowingTime: "10:00",
      mowingHeightInches: 3,
    };
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={baseAnalysis}
        effective={matching}
      />,
    );
    expect(screen.queryByRole("button", { name: /save schedule/i })).not.toBeInTheDocument();
    expect(screen.getByText(/still looks right/i)).toBeInTheDocument();
  });
});

describe("PersonalizedScheduleCard - placeholder mode", () => {
  it("renders placeholder when both kinds have null suggestions", () => {
    const noSuggestions = {
      wateringSuggestedDaysPerWeek: null,
      wateringSuggestedMinutesPerSession: null,
      mowingSuggestedDaysPerWeek: null,
      mowingSuggestedHeightInches: null,
    };
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={noSuggestions}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByText(/couldn't generate a schedule recommendation/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run components/analysis/__tests__/PersonalizedScheduleCard.test.tsx
```
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `components/analysis/PersonalizedScheduleCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScheduleEditor } from "@/components/yard/ScheduleEditor";
import { WateringWarning, MowingWarning } from "@/components/yard/ScheduleWarnings";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";
import { distributeWateringDays, distributeMowingDays } from "@/lib/schedules/distribute-days";

interface LatestAnalysis {
  wateringSuggestedDaysPerWeek: number | null;
  wateringSuggestedMinutesPerSession: number | null;
  mowingSuggestedDaysPerWeek: number | null;
  mowingSuggestedHeightInches: number | null;
}

interface Effective {
  wateringDays: string[];
  wateringTime: string | null;
  wateringMinutesPerSession: number | null;
  mowingDays: string[];
  mowingTime: string | null;
  mowingHeightInches: number | null;
}

interface Props {
  sectionId: string;
  plan: string | null;
  latestAnalysis: LatestAnalysis;
  effective: Effective;
}

type KindMode = "picker" | "confirmation" | "hidden";

function wateringMode(a: LatestAnalysis, e: Effective): KindMode {
  if (a.wateringSuggestedDaysPerWeek == null) return "hidden";
  if (e.wateringDays.length === 0) return "picker";
  if (e.wateringDays.length !== a.wateringSuggestedDaysPerWeek) return "picker";
  if (e.wateringMinutesPerSession !== a.wateringSuggestedMinutesPerSession) return "picker";
  return "confirmation";
}

function mowingMode(a: LatestAnalysis, e: Effective): KindMode {
  if (a.mowingSuggestedDaysPerWeek == null) return "hidden";
  if (e.mowingDays.length === 0) return "picker";
  if (e.mowingDays.length !== a.mowingSuggestedDaysPerWeek) return "picker";
  if (e.mowingHeightInches !== a.mowingSuggestedHeightInches) return "picker";
  return "confirmation";
}

export function PersonalizedScheduleCard({ sectionId, plan, latestAnalysis, effective }: Props) {
  const router = useRouter();
  const wMode = wateringMode(latestAnalysis, effective);
  const mMode = mowingMode(latestAnalysis, effective);

  // Placeholder: both kinds failed
  if (wMode === "hidden" && mMode === "hidden") {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-white mt-6">
        <h3 className="font-semibold mb-2">Personalized Schedule</h3>
        <p className="text-sm text-gray-500">
          We couldn&rsquo;t generate a schedule recommendation for this analysis. Run another to try again.
        </p>
      </div>
    );
  }

  // Pre-fill chips/values via auto-distribute
  const initialWateringDays =
    effective.wateringDays.length > 0
      ? effective.wateringDays
      : distributeWateringDays(latestAnalysis.wateringSuggestedDaysPerWeek);
  const initialMowingDays =
    effective.mowingDays.length > 0
      ? effective.mowingDays
      : distributeMowingDays(latestAnalysis.mowingSuggestedDaysPerWeek);

  const [wateringDays, setWateringDays] = useState<string[]>(wMode === "picker" ? initialWateringDays : effective.wateringDays);
  const [wateringTime, setWateringTime] = useState<string | null>(effective.wateringTime ?? "07:00");
  const [wateringMins, setWateringMins] = useState<number | null>(latestAnalysis.wateringSuggestedMinutesPerSession ?? effective.wateringMinutesPerSession);

  const [mowingDays, setMowingDays] = useState<string[]>(mMode === "picker" ? initialMowingDays : effective.mowingDays);
  const [mowingTime, setMowingTime] = useState<string | null>(effective.mowingTime ?? "10:00");
  const [mowingHeight, setMowingHeight] = useState<number | null>(latestAnalysis.mowingSuggestedHeightInches ?? effective.mowingHeightInches);

  const [applyToYard, setApplyToYard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCheckbox = canSetSectionSchedule(plan);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/schedule/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watering: { days: wateringDays, time: wateringTime, minutesPerSession: wateringMins },
          mowing: { days: mowingDays, time: mowingTime, heightInches: mowingHeight },
          applyToYard,
        }),
      });
      if (res.ok) {
        router.refresh();
      } else if (res.status === 400) {
        setError("Couldn't save schedule. Check your entries and try again.");
      } else if (res.status === 404) {
        setError("Section not found. Refresh the page.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 bg-white mt-6">
      <h3 className="font-semibold mb-3">Personalized Schedule</h3>

      {wMode === "confirmation" && (
        <p className="text-sm text-green-700 mb-2">
          ✓ Your watering schedule ({effective.wateringDays.length} days/week, {effective.wateringMinutesPerSession ?? "?"} min/session{effective.wateringTime ? `, ${effective.wateringTime}` : ""}) still looks right.
        </p>
      )}
      {wMode === "picker" && (
        <div className="mb-4">
          <ScheduleEditor
            kind="watering"
            label="Watering schedule"
            days={wateringDays}
            time={wateringTime}
            secondaryValue={wateringMins}
            onDaysChange={setWateringDays}
            onTimeChange={setWateringTime}
            onSecondaryChange={setWateringMins}
          />
          <WateringWarning
            latestAnalysis={latestAnalysis}
            currentDayCount={wateringDays.length}
            currentMinutes={wateringMins}
          />
        </div>
      )}

      {mMode === "confirmation" && (
        <p className="text-sm text-green-700 mb-2">
          ✓ Your mowing schedule ({effective.mowingDays.length} days/week at {effective.mowingHeightInches ?? "?"} in{effective.mowingTime ? `, ${effective.mowingTime}` : ""}) still looks right.
        </p>
      )}
      {mMode === "picker" && (
        <div className="mb-4">
          <ScheduleEditor
            kind="mowing"
            label="Mowing schedule"
            days={mowingDays}
            time={mowingTime}
            secondaryValue={mowingHeight}
            onDaysChange={setMowingDays}
            onTimeChange={setMowingTime}
            onSecondaryChange={setMowingHeight}
          />
          <MowingWarning
            latestAnalysis={latestAnalysis}
            currentDayCount={mowingDays.length}
            currentHeight={mowingHeight}
          />
        </div>
      )}

      {(wMode === "picker" || mMode === "picker") && (
        <>
          {showCheckbox && (
            <label className="flex items-center gap-2 mb-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={applyToYard}
                onChange={(e) => setApplyToYard(e.target.checked)}
                disabled={busy}
              />
              Apply to whole yard (all sections)
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save schedule"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => router.refresh()}
              className="text-gray-700 underline px-3 py-2 text-sm disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm passing**

```bash
npx vitest run components/analysis/__tests__/PersonalizedScheduleCard.test.tsx
```
Expected: all 5 tests pass.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add components/analysis/
git commit -m "Add PersonalizedScheduleCard with picker, confirmation, and placeholder modes"
```

---

### Task 5: Wire the card into AnalysisResults and AnalyzeClient

The analyze page now passes `plan` and `effective` (from the extended API response) through `AnalysisResults` to the new card.

**Files:**
- Modify: `components/analysis/AnalysisResults.tsx`
- Modify: `app/(dashboard)/analyze/AnalyzeClient.tsx`

- [ ] **Step 1: Read the existing AnalysisResults shape**

```bash
grep -n "export function\|interface Props\|kind=\"AnalysisResult" components/analysis/AnalysisResults.tsx | head -10
```

Identify the existing Props interface and the section ID it gets.

- [ ] **Step 2: Extend `AnalysisResults` props**

Add three optional props: `plan`, `effective`, `latestAnalysis`. Optional so the component still works in other callers (if any).

In `components/analysis/AnalysisResults.tsx`, find the Props interface and add:

```ts
import { PersonalizedScheduleCard } from "@/components/analysis/PersonalizedScheduleCard";

interface Props {
  result: AnalysisResult;
  // NEW optional props:
  sectionId?: string;
  plan?: string | null;
  effective?: {
    wateringDays: string[];
    wateringTime: string | null;
    wateringMinutesPerSession: number | null;
    mowingDays: string[];
    mowingTime: string | null;
    mowingHeightInches: number | null;
  };
  latestAnalysis?: {
    wateringSuggestedDaysPerWeek: number | null;
    wateringSuggestedMinutesPerSession: number | null;
    mowingSuggestedDaysPerWeek: number | null;
    mowingSuggestedHeightInches: number | null;
  };
}
```

At the bottom of the rendered output, after the existing analysis sections render:

```tsx
{sectionId && plan !== undefined && effective && latestAnalysis && (
  <PersonalizedScheduleCard
    sectionId={sectionId}
    plan={plan}
    effective={effective}
    latestAnalysis={latestAnalysis}
  />
)}
```

The guard ensures the card only renders when all four pieces are available (i.e., from the analyze flow).

- [ ] **Step 3: Update AnalyzeClient to pass through**

In `app/(dashboard)/analyze/AnalyzeClient.tsx`, find where the response is destructured:

```ts
const data = await res.json();
setResult(data.result);
```

The `data` now has `plan` and `effective` and `analysis` (the LawnAnalysis row including suggested fields). Update the state to hold these alongside `result`. Add new state slots:

```ts
const [analyzeMeta, setAnalyzeMeta] = useState<{
  sectionId: string;
  plan: string | null;
  effective: {
    wateringDays: string[];
    wateringTime: string | null;
    wateringMinutesPerSession: number | null;
    mowingDays: string[];
    mowingTime: string | null;
    mowingHeightInches: number | null;
  };
  latestAnalysis: {
    wateringSuggestedDaysPerWeek: number | null;
    wateringSuggestedMinutesPerSession: number | null;
    mowingSuggestedDaysPerWeek: number | null;
    mowingSuggestedHeightInches: number | null;
  };
} | null>(null);
```

Inside the `setResult(data.result)` block:

```ts
setResult(data.result);
setAnalyzeMeta({
  sectionId: selectedSectionId!,
  plan: data.plan ?? null,
  effective: data.effective,
  latestAnalysis: {
    wateringSuggestedDaysPerWeek: data.analysis.wateringSuggestedDaysPerWeek,
    wateringSuggestedMinutesPerSession: data.analysis.wateringSuggestedMinutesPerSession,
    mowingSuggestedDaysPerWeek: data.analysis.mowingSuggestedDaysPerWeek,
    mowingSuggestedHeightInches: data.analysis.mowingSuggestedHeightInches,
  },
});
```

When invoking AnalysisResults, pass the new props:

```tsx
<AnalysisResults
  result={result}
  sectionId={analyzeMeta?.sectionId}
  plan={analyzeMeta?.plan}
  effective={analyzeMeta?.effective}
  latestAnalysis={analyzeMeta?.latestAnalysis}
/>
```

Also reset `analyzeMeta` in the places where `setResult(null)` already runs (so re-analyzing clears it).

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: clean. If `AnalysisResults` has tests that don't pass the new props, they should still work since the new props are optional.

- [ ] **Step 5: Run the test suite**

```bash
npx vitest run
```
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add components/analysis/AnalysisResults.tsx "app/(dashboard)/analyze/AnalyzeClient.tsx"
git commit -m "Render PersonalizedScheduleCard after analyze results"
```

---

### Task 6: SectionForm cleanup

Rename the heading and drop the misleading footer.

**Files:**
- Modify: `components/yard/SectionForm.tsx`

- [ ] **Step 1: Edit the heading**

```bash
grep -n "Personalized Reminders\|won't affect" components/yard/SectionForm.tsx
```

Replace `Personalized Reminders` with `Personalized Schedule`.

Find the line containing `These are your own notes. They won&apos;t affect your lawn analysis.` (or `won't`) — it lives inside a `<p>` tag. Delete the entire `<p>...</p>` block.

- [ ] **Step 2: Type check + suite**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add components/yard/SectionForm.tsx
git commit -m "Rename schedule section and drop misleading lawn-analysis note"
```

---

### Task 7: ScheduleRecommendationCard state B enhancement

When the user has no schedule yet AND there's a suggested count, surface a "Set up watering" / "Set up mowing" button on the section page that posts the combined save with auto-distributed days and the default time.

**Files:**
- Modify: `components/sections/ScheduleRecommendationCard.tsx`

- [ ] **Step 1: Update state B to include a setup CTA when effective is empty**

In `components/sections/ScheduleRecommendationCard.tsx`, find the `if (!stillDeviates)` block (state B). The current implementation just shows the heading + AI text. Add a setup button when effective is empty AND there's a saved suggestion.

Add imports at the top:

```ts
import { distributeWateringDays, distributeMowingDays } from "@/lib/schedules/distribute-days";
```

Replace the state-B return with:

```tsx
if (!stillDeviates) {
  const hasNoSchedule = effective.days.length === 0;
  const hasSuggestion = suggestedDays != null;
  const showSetupCta = hasNoSchedule && hasSuggestion;

  const setUp = async () => {
    if (!suggestedDays) return;
    setBusy(true);
    setError(null);
    try {
      const days = kind === "watering" ? distributeWateringDays(suggestedDays) : distributeMowingDays(suggestedDays);
      const time = kind === "watering" ? "07:00" : "10:00";
      const body = {
        watering: kind === "watering"
          ? { days, time, minutesPerSession: suggestedSecond as number | null }
          : { days: effective.days, time: effective.time, minutesPerSession: effective.minutesPerSession },
        mowing: kind === "mowing"
          ? { days, time, heightInches: suggestedSecond as number | null }
          : { days: effective.days, time: effective.time, heightInches: effective.heightInches },
        applyToYard: plan === "home_basic",
      };
      const res = await fetch(`/api/sections/${sectionId}/schedule/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
      else setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 bg-white">
      <h3 className="font-semibold mb-1">{kind === "watering" ? "Watering" : "Mowing"}</h3>
      {schedule && <p className="text-sm text-gray-700">{schedule}</p>}
      {showSetupCta && (
        <div className="mt-3">
          <p className="text-sm text-gray-500 mb-2">
            You haven&rsquo;t set up a {kind} schedule yet.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={setUp}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Saving..." : `Set up ${kind}`}
          </button>
          {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

Note: the body construction passes the OTHER kind's current effective values unchanged (so the combined endpoint doesn't accidentally wipe them). The `effective` object on this card has `minutesPerSession` and `heightInches` directly (not nested under watering/mowing) — verify against the actual component type. If the card's `effective` doesn't include both kinds' values, the simpler approach is to fall back to single-kind apply via the existing `/{kind}/apply` endpoint. Use whichever matches the actual prop shape.

If the card only knows its own kind, switch to using the existing single-kind endpoint:

```ts
const res = await fetch(`/api/sections/${sectionId}/${kind}/apply`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ days, time, ...(kind === "watering" ? { minutesPerSession: suggestedSecond } : { heightInches: suggestedSecond }) }),
});
```

But the existing `/watering/apply` route doesn't accept a body with days/time — it only writes minutes. To support setup, the easiest path is to extend the existing apply route's body. Per the spec, the easier path is to use the new `/schedule/apply` and pass the other kind's effective values from this card's props (which only include one kind's values).

Pragmatic fix: extend the card's `effective` prop to include BOTH kinds, by updating the section page caller to pass a full effective object. If the engineer finds the prop shape is single-kind, they should update the prop type and the section page caller in one commit.

- [ ] **Step 2: Type check + suite**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add components/sections/ "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
git commit -m "Add Set up CTA to state B when no schedule is set"
```

---

### Task 8: Final verification

Confirm no leftover issues and the picker behaves end-to-end.

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run 2>&1 | tail -5
```
Expected: all tests passing. Note the count (should be ~530+ given new tests).

- [ ] **Step 3: Grep for orphaned references**

```bash
grep -rn "Personalized Reminders" --include="*.tsx" --include="*.ts" app/ components/ lib/ 2>/dev/null
```
Expected: zero hits (we renamed the heading and there's no other usage).

- [ ] **Step 4: Manual smoke walkthrough**

```bash
npm run dev
```

With a Home Basic test user who has at least one section but no schedule:
1. Run an analysis. After it completes, scroll past the existing results to verify the **Personalized Schedule** card renders with pre-selected day chips (Mon/Wed/Fri for watering; Sat for mowing) and default times.
2. Click **Save schedule**. Verify the yard's `wateringDays` / `wateringTime` / `wateringMinutesPerSession` (and mowing equivalents) are populated.
3. Run another analysis (if AI agrees with the schedule you just set, you should see the green confirmation banner; if AI deviates, you should see the picker again with new pre-fills).

With a Home Plus test user:
1. Run an analysis. Verify the **Apply to whole yard** checkbox appears.
2. Save with the checkbox unchecked. Verify the section's override fields are populated, not the yard's.
3. Save again with the checkbox checked. Verify the yard's fields are populated.

Visit the section detail page. With no schedule, verify the **Set up watering** / **Set up mowing** CTAs appear in state B.

Visit the Section edit form. Verify the heading reads "Personalized Schedule" and the "These are your own notes" footer is gone.

- [ ] **Step 5: No commit needed**

This task is verification only.

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Implementation task |
|---|---|
| Day distribution helper | Task 1 |
| Analyze route 2-attempt retry | Task 2 |
| Analyze route response with `plan` + `effective` | Task 2 |
| Combined `/schedule/apply` endpoint | Task 3 |
| `PersonalizedScheduleCard` component | Task 4 |
| AnalysisResults integration + AnalyzeClient plumbing | Task 5 |
| SectionForm rename + footer removal | Task 6 |
| `ScheduleRecommendationCard` state B enhancement | Task 7 |
| End-to-end verification | Task 8 |

**Placeholder scan:** No TBD/TODO. Every code step has concrete content.

**Type consistency:**
- `LatestAnalysis` and `Effective` shapes used in PersonalizedScheduleCard (Task 4) match the shapes set in AnalyzeClient state (Task 5) and the analyze route response (Task 2).
- `distributeWateringDays` / `distributeMowingDays` signatures (Task 1) accept `number | null` and return `string[]` — consumed correctly in Task 4 and Task 7.
- The `/schedule/apply` body shape (Task 3) matches what the picker posts (Task 4).
- `target: "yard" | "section"` is consistent across the apply route (Task 3) and emitted telemetry (Task 3).

**Risks for the implementing engineer:**

- Task 5 assumes the analyze API's response can be extended without breaking existing callers. If any current consumer destructures the response narrowly, it might break — search for `await res.json()` against the analyze endpoint and check.
- Task 7's body construction needs the card's `effective` prop to expose both kinds' values; the existing prop may be single-kind. The plan flags this and proposes extending the prop type. If the engineer chooses the simpler "use the existing single-kind endpoint" path, they'll need to extend that endpoint's body schema first — that's a bigger change. The spec-compliant path is to update the prop and use `/schedule/apply`.
- The retry loop in Task 2 must not add to user-perceived latency materially. 500ms × 1 retry is acceptable; do not extend.
