# Unified Schedule + Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two parallel schedule systems (JSON + structured) into one structured model, add push reminders + weather alert pushes, rewrite settings with per-channel toggles + master switches, and drop legacy columns and code paths.

**Architecture:** Three phases. Phase 1 adds new schema columns and data-migrates existing JSON into them while the legacy columns continue to exist (no behavior change). Phase 2 migrates every reader and writer to the new columns and adds the new push + weather paths. Phase 3 drops legacy columns and removes the JSON-parsing code paths. Tests stay green throughout.

**Tech Stack:** Next.js 16 App Router, Prisma 5 + PostgreSQL (Supabase), Vitest, Tailwind, Anthropic SDK (no new prompts), Resend (email), existing push delivery via DeviceToken.

**Spec:** [`docs/superpowers/specs/2026-06-21-unified-schedule-and-notifications-design.md`](../specs/2026-06-21-unified-schedule-and-notifications-design.md)

---

## File Structure

**New files:**
- One Prisma migration that adds the new columns and data-migrates from JSON
- A second Prisma migration that drops the legacy columns (run only after all code is migrated)
- `lib/cron/schedule-conflict.ts` — pure predicates for "is today a watering/mowing day for this section" and weather-alert thresholds (+ tests)
- `lib/email/weather-alerts.ts` — pure builder for the weather alerts section of the digest (+ tests)

**Modified:**
- `prisma/schema.prisma` — column additions and (later) drops
- `lib/validations/yard.ts` — drop `wateringSchedule`/`mowingSchedule`/`*DaysPerWeek`, add `*Days`/`*Time`
- `lib/schedules/effective-schedule.ts` + tests — return shape changes
- `lib/push/triggers.ts` + tests — four new predicates (`shouldPushWateringReminder`, `shouldPushMowingReminder`, `shouldPushWateringWeatherWarning`, `shouldPushMowingWeatherWarning`)
- `lib/cron/reminder-scheduler.ts` + tests — rewritten to read structured fields
- `app/api/cron/daily-tasks/route.ts` — calls new predicates, sends pushes, gates each channel via the new toggles, builds the weather-alerts digest section
- `lib/email.ts` — `buildDigestEmail` accepts and renders an optional weather-alerts list
- `app/api/sections/[sectionId]/watering/apply/route.ts` — writes only `wateringMinutesPerSession`
- `app/api/sections/[sectionId]/mowing/apply/route.ts` — writes only `mowingHeightInches`
- `components/yard/ScheduleEditor.tsx` + (new) tests — binds directly to structured fields
- `components/yard/YardEditForm.tsx` — uses the rewritten ScheduleEditor, shows inline AI-deviation warnings
- `components/yard/SectionForm.tsx` — uses the rewritten ScheduleEditor inside the plan-gated section, shows warnings
- `components/sections/ScheduleRecommendationCard.tsx` + tests — uses the new effective shape, narrower Apply behavior
- `components/settings/NotificationPreferences.tsx` + tests — rewritten with 4 categories, 8 toggles, 2 master switches
- `app/api/user/notifications/route.ts` — accepts the six new keys
- `lib/observability/events.ts` + tests — four new emitters for the new push events

---

## Pre-flight

- [ ] **Step 0: Confirm clean state**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (or only the untracked Affinity asset).

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean and full suite passing (~483 baseline from the prior plan).

---

### Task 1: Add new schema columns and data-migrate from JSON

Adds the structured columns to `Yard`, `YardSection`, and `User`. Data-migrates existing JSON `wateringSchedule`/`mowingSchedule` into the new columns. Leaves the legacy columns in place so no code breaks yet.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_structured_schedule_and_notifications/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

On the `Yard` model, after the existing `wateringMinutesPerSession` and `mowingHeightInches` lines, add:
```prisma
  wateringDays              String[]   @default([])
  wateringTime              String?
  mowingDays                String[]   @default([])
  mowingTime                String?
```

On the `YardSection` model, after `wateringMinutesPerSession` and `mowingHeightInches`, add:
```prisma
  wateringDays              String[]   @default([])
  wateringTime              String?
  mowingDays                String[]   @default([])
  mowingTime                String?
```

On the `User` model, after the existing `gddBestDayReminderDays` (or the last notification-related column), add:
```prisma
  emailNotificationsEnabled Boolean    @default(true)
  pushNotificationsEnabled  Boolean    @default(true)
  taskPushEnabled           Boolean    @default(false)
  schedulePushEnabled       Boolean    @default(true)
  weatherEmailEnabled       Boolean    @default(true)
  weatherPushEnabled        Boolean    @default(true)
```

- [ ] **Step 2: Generate the migration**

