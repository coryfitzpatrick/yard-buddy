# GDD Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich AI-generated lawn tasks with a `bestDay` field when GDD thresholds indicate optimal treatment timing, surface "Best day: Jun 14" in email digests, and let users configure best-day alert timing in notification preferences.

**Architecture:** New `GddRecord` Prisma model accumulates daily GDD per yard per year. The existing daily cron (`app/api/cron/daily/route.ts`) gets a GDD enrichment block that upserts the record after each weather fetch and sets `bestDay` + `gddThreshold` on matching pending tasks when a threshold fires. Filtering (grass type, state) lives in pure utility functions. Two new `User` preference fields control whether and when best-day alerts fire in the email digest.

**Tech Stack:** Prisma, Next.js App Router, Vitest, Zod, `lib/gdd-utils.ts` (new).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `GddRecord` model; add `gddThreshold`/`bestDay` to `LawnTask`; add `gddNotificationsEnabled`/`gddBestDayReminderDays` to `User` |
| `lib/gdd-utils.ts` | Create | Pure GDD utility functions: compute daily GDD, three applicability filters |
| `lib/__tests__/gdd-utils.test.ts` | Create | Unit tests for all four utility functions |
| `lib/email.ts` | Modify | Add `bestDay` to `DigestTask`; render "Best day" line in upcoming task card |
| `lib/__tests__/digest-email.test.ts` | Modify | Tests for bestDay rendering |
| `lib/validations/notifications.ts` | Modify | Add `gddNotificationsEnabled` + `gddBestDayReminderDays` to Zod schema |
| `lib/__tests__/notifications-validation.test.ts` | Modify | Tests for new validation fields |
| `app/api/user/notifications/route.ts` | Modify | Write new User preference fields |
| `components/settings/NotificationPreferences.tsx` | Modify | Add GDD best-day alert toggle + days-before dropdown |
| `app/(dashboard)/settings/page.tsx` | Modify | Fetch + pass new preference fields to component |
| `app/api/cron/daily/route.ts` | Modify | Add GDD enrichment block; include new user fields; update DigestTask building |

---

## Task 1: Prisma schema — GddRecord + LawnTask fields + User fields

**Files:**
- Modify: `prisma/schema.prisma`

No Vitest tests — pure schema change. Verify with `prisma migrate dev`.

- [ ] **Step 1: Add `GddRecord` model and Yard relation**

In `prisma/schema.prisma`, find the `model Yard` block. Add `gddRecords GddRecord[]` to it (after the existing `sections YardSection[]` line):

```prisma
  sections           YardSection[]
  gddRecords         GddRecord[]
```

Then add the new model at the end of the schema file (before the final newline):

```prisma
model GddRecord {
  id               String   @id @default(cuid())
  yardId           String
  year             Int
  cumulativeGdd    Float    @default(0)
  preEmergentFired Boolean  @default(false)
  grubsFired       Boolean  @default(false)
  overseedingFired Boolean  @default(false)
  lastUpdatedAt    DateTime @updatedAt

  yard Yard @relation(fields: [yardId], references: [id], onDelete: Cascade)

  @@unique([yardId, year])
}
```

- [ ] **Step 2: Add `gddThreshold` and `bestDay` to `LawnTask`**

In the `model LawnTask` block, add these two lines after `productSearchQuery String?`:

```prisma
  productSearchQuery String?
  gddThreshold  String?
  bestDay       DateTime?
```

- [ ] **Step 3: Add GDD notification preferences to `User`**

In the `model User` block, add these two lines after `reminderDaysBefore Int @default(0)`:

```prisma
  reminderDaysBefore           Int       @default(0)
  gddNotificationsEnabled      Boolean   @default(true)
  gddBestDayReminderDays       Int       @default(0)
```

- [ ] **Step 4: Run migration**

```bash
cd /Users/cory/Projects/yard-analyzer
npx prisma migrate dev --name add-gdd-tracking
```

Expected: migration file created, database updated, no errors.

- [ ] **Step 5: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: no errors. `db.gddRecord` is now accessible in TypeScript.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add GddRecord model and gdd fields to LawnTask and User"
```

---

## Task 2: GDD utility functions + tests (TDD)

**Files:**
- Create: `lib/gdd-utils.ts`
- Create: `lib/__tests__/gdd-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/gdd-utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeDailyGdd,
  isPreEmergentApplicable,
  isGrubAlertApplicable,
  isOverseedingApplicable,
} from "../gdd-utils";