```bash
npx prisma migrate dev --name add_structured_schedule_and_notifications
```
If `DIRECT_URL` is not set (per the previous spec's Task 1 note), hand-write the migration file in the same format as the prior `add_schedule_recommendations` migration. The directory name uses the `YYYYMMDDHHMMSS_<slug>` pattern.

- [ ] **Step 3: Add a data-migration SQL block to the migration**

In the generated `migration.sql`, after the `ALTER TABLE` statements, append:

```sql
-- Data migrate existing JSON wateringSchedule into structured columns
UPDATE "Yard"
SET
  "wateringDays" = COALESCE(("wateringSchedule"::jsonb -> 'days')::text[], ARRAY[]::text[]),
  "wateringTime" = "wateringSchedule"::jsonb ->> 'time',
  "wateringMinutesPerSession" = COALESCE("wateringMinutesPerSession", NULLIF("wateringSchedule"::jsonb ->> 'inches', '')::int)
WHERE "wateringSchedule" IS NOT NULL AND "wateringSchedule" ~ '^\s*\{';

UPDATE "Yard"
SET
  "mowingDays" = COALESCE(("mowingSchedule"::jsonb -> 'days')::text[], ARRAY[]::text[]),
  "mowingTime" = "mowingSchedule"::jsonb ->> 'time',
  "mowingHeightInches" = COALESCE("mowingHeightInches", NULLIF("mowingSchedule"::jsonb ->> 'inches', '')::float)
WHERE "mowingSchedule" IS NOT NULL AND "mowingSchedule" ~ '^\s*\{';

UPDATE "YardSection"
SET
  "wateringDays" = COALESCE(("wateringSchedule"::jsonb -> 'days')::text[], ARRAY[]::text[]),
  "wateringTime" = "wateringSchedule"::jsonb ->> 'time',
  "wateringMinutesPerSession" = COALESCE("wateringMinutesPerSession", NULLIF("wateringSchedule"::jsonb ->> 'inches', '')::int)
WHERE "wateringSchedule" IS NOT NULL AND "wateringSchedule" ~ '^\s*\{';

UPDATE "YardSection"
SET
  "mowingDays" = COALESCE(("mowingSchedule"::jsonb -> 'days')::text[], ARRAY[]::text[]),
  "mowingTime" = "mowingSchedule"::jsonb ->> 'time',
  "mowingHeightInches" = COALESCE("mowingHeightInches", NULLIF("mowingSchedule"::jsonb ->> 'inches', '')::float)
WHERE "mowingSchedule" IS NOT NULL AND "mowingSchedule" ~ '^\s*\{';
```

The `~ '^\s*\{'` guard prevents the cast from blowing up on non-JSON values (which shouldn't exist but the guard is cheap insurance).

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate deploy
```
or `npx prisma migrate dev` if `DIRECT_URL` is set.

- [ ] **Step 5: Regenerate the Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add structured schedule columns and notification preferences"
```

---

### Task 2: Update validation schemas

Drop legacy `wateringSchedule`/`mowingSchedule`/`*DaysPerWeek` from the Zod schemas; add `*Days`/`*Time`.

**Files:**
- Modify: `lib/validations/yard.ts`

- [ ] **Step 1: Edit `lib/validations/yard.ts`**

In the `yardSchema` (around lines 23-34), remove these lines:
```ts
  mowingSchedule: z.string().optional(),
  wateringSchedule: z.string().optional(),
```
and the legacy `wateringDaysPerWeek` / `mowingDaysPerWeek` (if present at this point — they were added in the prior spec and now derived).

Add in their place:
```ts
  wateringDays: z.array(z.enum(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])).optional(),
  wateringTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mowingDays: z.array(z.enum(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])).optional(),
  mowingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
```

Repeat the same change in the `yardSectionSchema` (around lines 84-96).

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: errors will appear at every consumer of the removed fields (forms, server actions). Don't fix them in this task — they're addressed in tasks 5/6/7/8. The migration order is: add new schema, then migrate consumers.

If errors exist outside the form/page paths (e.g. on the apply route), fix them now.

- [ ] **Step 3: Commit**

```bash
git add lib/validations/yard.ts
git commit -m "Migrate yard and section Zod schemas to structured schedule fields"
```

---

### Task 3: Update `effective-schedule.ts` for the new shape

The helper changes its return shape: `daysPerWeek: number` → `days: string[]`, plus new `time` field.

**Files:**
- Modify: `lib/schedules/effective-schedule.ts`
- Modify: `lib/__tests__/effective-schedule.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `lib/__tests__/effective-schedule.test.ts`, rewrite each test to use the new shape. Replace the existing `effectiveWatering` describe block with:

```ts
const section = (over: Partial<{ wDays: string[]; wTime: string; wMin: number; mDays: string[]; mTime: string; mH: number }>) => ({
  wateringDays: over.wDays ?? [],
  wateringTime: over.wTime ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDays: over.mDays ?? [],
  mowingTime: over.mTime ?? null,
  mowingHeightInches: over.mH ?? null,
});

const yard = (over: Partial<{ wDays: string[]; wTime: string; wMin: number; mDays: string[]; mTime: string; mH: number }>) => ({
  wateringDays: over.wDays ?? [],
  wateringTime: over.wTime ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDays: over.mDays ?? [],
  mowingTime: over.mTime ?? null,
  mowingHeightInches: over.mH ?? null,
});

describe("effectiveWatering", () => {
  it("prefers section days when plan allows and section has any", () => {
    const result = effectiveWatering(section({ wDays: ["Mon","Wed","Fri"], wTime: "07:00", wMin: 15 }), yard({ wDays: ["Tue","Thu","Sat"], wTime: "06:00", wMin: 30 }), "home_plus");
    expect(result).toEqual({ days: ["Mon","Wed","Fri"], time: "07:00", minutesPerSession: 15 });
  });

  it("falls back to yard when section days is empty", () => {
    const result = effectiveWatering(section({}), yard({ wDays: ["Tue","Thu"], wTime: "06:00", wMin: 30 }), "home_plus");
    expect(result).toEqual({ days: ["Tue","Thu"], time: "06:00", minutesPerSession: 30 });
  });

  it("ignores section override on home_basic plan", () => {
    const result = effectiveWatering(section({ wDays: ["Mon"], wTime: "10:00", wMin: 5 }), yard({ wDays: ["Tue","Thu"], wTime: "06:00", wMin: 30 }), "home_basic");
    expect(result).toEqual({ days: ["Tue","Thu"], time: "06:00", minutesPerSession: 30 });
  });

  it("returns empty days and nulls when nothing is set", () => {
    const result = effectiveWatering(section({}), yard({}), "home_plus");
    expect(result).toEqual({ days: [], time: null, minutesPerSession: null });
  });
});

describe("effectiveMowing", () => {
  it("prefers section override when plan allows", () => {
    const result = effectiveMowing(section({ mDays: ["Sat"], mTime: "08:00", mH: 3.0 }), yard({ mDays: ["Sun"], mTime: "09:00", mH: 2.5 }), "professional");
    expect(result).toEqual({ days: ["Sat"], time: "08:00", heightInches: 3.0 });
  });
});
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
npx vitest run lib/__tests__/effective-schedule.test.ts
```
Expected: FAIL — the helper still returns the old shape.

- [ ] **Step 3: Update `lib/schedules/effective-schedule.ts`**

Replace the file's contents with:

```ts
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

type WateringSource = {
  wateringDays: string[];
  wateringTime: string | null;
  wateringMinutesPerSession: number | null;
};

type MowingSource = {
  mowingDays: string[];
  mowingTime: string | null;
  mowingHeightInches: number | null;
};

export function effectiveWatering(
  section: WateringSource,
  yard: WateringSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  const days = canOverride && section.wateringDays.length > 0 ? section.wateringDays : yard.wateringDays;
  const time = (canOverride ? section.wateringTime : null) ?? yard.wateringTime ?? null;
  const minutesPerSession = (canOverride ? section.wateringMinutesPerSession : null) ?? yard.wateringMinutesPerSession ?? null;
  return { days, time, minutesPerSession };
}

export function effectiveMowing(
  section: MowingSource,
  yard: MowingSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  const days = canOverride && section.mowingDays.length > 0 ? section.mowingDays : yard.mowingDays;
  const time = (canOverride ? section.mowingTime : null) ?? yard.mowingTime ?? null;
  const heightInches = (canOverride ? section.mowingHeightInches : null) ?? yard.mowingHeightInches ?? null;
  return { days, time, heightInches };
}
```

- [ ] **Step 4: Run tests, confirm passing**

```bash
npx vitest run lib/__tests__/effective-schedule.test.ts
```
Expected: all watering + mowing tests pass.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```
Expected: errors will surface at the analyze route (which calls `effectiveWatering(...).daysPerWeek`) and the recommendation card (same). Fix in next tasks.

- [ ] **Step 6: Commit**

```bash
git add lib/schedules/effective-schedule.ts lib/__tests__/effective-schedule.test.ts
git commit -m "Update effective schedule helpers to return days array and time"
```

---

### Task 4: Update the analyze route's consumption of the effective schedule

The analyze route at `app/api/analyze/route.ts` calls `effectiveWatering(...).daysPerWeek` (since Task 4 of the prior spec). Now `daysPerWeek` is gone — it must use `days.length`.

**Files:**
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Find the call sites**

```bash
grep -n "effectiveWatering\|effectiveMowing" app/api/analyze/route.ts
```

- [ ] **Step 2: Update the prompt-call to pass `wateringDaysPerWeek` (count) derived from `days.length`**

Inside the schedule call args, change:
```ts
wateringDaysPerWeek: wEff.daysPerWeek,
wateringMinutesPerSession: wEff.minutesPerSession,
mowingDaysPerWeek: mEff.daysPerWeek,
mowingHeightInches: mEff.heightInches,
```
to:
```ts
wateringDaysPerWeek: wEff.days.length > 0 ? wEff.days.length : null,
wateringMinutesPerSession: wEff.minutesPerSession,
mowingDaysPerWeek: mEff.days.length > 0 ? mEff.days.length : null,
mowingHeightInches: mEff.heightInches,
```

The `null` fallback lets the AI know the user has no schedule (vs. having a 0-day schedule, which is meaningless).

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: clean for the analyze route. Other consumers (card, forms) still need updates in upcoming tasks.

- [ ] **Step 4: Run the suite**

```bash
npx vitest run
```
Expected: passing (the analyze route doesn't have integration tests; unit tests aren't affected).

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "Pass derived watering and mowing day count to schedule prompt"
```

---

### Task 5: Narrow the apply routes — drop days writes

The apply routes currently write both `wateringDaysPerWeek` and `wateringMinutesPerSession`. Per spec, they now write only `wateringMinutesPerSession` (mowing: only `mowingHeightInches`).

**Files:**
- Modify: `app/api/sections/[sectionId]/watering/apply/route.ts`
- Modify: `app/api/sections/[sectionId]/mowing/apply/route.ts`
- Modify: route tests under both endpoints' `__tests__/` directories

- [ ] **Step 1: Edit the watering apply route**

In `app/api/sections/[sectionId]/watering/apply/route.ts`, find the transaction block. The current code reads `latest.wateringSuggestedDaysPerWeek` and writes both `wateringDaysPerWeek` and `wateringMinutesPerSession`. Update so it reads only `wateringSuggestedMinutesPerSession` and writes only `wateringMinutesPerSession`:

```ts
const mins = latest.wateringSuggestedMinutesPerSession;
if (mins == null) {
  return NextResponse.json({ error: "No structured suggestion available" }, { status: 400 });
}

const target = applyTargetForPlan(section.yard.user.plan);
await db.$transaction(async (tx) => {
  if (target === "yard") {
    await tx.yard.update({
      where: { id: section.yardId },
      data: { wateringMinutesPerSession: mins },
    });
  } else {
    await tx.yardSection.update({
      where: { id: sectionId },
      data: { wateringMinutesPerSession: mins },
    });
  }
  await tx.lawnAnalysis.update({
    where: { id: latest.id },
    data: { wateringRecommendationDismissedAt: null },
  });
});

// Drop daysPerWeek from the response too
return NextResponse.json({ target, minutesPerSession: mins });
```

The `days` const, `wateringSuggestedDaysPerWeek` read, and the `daysPerWeek` field in both `data` and response are all removed.

- [ ] **Step 2: Update the watering apply route tests**

In `app/api/sections/[sectionId]/watering/apply/__tests__/route.test.ts`, find every assertion that checks `wateringDaysPerWeek` in the `data:` object passed to `tx.yard.update` / `tx.yardSection.update`, and the corresponding response field. Remove those assertions. Also remove `wateringSuggestedDaysPerWeek` from the fixture analysis objects (so the test no longer pretends the count is needed for apply).

Add a new test asserting that the route still 200s when `wateringSuggestedDaysPerWeek` is null on the analysis (no longer relevant — only minutes is checked). Verify the 400 case now triggers only on `wateringSuggestedMinutesPerSession: null`.

- [ ] **Step 3: Edit the mowing apply route**

Same pattern at `app/api/sections/[sectionId]/mowing/apply/route.ts`. Remove the `days` read, 400 on `height == null` only, write only `mowingHeightInches`, response `{ target, heightInches }`.

- [ ] **Step 4: Update the mowing apply route tests**

Same pattern in `app/api/sections/[sectionId]/mowing/apply/__tests__/route.test.ts`.

- [ ] **Step 5: Run the route tests**

```bash
npx vitest run "app/api/sections/[sectionId]/watering/apply/" "app/api/sections/[sectionId]/mowing/apply/"
```
Expected: tests pass with the updated assertions.

- [ ] **Step 6: Type check and full suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "app/api/sections/[sectionId]/"
git commit -m "Narrow apply routes to update only minutes and height"
```

---

### Task 6: Update ScheduleRecommendationCard for the new shape

The card consumes `effective.daysPerWeek` and `effective.minutesPerSession` (or `heightInches`). It now consumes `effective.days.length` for the count comparison, and the "Current" display shows the user's days array verbatim.

**Files:**
- Modify: `components/sections/ScheduleRecommendationCard.tsx`
- Modify: `components/sections/__tests__/ScheduleRecommendationCard.test.tsx`

- [ ] **Step 1: Update the test fixtures and assertions**

In `ScheduleRecommendationCard.test.tsx`, change the `baseEffective` constant from `{ daysPerWeek: 3, minutesPerSession: 20, heightInches: null }` to `{ days: ["Mon","Wed","Fri"], time: "07:00", minutesPerSession: 20, heightInches: null }`. Update the deviation test fixtures so the user has e.g. `["Mon","Wed"]` (2 days) when the AI suggests 3.

Update test assertions to match the new card text: "Current: 3 days/week (Mon, Wed, Fri), 20 min/session, 07:00".

- [ ] **Step 2: Run tests, confirm failure**

```bash
npx vitest run components/sections/__tests__/ScheduleRecommendationCard.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Update the component**

In `components/sections/ScheduleRecommendationCard.tsx`, replace the `Effective` type and the rendering of "Current"/"Suggested" with day-array-aware logic:

```ts
type Effective = {
  days: string[];
  time: string | null;
  minutesPerSession: number | null;
  heightInches: number | null;
};
```

Inside the rendering, the "Current" block becomes:
```tsx
<div>
  <div className="text-xs text-amber-700">Current</div>
  <div>
    {effective.days.length > 0
      ? `${effective.days.length} days/week (${effective.days.join(", ")})`
      : "No schedule set"}
    {kind === "watering" && effective.minutesPerSession != null && `, ${effective.minutesPerSession} min/session`}
    {kind === "mowing" && effective.heightInches != null && `, ${effective.heightInches} in`}
    {effective.time && `, ${effective.time}`}
  </div>
</div>
```

The "Suggested" block stays count-only:
```tsx
<div>
  <div className="text-xs text-amber-700">Suggested</div>
  <div>
    {suggestedDays} days/week
    {kind === "watering" && suggestedSecond != null && `, ${suggestedSecond} min/session`}
    {kind === "mowing" && suggestedSecond != null && `, ${suggestedSecond} in`}
  </div>
</div>
```

The recompute condition `stillDeviates`:
```ts
const stillDeviates = deviates === true
  && (suggestedDays !== effective.days.length || suggestedSecond !== currentSecond);
```

`currentSecond` is `effective.minutesPerSession` (watering) or `effective.heightInches` (mowing).

- [ ] **Step 4: Run tests, confirm passing**

```bash
npx vitest run components/sections/__tests__/ScheduleRecommendationCard.test.tsx
```
Expected: all pass.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```
Expected: errors will surface in the section detail page (passes the old effective shape). Don't fix yet — task 7 fixes it.

- [ ] **Step 6: Commit**

```bash
git add components/sections/
git commit -m "Update ScheduleRecommendationCard to read structured days and time"
```

---

### Task 7: Update the section detail page to pass the new effective shape

**Files:**
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`

- [ ] **Step 1: Find and update the two ScheduleRecommendationCard call sites**

In the page, find where each card receives `effective={{ daysPerWeek: …, minutesPerSession: …, heightInches: … }}`. Replace with:

```tsx
<ScheduleRecommendationCard
  kind="watering"
  sectionId={section.id}
  latestAnalysis={latestAnalysis}
  effective={(() => {
    const w = effectiveWatering(section, section.yard, subscriptionUser.plan);
    return { days: w.days, time: w.time, minutesPerSession: w.minutesPerSession, heightInches: null };
  })()}
  plan={subscriptionUser.plan}
/>
<ScheduleRecommendationCard
  kind="mowing"
  sectionId={section.id}
  latestAnalysis={latestAnalysis}
  effective={(() => {
    const m = effectiveMowing(section, section.yard, subscriptionUser.plan);
    return { days: m.days, time: m.time, minutesPerSession: null, heightInches: m.heightInches };
  })()}
  plan={subscriptionUser.plan}
/>
```

Also expand the `section` select / `yard` select to pull the new columns (`wateringDays`, `wateringTime`, `mowingDays`, `mowingTime`). Remove the old `wateringDaysPerWeek` / `mowingDaysPerWeek` reads (they're being dropped in Task 14).

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: clean for this file.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
git commit -m "Pass structured schedule fields to recommendation cards"
```

---

### Task 8: Rewrite ScheduleEditor to bind to structured fields directly

The current `ScheduleEditor` reads/writes a JSON string. Rewrite so it binds to four discrete fields: `wateringDays` (or `mowingDays`), `wateringTime` (or `mowingTime`), `wateringMinutesPerSession` (or `mowingHeightInches`).

**Files:**
- Modify: `components/yard/ScheduleEditor.tsx`
- Create: `components/yard/__tests__/ScheduleEditor.test.tsx`

- [ ] **Step 1: Read the existing component**

```bash
cat components/yard/ScheduleEditor.tsx
```
Understand its current props (likely `value: string; onChange: (next: string) => void; kind: "water" | "mow"` or similar).

- [ ] **Step 2: Write the failing test**

Create `components/yard/__tests__/ScheduleEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { ScheduleEditor } from "@/components/yard/ScheduleEditor";

afterEach(cleanup);

describe("ScheduleEditor watering", () => {
  it("renders 7 day toggles, a time input, and a minutes input", () => {
    const onDaysChange = vi.fn();
    const onTimeChange = vi.fn();
    const onMinutesChange = vi.fn();
    render(
      <ScheduleEditor
        kind="watering"
        days={[]}
        time={null}
        secondaryValue={null}
        onDaysChange={onDaysChange}
        onTimeChange={onTimeChange}
        onSecondaryChange={onMinutesChange}
      />
    );
    expect(screen.getByRole("button", { name: "Mon" })).toBeInTheDocument();
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/minutes/i)).toBeInTheDocument();
  });

  it("toggles a day when its chip is clicked", () => {
    const onDaysChange = vi.fn();
    render(
      <ScheduleEditor
        kind="watering"
        days={["Mon","Wed"]}
        time={null}
        secondaryValue={null}
        onDaysChange={onDaysChange}
        onTimeChange={() => {}}
        onSecondaryChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Fri" }));
    expect(onDaysChange).toHaveBeenCalledWith(["Mon","Wed","Fri"]);
  });

  it("removes an already-selected day on click", () => {
    const onDaysChange = vi.fn();
    render(
      <ScheduleEditor
        kind="watering"
        days={["Mon","Wed"]}
        time={null}
        secondaryValue={null}
        onDaysChange={onDaysChange}
        onTimeChange={() => {}}
        onSecondaryChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(onDaysChange).toHaveBeenCalledWith(["Wed"]);
  });
});
```

- [ ] **Step 3: Run test, confirm failure**

```bash
npx vitest run components/yard/__tests__/ScheduleEditor.test.tsx
```
Expected: FAIL — props don't match.

- [ ] **Step 4: Rewrite the component**

Replace `components/yard/ScheduleEditor.tsx` with:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] as const;
type DayName = typeof DAYS[number];

interface Props {
  kind: "watering" | "mowing";
  days: string[];
  time: string | null;
  secondaryValue: number | null;
  onDaysChange: (next: string[]) => void;
  onTimeChange: (next: string | null) => void;
  onSecondaryChange: (next: number | null) => void;
}

export function ScheduleEditor({ kind, days, time, secondaryValue, onDaysChange, onTimeChange, onSecondaryChange }: Props) {
  const toggleDay = (d: DayName) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    // Keep days in canonical Sun→Sat order
    onDaysChange(DAYS.filter((x) => next.includes(x)));
  };

  const secondaryLabel = kind === "watering" ? "Minutes per session" : "Mowing height (inches)";

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium text-gray-700">Days</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  on ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-300"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${kind}-time`} className="text-sm font-medium text-gray-700">Time</Label>
          <Input
            id={`${kind}-time`}
            type="time"
            value={time ?? ""}
            onChange={(e) => onTimeChange(e.target.value || null)}
          />
        </div>
        <div>
          <Label htmlFor={`${kind}-secondary`} className="text-sm font-medium text-gray-700">{secondaryLabel}</Label>
          <Input
            id={`${kind}-secondary`}
            type="number"
            inputMode="numeric"
            step={kind === "mowing" ? 0.5 : 1}
            value={secondaryValue ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onSecondaryChange(v === "" ? null : Number(v));
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests, confirm passing**

```bash
npx vitest run components/yard/__tests__/ScheduleEditor.test.tsx
```
Expected: 3/3 pass.

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```
Expected: errors in YardEditForm/SectionForm (they still pass the old props). Fixed in tasks 9 and 10.

- [ ] **Step 7: Commit**

```bash
git add components/yard/ScheduleEditor.tsx components/yard/__tests__/
git commit -m "Rewrite ScheduleEditor to bind to structured fields"
```

---

### Task 9: Migrate YardEditForm to the new ScheduleEditor + inline warnings

**Files:**
- Modify: `components/yard/YardEditForm.tsx`

- [ ] **Step 1: Read the form**

```bash
cat components/yard/YardEditForm.tsx
```
Find the existing `<ScheduleEditor>` invocations (likely two, one for watering and one for mowing) and the watering/mowing form fields.

- [ ] **Step 2: Replace ScheduleEditor invocations**

In the form, replace the two old `<ScheduleEditor>` calls with:

```tsx
<ScheduleEditor
  kind="watering"
  days={watch("wateringDays") ?? []}
  time={watch("wateringTime") ?? null}
  secondaryValue={watch("wateringMinutesPerSession") ?? null}
  onDaysChange={(v) => setValue("wateringDays", v)}
  onTimeChange={(v) => setValue("wateringTime", v)}
  onSecondaryChange={(v) => setValue("wateringMinutesPerSession", v)}
/>
<WateringWarning
  latestAnalysis={latestAnalysis}
  currentDayCount={(watch("wateringDays") ?? []).length}
  currentMinutes={watch("wateringMinutesPerSession") ?? null}
/>
<ScheduleEditor
  kind="mowing"
  days={watch("mowingDays") ?? []}
  time={watch("mowingTime") ?? null}
  secondaryValue={watch("mowingHeightInches") ?? null}
  onDaysChange={(v) => setValue("mowingDays", v)}
  onTimeChange={(v) => setValue("mowingTime", v)}
  onSecondaryChange={(v) => setValue("mowingHeightInches", v)}
/>
<MowingWarning
  latestAnalysis={latestAnalysis}
  currentDayCount={(watch("mowingDays") ?? []).length}
  currentHeight={watch("mowingHeightInches") ?? null}
/>
```

Add `latestAnalysis` to the form's Props interface (`{ wateringSuggestedDaysPerWeek?: number | null; wateringSuggestedMinutesPerSession?: number | null; mowingSuggestedDaysPerWeek?: number | null; mowingSuggestedHeightInches?: number | null }`), or `null`. Update the caller (yard edit page) to pass the latest analysis.

Update `defaultValues` to seed all four new fields per the form's `initialData`:
```ts
wateringDays: initialData.wateringDays ?? [],
wateringTime: initialData.wateringTime ?? null,
mowingDays: initialData.mowingDays ?? [],
mowingTime: initialData.mowingTime ?? null,
```

Drop the old `wateringSchedule` / `mowingSchedule` from `defaultValues`, `Props`, and form state.

- [ ] **Step 3: Add the WateringWarning + MowingWarning inline components in the same file**

At the top of `YardEditForm.tsx`, after imports, define:

```tsx
function WateringWarning({ latestAnalysis, currentDayCount, currentMinutes }: {
  latestAnalysis: { wateringSuggestedDaysPerWeek: number | null; wateringSuggestedMinutesPerSession: number | null } | null;
  currentDayCount: number;
  currentMinutes: number | null;
}) {
  if (!latestAnalysis) return null;
  const suggestedDays = latestAnalysis.wateringSuggestedDaysPerWeek;
  const suggestedMin = latestAnalysis.wateringSuggestedMinutesPerSession;
  const issues: string[] = [];
  if (suggestedDays != null && currentDayCount > 0 && suggestedDays !== currentDayCount) {
    issues.push(`We recommend ${suggestedDays} day${suggestedDays === 1 ? "" : "s"} per week; you've selected ${currentDayCount}.`);
  }
  if (suggestedMin != null && currentMinutes != null && suggestedMin !== currentMinutes) {
    issues.push(`We recommend ${suggestedMin} min per session; you've entered ${currentMinutes}.`);
  }
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-1 text-sm text-amber-900">
      {issues.map((m, i) => <p key={i}>{m}</p>)}
    </div>
  );
}

function MowingWarning({ latestAnalysis, currentDayCount, currentHeight }: {
  latestAnalysis: { mowingSuggestedDaysPerWeek: number | null; mowingSuggestedHeightInches: number | null } | null;
  currentDayCount: number;
  currentHeight: number | null;
}) {
  if (!latestAnalysis) return null;
  const suggestedDays = latestAnalysis.mowingSuggestedDaysPerWeek;
  const suggestedHeight = latestAnalysis.mowingSuggestedHeightInches;
  const issues: string[] = [];
  if (suggestedDays != null && currentDayCount > 0 && suggestedDays !== currentDayCount) {
    issues.push(`We recommend ${suggestedDays} day${suggestedDays === 1 ? "" : "s"} per week; you've selected ${currentDayCount}.`);
  }
  if (suggestedHeight != null && currentHeight != null && suggestedHeight !== currentHeight) {
    issues.push(`We recommend ${suggestedHeight} inches; you've entered ${currentHeight}.`);
  }
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-1 text-sm text-amber-900">
      {issues.map((m, i) => <p key={i}>{m}</p>)}
    </div>
  );
}
```

- [ ] **Step 4: Update the yard edit page caller**

In `app/(dashboard)/yard/[id]/edit/page.tsx`, the page already loads the yard. Add a `latestAnalysis` query for **the yard's earliest section** (any section's latest analysis), since the warning needs the AI's recommendation:

```ts
const latestAnalysis = await db.lawnAnalysis.findFirst({
  where: { yardSection: { yardId } },
  orderBy: { createdAt: "desc" },
  select: {
    wateringSuggestedDaysPerWeek: true,
    wateringSuggestedMinutesPerSession: true,
    mowingSuggestedDaysPerWeek: true,
    mowingSuggestedHeightInches: true,
  },
});
```
Pass `latestAnalysis` into `<YardEditForm />`. If the yard has no analyses, pass `null` and the warning components return null.

- [ ] **Step 5: Type check + tests**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/yard/YardEditForm.tsx "app/(dashboard)/yard/[id]/edit/page.tsx"
git commit -m "Wire YardEditForm to structured schedule with inline warnings"
```