describe("computeDailyGdd", () => {
  it("returns positive GDD when avg exceeds base 50", () => {
    expect(computeDailyGdd(80, 60)).toBe(20); // avg 70, 70-50=20
  });
  it("clamps to 0 when avg is below base", () => {
    expect(computeDailyGdd(40, 30)).toBe(0); // avg 35, below 50
  });
  it("returns 0 when avg equals base exactly", () => {
    expect(computeDailyGdd(60, 40)).toBe(0); // avg 50, 50-50=0
  });
  it("returns fractional GDD", () => {
    expect(computeDailyGdd(81, 60)).toBeCloseTo(20.5);
  });
});

describe("isPreEmergentApplicable", () => {
  it("returns true for cool-season grass in any state", () => {
    expect(isPreEmergentApplicable("tall_fescue", "OH")).toBe(true);
    expect(isPreEmergentApplicable("kentucky_bluegrass", "FL")).toBe(true);
  });
  it("returns true for warm-season grass outside deep South", () => {
    expect(isPreEmergentApplicable("bermuda", "VA")).toBe(true);
  });
  it("returns false for warm-season grass in deep South", () => {
    expect(isPreEmergentApplicable("bermuda", "FL")).toBe(false);
    expect(isPreEmergentApplicable("zoysia", "TX")).toBe(false);
  });
  it("is case-insensitive for state code", () => {
    expect(isPreEmergentApplicable("bermuda", "fl")).toBe(false);
    expect(isPreEmergentApplicable("bermuda", "FL")).toBe(false);
  });
  it("returns true when state is empty string", () => {
    expect(isPreEmergentApplicable("bermuda", "")).toBe(true);
  });
});

describe("isGrubAlertApplicable", () => {
  it("returns false for warm-season grass regardless of state", () => {
    expect(isGrubAlertApplicable("bermuda", "OH")).toBe(false);
    expect(isGrubAlertApplicable("zoysia", "NJ")).toBe(false);
    expect(isGrubAlertApplicable("st_augustine", "VA")).toBe(false);
  });
  it("returns true for cool-season grass in Japanese beetle states", () => {
    expect(isGrubAlertApplicable("tall_fescue", "OH")).toBe(true);
    expect(isGrubAlertApplicable("kentucky_bluegrass", "NJ")).toBe(true);
    expect(isGrubAlertApplicable("perennial_ryegrass", "DC")).toBe(true);
  });
  it("returns false for cool-season grass outside Japanese beetle range", () => {
    expect(isGrubAlertApplicable("tall_fescue", "TX")).toBe(false);
    expect(isGrubAlertApplicable("kentucky_bluegrass", "AZ")).toBe(false);
    expect(isGrubAlertApplicable("tall_fescue", "FL")).toBe(false);
  });
  it("is case-insensitive for state code", () => {
    expect(isGrubAlertApplicable("tall_fescue", "oh")).toBe(true);
  });
});