---

### Task 10: Migrate SectionForm to the new ScheduleEditor + inline warnings

**Files:**
- Modify: `components/yard/SectionForm.tsx`
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx`
- Modify: `app/(dashboard)/yard/[id]/sections/new/page.tsx`

- [ ] **Step 1: Update SectionForm to use ScheduleEditor + warnings**

In `components/yard/SectionForm.tsx`:

1. Drop the existing free-text `wateringSchedule` / `mowingSchedule` textarea inputs (lines around 390-405 per the prior grep).
2. Drop the four override `<NumberInput>` blocks added in the prior spec (`wateringDaysPerWeek`, etc.). They're replaced by the ScheduleEditor.
3. Drop `wateringSchedule` and `mowingSchedule` from `defaultValues` and `Props.initialData`.
4. Drop the four `Props.yard*` placeholder props (yardWateringDaysPerWeek, etc.).
5. Add a new `latestAnalysis` prop with the same shape as YardEditForm.
6. Add new `defaultValues` keys: `wateringDays`, `wateringTime`, `mowingDays`, `mowingTime`.
7. Inside the plan-gated section (`canSetSectionSchedule(plan)` branch), render the same ScheduleEditor + Warning block as YardEditForm — but binding to the section override fields. Copy the WateringWarning and MowingWarning components into this file, or import from YardEditForm (lift them into a shared file).

Actually, lift the warnings: create `components/yard/ScheduleWarnings.tsx`:

```tsx
export function WateringWarning({ /* same as task 9 */ }) { /* same */ }
export function MowingWarning({ /* same */ }) { /* same */ }
```

Then both YardEditForm and SectionForm import them. Update Task 9 retroactively if needed; this task lifts the warnings into a shared file.

- [ ] **Step 2: Update the two caller pages**

In `app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx`, the page already fetches the section. Add a `latestAnalysis` query (same query as Task 9 but scoped to this single section) and pass it to `<SectionForm />`. Also expand the yard select to include `wateringDays`, `wateringTime`, `mowingDays`, `mowingTime`, and the section select to include the same fields.

In `app/(dashboard)/yard/[id]/sections/new/page.tsx`, no `latestAnalysis` is available for a brand-new section — pass `null`. The form will show no warnings.

In `app/(dashboard)/yard/[id]/edit/page.tsx` (the yard edit page that renders SectionForm inline if needed), pass `latestAnalysis` too.

- [ ] **Step 3: Type check + tests**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/yard/SectionForm.tsx components/yard/ScheduleWarnings.tsx components/yard/YardEditForm.tsx "app/(dashboard)/"
git commit -m "Migrate SectionForm to ScheduleEditor and lift inline warnings"
```

---

### Task 11: Push trigger predicates for reminders and weather alerts

Add four new pure predicates in `lib/push/triggers.ts` and unit-test them.

**Files:**
- Modify: `lib/push/triggers.ts`
- Modify: `lib/push/__tests__/triggers.test.ts` (or create if not present)

- [ ] **Step 1: Write the failing tests**

In `lib/push/__tests__/triggers.test.ts`, append:

```ts
import { shouldPushWateringReminder, shouldPushMowingReminder, shouldPushWateringWeatherWarning, shouldPushMowingWeatherWarning } from "@/lib/push/triggers";

describe("shouldPushWateringReminder", () => {
  it("returns true when today is scheduled and time is set", () => {
    expect(shouldPushWateringReminder({ effective: { days: ["Mon"], time: "07:00" }, todayIsScheduled: true })).toBe(true);
  });
  it("returns false when today is not a scheduled day", () => {
    expect(shouldPushWateringReminder({ effective: { days: ["Mon"], time: "07:00" }, todayIsScheduled: false })).toBe(false);
  });
  it("returns false when days array is empty", () => {
    expect(shouldPushWateringReminder({ effective: { days: [], time: "07:00" }, todayIsScheduled: true })).toBe(false);
  });
  it("returns false when time is null", () => {
    expect(shouldPushWateringReminder({ effective: { days: ["Mon"], time: null }, todayIsScheduled: true })).toBe(false);
  });
});

describe("shouldPushMowingReminder", () => {
  it("mirrors watering — true on a scheduled day with time", () => {
    expect(shouldPushMowingReminder({ effective: { days: ["Sat"], time: "08:00" }, todayIsScheduled: true })).toBe(true);
  });
  it("false when not scheduled today", () => {
    expect(shouldPushMowingReminder({ effective: { days: ["Sat"], time: "08:00" }, todayIsScheduled: false })).toBe(false);
  });
});

describe("shouldPushWateringWeatherWarning", () => {
  it("triggers on rain chance >= 50%", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.7, rainfallInches: 0 } })).toBe(true);
  });
  it("triggers on rainfall >= 0.25 inches", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.1, rainfallInches: 0.3 } })).toBe(true);
  });
  it("does not trigger on light rain forecast", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.2, rainfallInches: 0.1 } })).toBe(false);
  });
  it("does not trigger when not a scheduled day", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: false, todayForecast: { chanceOfRain: 0.9, rainfallInches: 1.0 } })).toBe(false);
  });
  it("does not trigger when forecast is null", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: null })).toBe(false);
  });
});

describe("shouldPushMowingWeatherWarning", () => {
  it("triggers on rainfall >= 0.10 inches (tighter than watering)", () => {
    expect(shouldPushMowingWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.1, rainfallInches: 0.15 } })).toBe(true);
  });
  it("does not trigger on rainfall below threshold", () => {
    expect(shouldPushMowingWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.1, rainfallInches: 0.05 } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run lib/push/__tests__/triggers.test.ts
```
Expected: FAIL — predicates not exported.

- [ ] **Step 3: Implement the predicates**

Append to `lib/push/triggers.ts`:

```ts
export function shouldPushWateringReminder(
  { effective, todayIsScheduled }: { effective: { days: string[]; time: string | null }; todayIsScheduled: boolean },
): boolean {
  return todayIsScheduled && effective.days.length > 0 && !!effective.time;
}

export function shouldPushMowingReminder(
  { effective, todayIsScheduled }: { effective: { days: string[]; time: string | null }; todayIsScheduled: boolean },
): boolean {
  return todayIsScheduled && effective.days.length > 0 && !!effective.time;
}

export function shouldPushWateringWeatherWarning(
  { todayIsScheduled, todayForecast }: { todayIsScheduled: boolean; todayForecast: { chanceOfRain: number; rainfallInches: number } | null },
): boolean {
  if (!todayIsScheduled || !todayForecast) return false;
  return todayForecast.chanceOfRain >= 0.5 || todayForecast.rainfallInches >= 0.25;
}

export function shouldPushMowingWeatherWarning(
  { todayIsScheduled, todayForecast }: { todayIsScheduled: boolean; todayForecast: { chanceOfRain: number; rainfallInches: number } | null },
): boolean {
  if (!todayIsScheduled || !todayForecast) return false;
  return todayForecast.chanceOfRain >= 0.5 || todayForecast.rainfallInches >= 0.10;
}
```

- [ ] **Step 4: Run tests, confirm passing**

```bash
npx vitest run lib/push/__tests__/triggers.test.ts
```
Expected: all new tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/push/triggers.ts lib/push/__tests__/triggers.test.ts
git commit -m "Add push trigger predicates for schedule reminders and weather alerts"
```

---

### Task 12: Rewrite `lib/cron/reminder-scheduler.ts` for structured fields

Replace the JSON-parsing `getTodayReminders` with a structured-field version.

**Files:**
- Modify: `lib/cron/reminder-scheduler.ts`
- Modify: `lib/__tests__/reminder-scheduler.test.ts`

- [ ] **Step 1: Update the failing tests**

Replace the existing test contents with structured fixtures:

```ts
import { describe, it, expect } from "vitest";
import { getTodayReminders } from "@/lib/cron/reminder-scheduler";

const monday = new Date("2026-06-22T00:00:00Z"); // a known Monday
const tuesday = new Date("2026-06-23T00:00:00Z");