describe("isOverseedingApplicable", () => {
  it("returns true for cool-season grasses", () => {
    expect(isOverseedingApplicable("tall_fescue")).toBe(true);
    expect(isOverseedingApplicable("kentucky_bluegrass")).toBe(true);
    expect(isOverseedingApplicable("perennial_ryegrass")).toBe(true);
  });
  it("returns false for warm-season grasses", () => {
    expect(isOverseedingApplicable("bermuda")).toBe(false);
    expect(isOverseedingApplicable("zoysia")).toBe(false);
    expect(isOverseedingApplicable("st_augustine")).toBe(false);
    expect(isOverseedingApplicable("centipede")).toBe(false);
    expect(isOverseedingApplicable("bahia")).toBe(false);
  });
  it("returns true for unknown grass type", () => {
    expect(isOverseedingApplicable("unknown")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/cory/Projects/yard-analyzer
npx vitest run lib/__tests__/gdd-utils.test.ts
```

Expected: FAIL — `Cannot find module '../gdd-utils'`.

- [ ] **Step 3: Implement `lib/gdd-utils.ts`**

Create `lib/gdd-utils.ts`:

```typescript
const WARM_SEASON_GRASSES = new Set(["bermuda", "zoysia", "st_augustine", "centipede", "bahia"]);
const DEEP_SOUTH_STATES = new Set(["AL", "FL", "GA", "LA", "MS", "SC", "TX"]);
const JAPANESE_BEETLE_STATES = new Set([
  "CT", "DC", "DE", "IA", "IL", "IN", "KY", "MA", "MD", "ME", "MI", "MN",
  "MO", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "TN", "VA", "VT", "WI", "WV",
]);

export function computeDailyGdd(dailyHigh: number, dailyLow: number): number {
  return Math.max(0, (dailyHigh + dailyLow) / 2 - 50);
}

export function isPreEmergentApplicable(grassType: string, state: string): boolean {
  if (!WARM_SEASON_GRASSES.has(grassType)) return true;
  return !DEEP_SOUTH_STATES.has(state.toUpperCase());
}

export function isGrubAlertApplicable(grassType: string, state: string): boolean {
  if (WARM_SEASON_GRASSES.has(grassType)) return false;
  return JAPANESE_BEETLE_STATES.has(state.toUpperCase());
}

export function isOverseedingApplicable(grassType: string): boolean {
  return !WARM_SEASON_GRASSES.has(grassType);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/gdd-utils.test.ts
```

Expected: all 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/gdd-utils.ts lib/__tests__/gdd-utils.test.ts
git commit -m "feat: add GDD utility functions with region and grass-type filtering"
```

---

## Task 3: Email bestDay rendering + tests (TDD)

**Files:**
- Modify: `lib/email.ts`
- Modify: `lib/__tests__/digest-email.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/digest-email.test.ts`, add these two tests inside the existing `describe` block after the last test:

```typescript
it("shows Best day line when bestDay is set on upcoming task", () => {
  const { html } = buildDigestEmail({
    ...BASE_OPTS,
    upcomingTasks: [
      {
        title: "Apply pre-emergent herbicide",
        sectionName: "Front Yard",
        scheduledStart: new Date("2026-06-10"),
        scheduledEnd: new Date("2026-06-17"),
        bestDay: new Date("2026-06-14T00:00:00.000Z"),
      },
    ],
  });
  expect(html).toContain("Best day:");
  expect(html).toContain("Jun 14");
});

it("omits Best day line when bestDay is null", () => {
  const { html } = buildDigestEmail({
    ...BASE_OPTS,
    upcomingTasks: [
      {
        title: "Apply fertilizer",
        sectionName: "Front Yard",
        scheduledStart: new Date("2026-06-10"),
        scheduledEnd: new Date("2026-06-17"),
        bestDay: null,
      },
    ],
  });
  expect(html).not.toContain("Best day:");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/digest-email.test.ts
```

Expected: FAIL — TypeScript error: `bestDay` not in `DigestTask`.

- [ ] **Step 3: Add `bestDay` to `DigestTask` in `lib/email.ts`**

Find the `interface DigestTask` block (around line 33) and add `bestDay`:

```typescript
interface DigestTask {
  title: string;
  sectionName: string;
  overdueNote?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  bestDay?: Date | null;
}
```

- [ ] **Step 4: Render "Best day" line in the upcoming task card**

In `lib/email.ts`, find the `upcomingHtml` block (around line 97). The `.map((t) => { ... })` callback currently builds:

```typescript
return `<div style="border:1px solid #dcfce7;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
    ${dateLabel ? `<div style="color:#16a34a;font-size:12px;font-weight:600;">${dateLabel}</div>` : ""}
  </div>
  <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
</div>`;
```

Replace with this (adds `bestDayLine` between the title row and the section name):

```typescript
const bestDayLine = t.bestDay
  ? `<div style="color:#16a34a;font-size:12px;margin-top:4px;">Best day: ${t.bestDay.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</div>`
  : "";
return `<div style="border:1px solid #dcfce7;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
    ${dateLabel ? `<div style="color:#16a34a;font-size:12px;font-weight:600;">${dateLabel}</div>` : ""}
  </div>
  ${bestDayLine}
  <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
</div>`;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/digest-email.test.ts
```

Expected: all 6 tests pass (4 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/__tests__/digest-email.test.ts
git commit -m "feat: add bestDay rendering to email digest task card"
```

---

## Task 4: Notifications validation schema + API + tests (TDD)

**Files:**
- Modify: `lib/validations/notifications.ts`
- Modify: `lib/__tests__/notifications-validation.test.ts`
- Modify: `app/api/user/notifications/route.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/notifications-validation.test.ts`, add these tests after the last existing test:

```typescript
const VALID_FULL = {
  notificationsEnabled: true,
  notifyDaysAhead: 3,
  reminderNotificationsEnabled: true,
  reminderDaysBefore: 0,
  gddNotificationsEnabled: true,
  gddBestDayReminderDays: 0,
};

it("accepts valid prefs with gdd fields present", () => {
  const result = notificationPrefsSchema.safeParse(VALID_FULL);
  expect(result.success).toBe(true);
});

it("rejects gddBestDayReminderDays above 7", () => {
  const result = notificationPrefsSchema.safeParse({ ...VALID_FULL, gddBestDayReminderDays: 8 });
  expect(result.success).toBe(false);
});

it("rejects negative gddBestDayReminderDays", () => {
  const result = notificationPrefsSchema.safeParse({ ...VALID_FULL, gddBestDayReminderDays: -1 });
  expect(result.success).toBe(false);
});

it("rejects non-boolean gddNotificationsEnabled", () => {
  const result = notificationPrefsSchema.safeParse({ ...VALID_FULL, gddNotificationsEnabled: "yes" });
  expect(result.success).toBe(false);
});

it("rejects missing gddNotificationsEnabled", () => {
  const { gddNotificationsEnabled: _, ...withoutGdd } = VALID_FULL;
  const result = notificationPrefsSchema.safeParse(withoutGdd);
  expect(result.success).toBe(false);
});
```

Note: the existing tests in this file do NOT include `gddNotificationsEnabled` or `gddBestDayReminderDays` in their payloads. After adding the new required fields to the Zod schema, those existing tests will fail. Update each existing test to add the new fields:

In each existing test that calls `notificationPrefsSchema.safeParse({ ... })`, add:
```typescript
gddNotificationsEnabled: true,
gddBestDayReminderDays: 0,
```

The existing tests that already call `safeParse` with an object missing these fields will then reject correctly once the schema requires them — so those tests that test missing/invalid fields don't need the new fields added (they're testing existing fields and will still fail the schema for their intended reason).

Only tests that expect `result.success` to be `true` need the new fields added to their input object.

- [ ] **Step 2: Run tests to verify the right ones fail**

```bash
npx vitest run lib/__tests__/notifications-validation.test.ts
```

Expected: the 5 new tests FAIL (field not in schema yet). The existing tests that pass valid objects also fail (missing new required fields).

- [ ] **Step 3: Update `lib/validations/notifications.ts`**

Replace the entire file content:

```typescript
import { z } from "zod";

export const notificationPrefsSchema = z.object({
  notificationsEnabled: z.boolean(),
  notifyDaysAhead: z.number().int().min(1).max(14),
  reminderNotificationsEnabled: z.boolean(),
  reminderDaysBefore: z.number().int().min(0).max(3),
  gddNotificationsEnabled: z.boolean(),
  gddBestDayReminderDays: z.number().int().min(0).max(7),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/notifications-validation.test.ts
```

Expected: all 15 tests pass (10 existing + 5 new).

- [ ] **Step 5: Update `app/api/user/notifications/route.ts`**

Add the two new fields to the `db.user.update` call:

```typescript
await db.user.update({
  where: { id: session.user.id },
  data: {
    notificationsEnabled: parsed.data.notificationsEnabled,
    notifyDaysAhead: parsed.data.notifyDaysAhead,
    reminderNotificationsEnabled: parsed.data.reminderNotificationsEnabled,
    reminderDaysBefore: parsed.data.reminderDaysBefore,
    gddNotificationsEnabled: parsed.data.gddNotificationsEnabled,
    gddBestDayReminderDays: parsed.data.gddBestDayReminderDays,
  },
});
```

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/validations/notifications.ts lib/__tests__/notifications-validation.test.ts app/api/user/notifications/route.ts
git commit -m "feat: add GDD notification preference fields to schema, API, and tests"
```

---

## Task 5: Settings UI — NotificationPreferences component + settings page

**Files:**
- Modify: `components/settings/NotificationPreferences.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

No new Vitest tests — UI component. Verify visually that the new section renders and saves correctly.

- [ ] **Step 1: Add GDD state and props to `NotificationPreferences`**

In `components/settings/NotificationPreferences.tsx`, update the `Props` interface:

```typescript
interface Props {
  initialEnabled: boolean;
  initialDaysAhead: number;
  initialReminderEnabled: boolean;
  initialReminderDaysBefore: number;
  initialGddEnabled: boolean;
  initialGddBestDayReminderDays: number;
}
```

Add the two new destructured props to the function signature:

```typescript
export function NotificationPreferences({
  initialEnabled,
  initialDaysAhead,
  initialReminderEnabled,
  initialReminderDaysBefore,
  initialGddEnabled,
  initialGddBestDayReminderDays,
}: Props) {
```

Add state for the two new fields (after the existing `reminderDaysBefore` state):

```typescript
const [gddEnabled, setGddEnabled] = useState(initialGddEnabled);
const [gddBestDayReminderDays, setGddBestDayReminderDays] = useState(String(initialGddBestDayReminderDays));
```

- [ ] **Step 2: Include new fields in the `save()` fetch body**

In the `save()` function, update the `body` of the `fetch` call:

```typescript
body: JSON.stringify({
  notificationsEnabled: enabled,
  notifyDaysAhead: Number(daysAhead),
  reminderNotificationsEnabled: reminderEnabled,
  reminderDaysBefore: Number(reminderDaysBefore),
  gddNotificationsEnabled: gddEnabled,
  gddBestDayReminderDays: Number(gddBestDayReminderDays),
}),
```

- [ ] **Step 3: Add GDD best-day section to JSX**

Add a GDD best-day section between the schedule reminders section and the error/save button. Place it after the closing `)}` of the `{reminderEnabled && (...)}` block and after the second `<div className="border-t border-gray-100" />` divider:

```tsx
{/* Divider */}
<div className="border-t border-gray-100" />

{/* GDD best-day alerts */}
<div className="flex items-center justify-between">
  <div>
    <Label htmlFor="gdd-toggle" className="text-sm font-medium text-gray-900">
      Best day alerts
    </Label>
    <p className="text-sm text-gray-500 mt-0.5">
      Alert when GDD thresholds indicate the optimal day for treatments like pre-emergent, grub control, or overseeding.
    </p>
  </div>
  <Switch
    id="gdd-toggle"
    checked={gddEnabled}
    onCheckedChange={setGddEnabled}
  />
</div>

{gddEnabled && (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium text-gray-900">Alert me</Label>
    <Select value={gddBestDayReminderDays} onValueChange={(v) => { if (v != null) setGddBestDayReminderDays(v); }}>
      <SelectTrigger className="w-48" disabled={saving}>
        <SelectValue>{GDD_REMINDER_OPTIONS.find((o) => o.value === gddBestDayReminderDays)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {GDD_REMINDER_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

Add the `GDD_REMINDER_OPTIONS` constant near the top of the file with the existing options arrays:

```typescript
const GDD_REMINDER_OPTIONS = [
  { value: "0", label: "On the best day" },
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "7", label: "1 week before" },
];
```

- [ ] **Step 4: Update `app/(dashboard)/settings/page.tsx`**

In the `db.user.findUniqueOrThrow` select block, add the two new fields:

```typescript
select: {
  notificationsEnabled: true,
  notifyDaysAhead: true,
  reminderNotificationsEnabled: true,
  reminderDaysBefore: true,
  gddNotificationsEnabled: true,
  gddBestDayReminderDays: true,
  passwordHash: true,
  // ... rest unchanged
},
```

Pass the new props to the `<NotificationPreferences>` component:

```tsx
<NotificationPreferences
  initialEnabled={user.notificationsEnabled}
  initialDaysAhead={user.notifyDaysAhead}
  initialReminderEnabled={user.reminderNotificationsEnabled}
  initialReminderDaysBefore={user.reminderDaysBefore}
  initialGddEnabled={user.gddNotificationsEnabled}
  initialGddBestDayReminderDays={user.gddBestDayReminderDays}
/>
```

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/settings/NotificationPreferences.tsx app/(dashboard)/settings/page.tsx
git commit -m "feat: add GDD best-day alert preference to notification settings"
```

---

## Task 6: Cron GDD enrichment block

**Files:**
- Modify: `app/api/cron/daily/route.ts`

No direct unit tests for the cron route. Verify by running the full test suite (no regressions).

- [ ] **Step 1: Add `gdd-utils` import**

At the top of `app/api/cron/daily/route.ts`, add this import after the existing imports:

```typescript
import { computeDailyGdd, isPreEmergentApplicable, isGrubAlertApplicable, isOverseedingApplicable } from "@/lib/gdd-utils";
```

- [ ] **Step 2: Add new user preference fields to the yard fetch user select**

In the `db.yard.findMany` query (around line 37), the `user: { select: { ... } }` block currently ends at `notifyDaysAhead: true`. Add the two new fields:

```typescript
user: {
  select: {
    id: true,
    email: true,
    name: true,
    notificationsEnabled: true,
    reminderNotificationsEnabled: true,
    reminderDaysBefore: true,
    lastNotifiedAt: true,
    notifyDaysAhead: true,
    gddNotificationsEnabled: true,
    gddBestDayReminderDays: true,
  },
},
```

- [ ] **Step 3: Add `currentYear` constant after `today`**

Find the line `const today = startOfToday();` (around line 34) and add immediately after:

```typescript
const today = startOfToday();
const currentYear = today.getUTCFullYear();
```

- [ ] **Step 4: Add GDD enrichment block inside the per-yard loop**

In the existing `// 4. Recalculate windows...` `for (const yard of yards)` loop (around line 140), find the `await db.yard.update({ where: { id: yard.id }, data: { weatherRefreshedAt: new Date() } })` call at the end of each yard iteration. Add the GDD enrichment block AFTER that call, still inside the `for` loop body:

```typescript
    await db.yard.update({
      where: { id: yard.id },
      data: { weatherRefreshedAt: new Date() },
    });

    // GDD enrichment — runs after window recalculation for this yard
    const dailyGdd = computeDailyGdd(
      weather.forecast[0]?.high ?? 0,
      weather.forecast[0]?.low ?? 0,
    );

    const gddRecord = await db.gddRecord.upsert({
      where: { yardId_year: { yardId: yard.id, year: currentYear } },
      create: { yardId: yard.id, year: currentYear, cumulativeGdd: dailyGdd },
      update: { cumulativeGdd: { increment: dailyGdd } },
    });

    const state = yard.state ?? "";

    // Pre-emergent: cumulative GDD ≥ 50
    if (!gddRecord.preEmergentFired && gddRecord.cumulativeGdd >= 50) {
      for (const section of yard.sections) {
        if (!isPreEmergentApplicable(section.grassType, state)) continue;
        await db.lawnTask.updateMany({
          where: {
            yardSectionId: section.id,
            status: "pending",
            title: { contains: "pre-emergent", mode: "insensitive" },
          },
          data: { bestDay: today, gddThreshold: "pre_emergent" },
        });
      }
      await db.gddRecord.update({
        where: { id: gddRecord.id },
        data: { preEmergentFired: true },
      });
    }

    // Grubs: cumulative GDD ≥ 300
    if (!gddRecord.grubsFired && gddRecord.cumulativeGdd >= 300) {
      for (const section of yard.sections) {
        if (!isGrubAlertApplicable(section.grassType, state)) continue;
        await db.lawnTask.updateMany({
          where: {
            yardSectionId: section.id,
            status: "pending",
            title: { contains: "grub", mode: "insensitive" },
          },
          data: { bestDay: today, gddThreshold: "grubs" },
        });
      }
      await db.gddRecord.update({
        where: { id: gddRecord.id },
        data: { grubsFired: true },
      });
    }

    // Overseeding: avg temp < 65°F AND month Aug–Oct (0-indexed: 7–9)
    const month = today.getUTCMonth();
    const avgTemp = ((weather.forecast[0]?.high ?? 0) + (weather.forecast[0]?.low ?? 0)) / 2;
    if (!gddRecord.overseedingFired && month >= 7 && month <= 9 && avgTemp < 65) {
      for (const section of yard.sections) {
        if (!isOverseedingApplicable(section.grassType)) continue;
        await db.lawnTask.updateMany({
          where: {
            yardSectionId: section.id,
            status: "pending",
            title: { contains: "overseed", mode: "insensitive" },
          },
          data: { bestDay: today, gddThreshold: "overseeding" },
        });
      }
      await db.gddRecord.update({
        where: { id: gddRecord.id },
        data: { overseedingFired: true },
      });
    }
```

- [ ] **Step 5: Update `allPendingTasks` query to include new fields**

In the digest section (around line 254), find:

```typescript
const allPendingTasks = await db.lawnTask.findMany({
  where: { yardSection: { yard: { userId } }, status: "pending" },
  include: { yardSection: { select: { name: true } } },
});
```

This `include` already returns all fields, so `bestDay` and `gddThreshold` are already available on each task. No change needed to the query.

- [ ] **Step 6: Update `upcomingTasks` filter to include GDD best-day logic**

Find the `upcomingTasks` filter (around line 263):

```typescript
upcomingTasks = allPendingTasks
  .filter((t) => {
    if (!t.scheduledStart || t.stillWorthDoing !== null) return false;
    const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
    return daysUntilStart >= 0 && daysUntilStart <= user.notifyDaysAhead;
  })
  .map((t) => ({ title: t.title, sectionName: t.yardSection?.name ?? "", scheduledStart: t.scheduledStart, scheduledEnd: t.scheduledEnd }));
```

Replace with:

```typescript
upcomingTasks = allPendingTasks
  .filter((t) => {
    if (t.stillWorthDoing !== null) return false;

    // GDD best-day logic — uses gddBestDayReminderDays instead of notifyDaysAhead
    if (t.bestDay && t.gddThreshold && user.gddNotificationsEnabled) {
      const daysUntilBestDay = (t.bestDay.getTime() - today.getTime()) / 86400000;
      return daysUntilBestDay >= 0 && daysUntilBestDay <= user.gddBestDayReminderDays;
    }

    // Regular upcoming task logic
    if (!t.scheduledStart) return false;
    const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
    return daysUntilStart >= 0 && daysUntilStart <= user.notifyDaysAhead;
  })
  .map((t) => ({
    title: t.title,
    sectionName: t.yardSection?.name ?? "",
    scheduledStart: t.scheduledStart,
    scheduledEnd: t.scheduledEnd,
    bestDay: t.bestDay ?? null,
  }));
```

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (213 total + any new ones from earlier tasks).

- [ ] **Step 8: Commit**

```bash
git add app/api/cron/daily/route.ts
git commit -m "feat: add GDD enrichment block to daily cron and bestDay digest logic"
```

---

## Self-Review

**Spec coverage:**
- ✅ `GddRecord` model with `@@unique([yardId, year])` — Task 1
- ✅ `LawnTask.gddThreshold` + `LawnTask.bestDay` — Task 1
- ✅ `User.gddNotificationsEnabled` + `User.gddBestDayReminderDays` — Task 1
- ✅ `computeDailyGdd` with base 50°F and `max(0, ...)` clamp — Task 2
- ✅ `isPreEmergentApplicable` (warm-season + deep South filter) — Task 2
- ✅ `isGrubAlertApplicable` (warm-season skip + Japanese beetle states) — Task 2
- ✅ `isOverseedingApplicable` (warm-season skip) — Task 2
- ✅ `DigestTask.bestDay` + "Best day" line in email card — Task 3
- ✅ Notification validation for new fields — Task 4
- ✅ API route writes new fields — Task 4
- ✅ Settings UI toggle + dropdown — Task 5
- ✅ Settings page fetches + passes new fields — Task 5
- ✅ Cron GDD upsert + three threshold checks — Task 6
- ✅ `gddBestDayReminderDays`-aware upcomingTasks filter — Task 6
- ✅ No task creation — GDD only enriches pending tasks matching keyword

**Placeholder scan:** No TBDs. All code blocks are complete. All file paths are exact.

**Type consistency:**
- `gddThreshold` is `String?` in Prisma → `string | null` in TypeScript — consistent across Task 1 (schema), Task 6 (cron writes `"pre_emergent"` | `"grubs"` | `"overseeding"`), Task 6 (filter reads `t.gddThreshold`)
- `bestDay` is `DateTime?` in Prisma → `Date | null` in TypeScript — consistent across Task 1 (schema), Task 3 (`DigestTask.bestDay?: Date | null`), Task 6 (cron writes `today` which is a `Date`)
- `computeDailyGdd(high, low)` signature matches call in Task 6: `computeDailyGdd(weather.forecast[0]?.high ?? 0, weather.forecast[0]?.low ?? 0)`