describe("getTodayReminders (structured)", () => {
  it("returns no reminders when no schedules", () => {
    expect(getTodayReminders([{ name: "Front", yardName: "Home", effectiveWatering: { days: [], time: null, minutesPerSession: null }, effectiveMowing: { days: [], time: null, heightInches: null } }], monday, 0)).toEqual([]);
  });

  it("returns watering reminder when today matches a watering day", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: ["Mon","Wed","Fri"], time: "07:00", minutesPerSession: 20 },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    const result = getTodayReminders(sections, monday, 0);
    expect(result).toEqual([
      { sectionName: "Front", yardName: "Home", mowing: null, watering: { time: "07:00", minutes: 20 } },
    ]);
  });

  it("returns mowing reminder when today matches a mowing day", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: [], time: null, minutesPerSession: null },
      effectiveMowing: { days: ["Mon"], time: "08:00", heightInches: 3.0 },
    }];
    const result = getTodayReminders(sections, monday, 0);
    expect(result).toEqual([
      { sectionName: "Front", yardName: "Home", mowing: { time: "08:00", inches: 3.0 }, watering: null },
    ]);
  });

  it("respects daysBefore offset", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: ["Tue"], time: "07:00", minutesPerSession: 20 },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    expect(getTodayReminders(sections, monday, 1).length).toBe(1);
    expect(getTodayReminders(sections, monday, 0).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run lib/__tests__/reminder-scheduler.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Rewrite `lib/cron/reminder-scheduler.ts`**

Replace the file's contents:

```ts
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] as const;

export interface ScheduledReminder {
  sectionName: string;
  yardName: string;
  mowing: { time: string; inches: number } | null;
  watering: { time: string; minutes: number } | null;
}

interface EffectiveWatering {
  days: string[];
  time: string | null;
  minutesPerSession: number | null;
}

interface EffectiveMowing {
  days: string[];
  time: string | null;
  heightInches: number | null;
}

export function getTodayReminders(
  sections: Array<{
    name: string;
    yardName: string;
    effectiveWatering: EffectiveWatering;
    effectiveMowing: EffectiveMowing;
  }>,
  today: Date,
  daysBefore: number,
): ScheduledReminder[] {
  const checkDate = new Date(today);
  checkDate.setUTCDate(checkDate.getUTCDate() + daysBefore);
  const dayAbbr = DAY_NAMES[checkDate.getUTCDay()];

  const reminders: ScheduledReminder[] = [];
  for (const section of sections) {
    let watering: ScheduledReminder["watering"] = null;
    let mowing: ScheduledReminder["mowing"] = null;

    if (
      section.effectiveWatering.days.includes(dayAbbr) &&
      section.effectiveWatering.time &&
      section.effectiveWatering.minutesPerSession != null
    ) {
      watering = { time: section.effectiveWatering.time, minutes: section.effectiveWatering.minutesPerSession };
    }
    if (
      section.effectiveMowing.days.includes(dayAbbr) &&
      section.effectiveMowing.time &&
      section.effectiveMowing.heightInches != null
    ) {
      mowing = { time: section.effectiveMowing.time, inches: section.effectiveMowing.heightInches };
    }

    if (watering || mowing) {
      reminders.push({ sectionName: section.name, yardName: section.yardName, mowing, watering });
    }
  }
  return reminders;
}
```

- [ ] **Step 4: Run tests, confirm passing**

```bash
npx vitest run lib/__tests__/reminder-scheduler.test.ts
```
Expected: all new tests pass. The old JSON-parsing test file is fully replaced.

- [ ] **Step 5: Commit**

```bash
git add lib/cron/reminder-scheduler.ts lib/__tests__/reminder-scheduler.test.ts
git commit -m "Rewrite reminder-scheduler to read structured schedule fields"
```

---

### Task 13: Rewrite the daily-tasks cron route

Migrate the cron to:
1. Filter users by `wateringDays.length > 0` / `mowingDays.length > 0` instead of `wateringSchedule: { not: null }`.
2. Compute `effectiveWatering`/`effectiveMowing` per section.
3. Call the new push predicates and send watering/mowing reminder pushes + weather alert pushes.
4. Gate each channel via the new master + per-type toggles.
5. Pass structured data to `getTodayReminders`.

**Files:**
- Modify: `app/api/cron/daily-tasks/route.ts`

This is the biggest single file change in the plan. Read it in full first.

- [ ] **Step 1: Read the route**

```bash
wc -l app/api/cron/daily-tasks/route.ts
```
Open it. Identify the four key blocks: (1) reminderUsers query around line 135; (2) email digest building around line 530; (3) push sends; (4) any other reference to `wateringSchedule` / `mowingSchedule`.

- [ ] **Step 2: Update the reminderUsers query**

Replace the existing `OR: [{ mowingSchedule: { not: null } }, ...]` filter (around line 140 and again at line 160) with structured filters:

```ts
OR: [
  { wateringDays: { isEmpty: false } },
  { mowingDays: { isEmpty: false } },
  { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
],
```

The yard nested select at line 165-178 changes too. Replace `mowingSchedule: true, wateringSchedule: true` with:
```ts
wateringDays: true,
wateringTime: true,
wateringMinutesPerSession: true,
mowingDays: true,
mowingTime: true,
mowingHeightInches: true,
```
And on each section in the same select, the same six fields.

Also add to the User select: `emailNotificationsEnabled: true, pushNotificationsEnabled: true, taskPushEnabled: true, schedulePushEnabled: true, weatherEmailEnabled: true, weatherPushEnabled: true` so the cron has every toggle in scope.

- [ ] **Step 3: Compute effective schedules and build scheduledReminders**

Inside the `mapWithConcurrency` user loop, where the existing code calls `getTodayReminders` (around line 533-546):

```ts
const sections = reminderUser.yards.flatMap((y) =>
  y.sections.map((s) => ({
    name: s.name,
    yardName: y.name,
    effectiveWatering: effectiveWatering(s, y, reminderUser.plan ?? null),
    effectiveMowing: effectiveMowing(s, y, reminderUser.plan ?? null),
  }))
);
scheduledReminders = getTodayReminders(sections, today, user.reminderDaysBefore);
```

Import `effectiveWatering` and `effectiveMowing` at the top:
```ts
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";
```

- [ ] **Step 4: Add push predicate calls per section**

After the reminders are computed for the user, add push delivery (assuming a `sendPushToUser` helper already exists in `lib/push/send.ts` — if not, the engineer should follow the existing pattern for sending GDD/overdue pushes):

```ts
import {
  shouldPushWateringReminder,
  shouldPushMowingReminder,
  shouldPushWateringWeatherWarning,
  shouldPushMowingWeatherWarning,
} from "@/lib/push/triggers";

// ...within the per-user loop, after scheduledReminders is built:

if (user.pushNotificationsEnabled && user.schedulePushEnabled) {
  for (const section of sections) {
    const todayDay = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][today.getUTCDay()];
    const todayIsWater = section.effectiveWatering.days.includes(todayDay);
    const todayIsMow = section.effectiveMowing.days.includes(todayDay);

    if (shouldPushWateringReminder({ effective: section.effectiveWatering, todayIsScheduled: todayIsWater })) {
      await sendPushToUser(userId, { title: "Watering reminder", body: `${section.yardName}: water for ${section.effectiveWatering.minutesPerSession} minutes today.` });
      emitWateringReminderPushed({ sectionId: section.name, userId });
    }
    if (shouldPushMowingReminder({ effective: section.effectiveMowing, todayIsScheduled: todayIsMow })) {
      await sendPushToUser(userId, { title: "Mowing reminder", body: `${section.yardName}: mow today at ${section.effectiveMowing.heightInches} inches.` });
      emitMowingReminderPushed({ sectionId: section.name, userId });
    }
  }
}

if (user.pushNotificationsEnabled && user.weatherPushEnabled) {
  // Pull todayForecast from the weatherByZip map for each yard
  for (const section of sections) {
    const yardZip = reminderUser.yards.find((y) => y.name === section.yardName)?.zipCode;
    const wx = yardZip ? weatherByZip.get(yardZip) : null;
    const todayForecast = wx ? { chanceOfRain: wx.today.chanceOfRain, rainfallInches: wx.today.rainfallInches } : null;
    const todayDay = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][today.getUTCDay()];
    const todayIsWater = section.effectiveWatering.days.includes(todayDay);
    const todayIsMow = section.effectiveMowing.days.includes(todayDay);
    if (shouldPushWateringWeatherWarning({ todayIsScheduled: todayIsWater, todayForecast })) {
      await sendPushToUser(userId, { title: "Rain expected today", body: `${section.yardName}: rain is forecast on your watering day. You may want to skip.` });
      emitWateringWeatherAlerted({ sectionId: section.name, userId, reason: "rain_forecast" });
    }
    if (shouldPushMowingWeatherWarning({ todayIsScheduled: todayIsMow, todayForecast })) {
      await sendPushToUser(userId, { title: "Wet grass forecast", body: `${section.yardName}: rain is forecast on your mowing day. Wet grass mows poorly.` });
      emitMowingWeatherAlerted({ sectionId: section.name, userId, reason: "rain_forecast" });
    }
  }
}
```

(`sendPushToUser` invocation may differ from this signature — match the helper that already exists in the codebase for GDD/overdue pushes.)

- [ ] **Step 5: Gate the email digest send on `emailNotificationsEnabled`**

In the existing email digest send block:

```ts
if (
  user.emailNotificationsEnabled &&
  (overdueTasks.length > 0 || upcomingTasks.length > 0 || scheduledReminders.length > 0 || weatherAlerts.length > 0)
) {
  // (existing resend.emails.send call)
}
```

Also gate `overdueTasks`/`upcomingTasks` rendering on `user.notificationsEnabled` (which now only controls email task content), and `scheduledReminders` on `user.reminderNotificationsEnabled`.

- [ ] **Step 6: Type check and run suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/daily-tasks/route.ts
git commit -m "Rewrite cron to use structured schedule and per-channel push gating"
```

---

### Task 14: Add weather-alerts list builder + email digest section

The email digest now includes a "Weather alerts" section listing scheduled days in the next 5 days where the forecast triggers a watering/mowing warning.

**Files:**
- Create: `lib/email/weather-alerts.ts`
- Create: `lib/email/__tests__/weather-alerts.test.ts`
- Modify: `lib/email.ts` (the `buildDigestEmail` function)
- Modify: `app/api/cron/daily-tasks/route.ts` (build the list and pass to `buildDigestEmail`)

- [ ] **Step 1: Write the failing test**

Create `lib/email/__tests__/weather-alerts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildWeatherAlerts } from "@/lib/email/weather-alerts";

const today = new Date("2026-06-22T00:00:00Z"); // a Monday

describe("buildWeatherAlerts", () => {
  it("returns empty when no sections have schedules", () => {
    const result = buildWeatherAlerts({
      sections: [],
      forecastByZip: new Map(),
      today,
    });
    expect(result).toEqual([]);
  });

  it("returns an alert when a scheduled watering day has rain forecast", () => {
    const sections = [{
      yardName: "Home",
      yardZip: "30301",
      effectiveWatering: { days: ["Wed"], time: "07:00", minutesPerSession: 20 },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    const forecastByZip = new Map([
      ["30301", [
        { date: today, chanceOfRain: 0.1, rainfallInches: 0 },
        { date: new Date("2026-06-23T00:00:00Z"), chanceOfRain: 0.1, rainfallInches: 0 },
        { date: new Date("2026-06-24T00:00:00Z"), chanceOfRain: 0.7, rainfallInches: 0.4 }, // Wed
      ]],
    ]);
    const result = buildWeatherAlerts({ sections, forecastByZip, today });
    expect(result).toEqual([{
      yardName: "Home",
      date: "Wednesday, June 24",
      kind: "watering",
      reason: "Rain expected (70%)",
    }]);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npx vitest run lib/email/__tests__/weather-alerts.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/email/weather-alerts.ts`**

```ts
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] as const;
const LONG_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"] as const;

export type WeatherAlert = {
  yardName: string;
  date: string;       // "Wednesday, June 24"
  kind: "watering" | "mowing";
  reason: string;
};

interface ForecastDay {
  date: Date;
  chanceOfRain: number;
  rainfallInches: number;
}

interface SectionInput {
  yardName: string;
  yardZip: string;
  effectiveWatering: { days: string[]; time: string | null; minutesPerSession: number | null };
  effectiveMowing: { days: string[]; time: string | null; heightInches: number | null };
}

export function buildWeatherAlerts(
  { sections, forecastByZip, today }: { sections: SectionInput[]; forecastByZip: Map<string, ForecastDay[]>; today: Date }
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  for (const section of sections) {
    const forecast = forecastByZip.get(section.yardZip);
    if (!forecast) continue;
    for (const day of forecast) {
      const dayName = DAY_NAMES[day.date.getUTCDay()];
      const dateLabel = `${LONG_NAMES[day.date.getUTCDay()]}, ${MONTHS[day.date.getUTCMonth()]} ${day.date.getUTCDate()}`;
      if (section.effectiveWatering.days.includes(dayName)) {
        if (day.chanceOfRain >= 0.5 || day.rainfallInches >= 0.25) {
          alerts.push({
            yardName: section.yardName,
            date: dateLabel,
            kind: "watering",
            reason: `Rain expected (${Math.round(day.chanceOfRain * 100)}%)`,
          });
        }
      }
      if (section.effectiveMowing.days.includes(dayName)) {
        if (day.chanceOfRain >= 0.5 || day.rainfallInches >= 0.10) {
          alerts.push({
            yardName: section.yardName,
            date: dateLabel,
            kind: "mowing",
            reason: `Rain expected (${Math.round(day.chanceOfRain * 100)}%)`,
          });
        }
      }
    }
  }
  return alerts;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/email/__tests__/weather-alerts.test.ts
```
Expected: pass.

- [ ] **Step 5: Update `buildDigestEmail` to accept and render the alerts**

In `lib/email.ts`, add `weatherAlerts: WeatherAlert[]` to the `opts` shape of `buildDigestEmail`. Add a rendering section after the scheduledReminders block:

```ts
${weatherAlerts.length > 0 ? `
<h2 style="color:#92400e;font-size:16px;">Weather alerts</h2>
<ul style="padding-left:18px;">
${weatherAlerts.map((a) => `<li>${a.yardName} — ${a.kind} on ${a.date}: ${a.reason}</li>`).join("")}
</ul>
` : ""}
```

- [ ] **Step 6: Wire the cron to call `buildWeatherAlerts` and pass to `buildDigestEmail`**

Inside the daily-tasks cron user loop, gate on `user.weatherEmailEnabled` and compute the alerts:

```ts
let weatherAlerts: WeatherAlert[] = [];
if (user.weatherEmailEnabled) {
  const forecastByZip = /* convert weatherByZip to ForecastDay[] structure */;
  weatherAlerts = buildWeatherAlerts({ sections, forecastByZip, today });
}
```

Pass `weatherAlerts` to `buildDigestEmail`.

The conversion of the existing `weatherByZip` map values into `ForecastDay[]` depends on the existing `WeatherSummary` shape. Map it field-by-field (date, chanceOfRain, rainfallInches).

- [ ] **Step 7: Type check + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add lib/email/ lib/email.ts app/api/cron/daily-tasks/route.ts
git commit -m "Add weather alerts to daily email digest"
```

---

### Task 15: Settings UI rewrite + API endpoint

Replace `components/settings/NotificationPreferences.tsx` with a 4-category layout. Update the save endpoint to accept the six new keys.

**Files:**
- Modify: `components/settings/NotificationPreferences.tsx`
- Modify: `app/api/user/notifications/route.ts`
- Modify: `app/(dashboard)/settings/page.tsx` (pass the new initial values)

- [ ] **Step 1: Rewrite the component**

Read the existing file. Replace the entire body with the 4-section layout plus master switches. Pseudocode (real implementation matches existing Tailwind/component patterns):

```tsx
"use client";
// ...existing imports
import { Switch } from "@/components/ui/switch";

interface Props {
  initialEmailEnabled: boolean;
  initialPushEnabled: boolean;
  initialTaskEmail: boolean;
  initialTaskPush: boolean;
  initialScheduleEmail: boolean;
  initialSchedulePush: boolean;
  initialWeatherEmail: boolean;
  initialWeatherPush: boolean;
  initialGddPush: boolean;
  // ...timing dropdowns kept from existing implementation
}

export function NotificationPreferences(props: Props) {
  // useState for each toggle and dropdown
  const [emailMaster, setEmailMaster] = useState(props.initialEmailEnabled);
  const [pushMaster, setPushMaster] = useState(props.initialPushEnabled);
  // ...etc.

  async function save() {
    const res = await fetch("/api/user/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailNotificationsEnabled: emailMaster,
        pushNotificationsEnabled: pushMaster,
        notificationsEnabled: taskEmail,        // existing column
        taskPushEnabled: taskPush,              // new
        reminderNotificationsEnabled: scheduleEmail, // existing column
        schedulePushEnabled: schedulePush,      // new
        weatherEmailEnabled,                    // new
        weatherPushEnabled,                     // new
        gddNotificationsEnabled: gddPush,       // existing column
        notifyDaysAhead,
        reminderDaysBefore,
        gddBestDayReminderDays,
      }),
    });
    // ...existing save flow
  }

  return (
    <div className="space-y-6">
      {/* Master toggles */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Pause all notifications</h3>
        <div className="flex items-center justify-between py-1">
          <Label>All email</Label>
          <Switch checked={emailMaster} onCheckedChange={setEmailMaster} />
        </div>
        <div className="flex items-center justify-between py-1">
          <Label>All push</Label>
          <Switch checked={pushMaster} onCheckedChange={setPushMaster} />
        </div>
      </div>

      <div className="border-t" />

      {/* Task reminders */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Task reminders</h3>
        <div className="flex items-center justify-between py-1">
          <Label>Email digest</Label>
          <Switch checked={taskEmail} onCheckedChange={setTaskEmail} disabled={!emailMaster} />
        </div>
        <div className="flex items-center justify-between py-1">
          <Label>Push</Label>
          <Switch checked={taskPush} onCheckedChange={setTaskPush} disabled={!pushMaster} />
        </div>
        {/* notifyDaysAhead dropdown */}
      </div>

      {/* Schedule reminders */}
      {/* Weather alerts */}
      {/* Best day alerts */}

      <Button onClick={save}>Save</Button>
    </div>
  );
}
```

Tailor to the existing components' real shapes. The save handler sends all 9 keys.

- [ ] **Step 2: Update `app/api/user/notifications/route.ts`**

Find the PUT/PATCH handler. Extend its Zod (or manual) parsing to accept all 9 keys including the six new ones, and pass them through to `db.user.update`.

- [ ] **Step 3: Update the settings page**

In `app/(dashboard)/settings/page.tsx`, find where `<NotificationPreferences />` is rendered and add the six new initial values from the loaded user record.

- [ ] **Step 4: Add component test (optional but recommended)**

Create or extend `components/settings/__tests__/NotificationPreferences.test.tsx` to:
1. Verify 8 toggles render (2 master + 6 per-channel).
2. Verify the master push toggle disables the per-type push toggles when off.
3. Verify the save handler sends all 9 keys.

- [ ] **Step 5: Type check + suite**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add components/settings/ app/api/user/notifications/ "app/(dashboard)/settings/"
git commit -m "Rewrite notification settings UI with per-channel master toggles"
```

---

### Task 16: Telemetry events for new pushes

Add four new emitters to `lib/observability/events.ts` and unit-test them.

**Files:**
- Modify: `lib/observability/events.ts`
- Modify: `lib/observability/__tests__/events.test.ts`

- [ ] **Step 1: Append the emitters**

After the existing watering/mowing emitters from the prior spec:

```ts
export function emitWateringReminderPushed(args: { sectionId: string; userId: string }): void {
  logger.info("watering.reminder.pushed", { ...args, kind: "watering.reminder.pushed", ...commonFields() });
}
export function emitMowingReminderPushed(args: { sectionId: string; userId: string }): void {
  logger.info("mowing.reminder.pushed", { ...args, kind: "mowing.reminder.pushed", ...commonFields() });
}
export function emitWateringWeatherAlerted(args: { sectionId: string; userId: string; reason: string }): void {
  logger.info("watering.weather.alerted", { ...args, kind: "watering.weather.alerted", ...commonFields() });
}
export function emitMowingWeatherAlerted(args: { sectionId: string; userId: string; reason: string }): void {
  logger.info("mowing.weather.alerted", { ...args, kind: "mowing.weather.alerted", ...commonFields() });
}
```

- [ ] **Step 2: Add tests**

Append to `lib/observability/__tests__/events.test.ts`:

```ts
import {
  emitWateringReminderPushed, emitMowingReminderPushed,
  emitWateringWeatherAlerted, emitMowingWeatherAlerted,
} from "@/lib/observability/events";

describe("schedule push event emitters", () => {
  it("emits watering.reminder.pushed", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitWateringReminderPushed({ sectionId: "sec_1", userId: "u_1" });
    expect(spy).toHaveBeenCalledWith("watering.reminder.pushed", expect.objectContaining({ kind: "watering.reminder.pushed", sectionId: "sec_1", userId: "u_1" }));
    spy.mockRestore();
  });
  it("emits mowing.reminder.pushed", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitMowingReminderPushed({ sectionId: "sec_1", userId: "u_1" });
    expect(spy).toHaveBeenCalledWith("mowing.reminder.pushed", expect.objectContaining({ kind: "mowing.reminder.pushed" }));
    spy.mockRestore();
  });
  it("emits watering.weather.alerted with reason", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitWateringWeatherAlerted({ sectionId: "sec_1", userId: "u_1", reason: "rain_forecast" });
    expect(spy).toHaveBeenCalledWith("watering.weather.alerted", expect.objectContaining({ reason: "rain_forecast" }));
    spy.mockRestore();
  });
  it("emits mowing.weather.alerted with reason", () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => undefined as never);
    emitMowingWeatherAlerted({ sectionId: "sec_1", userId: "u_1", reason: "rain_forecast" });
    expect(spy).toHaveBeenCalledWith("mowing.weather.alerted", expect.objectContaining({ reason: "rain_forecast" }));
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run lib/observability/__tests__/events.test.ts
```
Expected: all new tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/observability/
git commit -m "Emit schedule push and weather alert telemetry events"
```

---

### Task 17: Drop legacy columns (the cleanup migration)

Now that all code reads/writes the structured columns, drop the legacy JSON `wateringSchedule`/`mowingSchedule` and the derived `*DaysPerWeek` columns.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a second Prisma migration

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Remove these fields from `Yard`:
- `wateringDaysPerWeek`
- `mowingDaysPerWeek`
- `wateringSchedule`
- `mowingSchedule`

And from `YardSection`:
- `wateringDaysPerWeek`
- `mowingDaysPerWeek`
- `wateringSchedule`
- `mowingSchedule`

- [ ] **Step 2: Generate the drop migration**

```bash
npx prisma migrate dev --name drop_legacy_schedule_columns
```
or hand-write the migration as before.

The migration SQL should be:
```sql
ALTER TABLE "Yard" DROP COLUMN "wateringDaysPerWeek", DROP COLUMN "mowingDaysPerWeek", DROP COLUMN "wateringSchedule", DROP COLUMN "mowingSchedule";
ALTER TABLE "YardSection" DROP COLUMN "wateringDaysPerWeek", DROP COLUMN "mowingDaysPerWeek", DROP COLUMN "wateringSchedule", DROP COLUMN "mowingSchedule";
```

- [ ] **Step 3: Apply, regenerate, type-check**

```bash
npx prisma migrate deploy
npx prisma generate
npx tsc --noEmit
```
Expected: clean. If `tsc` reports any reference to the dropped columns, that's a missed migration somewhere — fix it now (likely a stale `.select`/`include`).

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Drop legacy schedule columns now that structured fields are wired everywhere"
```

---

### Task 18: Final verification + cleanup sweep

Confirm no leftover references to the dropped columns, the JSON-parsing code, or the old form fields. The cleanup table from the spec should be fully realized in the code.

- [ ] **Step 1: Sweep for the dropped column names**

```bash
grep -rn "wateringSchedule\|mowingSchedule\|wateringDaysPerWeek\|mowingDaysPerWeek" \
  --include="*.ts" --include="*.tsx" --include="*.prisma" \
  app/ components/ lib/ prisma/ 2>/dev/null
```

Expected: zero hits OR only hits inside the *migration SQL files* (which is fine — migrations are historical). Anything else is a leftover; fix it now in a follow-up commit.

- [ ] **Step 2: Sweep for JSON-parsing code paths**

```bash
grep -rn "JSON\.parse.*wateringSchedule\|JSON\.parse.*mowingSchedule\|hasScheduleDays" \
  --include="*.ts" --include="*.tsx" \
  app/ components/ lib/ 2>/dev/null
```

Expected: zero hits. `hasScheduleDays` was the helper inside the old reminder-scheduler; it should be gone.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Full suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Migration status**

```bash
npx prisma migrate status 2>&1 | head -10
```
If `DIRECT_URL` is set, expected "Database schema is up to date." If not, the prior DIRECT_URL caveat applies — environmental, not a defect.

- [ ] **Step 6: Manual smoke walkthrough**

```bash
npm run dev
```
With a fresh test user on Home Basic:
1. Edit a yard. Pick watering days (Mon/Wed/Fri), a time (07:00), and minutes (20). Save. Verify the row in DB has `wateringDays = ["Mon","Wed","Fri"]`.
2. Run an analysis. Confirm the recommendation card shows "Current: 3 days/week (Mon, Wed, Fri), 20 min/session, 07:00" and the suggested count from the AI.
3. Go to settings. Verify all 8 toggles render. Toggle off "All push" master and confirm the per-type push toggles become disabled visually. Save.
4. Run the cron locally (or trigger via the existing `/api/cron/daily-tasks` endpoint) on a date matching one of your watering days. Verify the digest email (in dev: Resend dashboard or stdout if intercepted) includes the schedule reminder.

With a Home Plus user:
1. Edit a section. Set a different watering override. Save.
2. Confirm the cron picks up the override (the section uses its own days, not the yard's).

- [ ] **Step 7: No commit needed**

This task is verification only. If everything passes, the branch is ready to merge.

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Implementation task |
|---|---|
| Schema additions on Yard/Section/User | Task 1 |
| Schema drops on Yard/Section | Task 17 |
| Migration of JSON data | Task 1 (inside the migration) |
| Effective schedule helper update | Task 3 |
| Apply route narrowing | Task 5 |
| AI deviation warnings on forms | Task 9 (yard) + Task 10 (section) |
| ScheduleEditor rewrite | Task 8 |
| ScheduleRecommendationCard refresh | Task 6 + Task 7 (page wire-up) |
| Push trigger predicates | Task 11 |
| Cron rewrite for structured + push gating | Task 13 |
| Email digest weather alerts | Task 14 |
| Settings UI + API rewrite | Task 15 |
| Telemetry events | Task 16 |
| Cleanup pass / final verification | Task 18 |

**Placeholder scan:** No TBD or TODO in any step. Every code step shows concrete code or commands.

**Type consistency:**
- `effectiveWatering` returns `{ days, time, minutesPerSession }` (Task 3) — same shape consumed by ScheduleRecommendationCard (Task 6), reminder-scheduler (Task 12), push predicates (Task 11), and the cron loop (Task 13).
- `effectiveMowing` returns `{ days, time, heightInches }` — same.
- Push predicate signature: `{ effective: { days: string[]; time: string | null }; todayIsScheduled: boolean }` — matches consumer call sites in Task 13.
- `WeatherAlert` shape: `{ yardName: string; date: string; kind: "watering" | "mowing"; reason: string }` — matches the email template in Task 14.

**Risks for the implementing engineer:**

- Task 1's hand-written data migration (when `DIRECT_URL` is missing) must use Prisma's exact SQL format. The prior Task 1 from the previous spec set the precedent.
- Task 13 is the largest single file change in the plan. Read the existing cron route fully before editing; the per-user loop has many concerns (tasks, reminders, pushes, GDD, email digest) and a careless edit can break unrelated paths.
- Task 17 (drop legacy columns) MUST come after every reader has been migrated. If Task 17 lands too early, the migration will fail or the code will throw at runtime.
- The migration's `~ '^\s*\{'` JSON guard in Task 1 will leave malformed JSON rows with empty `wateringDays` — those users will need to re-set their schedule. Acceptable per spec.
