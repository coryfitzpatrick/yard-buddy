# GDD Tracking Design

## Goal

Track Growing Degree Days (GDD) per yard and enrich existing AI-generated tasks with a `bestDay` field indicating the optimal treatment date — so the task card and email reminders can surface "Best day: June 14" for time-sensitive treatments like pre-emergent herbicide, grub control, and overseeding. No tasks are auto-created; GDD only annotates what AI analysis already generated. Filtered by grass type and region so only relevant thresholds apply.

## Architecture

A new `GddRecord` model accumulates daily GDD per yard per year. The existing daily cron (`app/api/cron/daily/route.ts`) already fetches weather per yard; a new GDD block runs after that fetch, upserts the record, and when a threshold is crossed for the first time that year, finds matching pending tasks in the yard's sections and sets `bestDay` on them. Filtering (grass type + state) lives in pure utility functions. `LawnTask` gains two new nullable fields: `bestDay` (Date) and `gddThreshold` (string tag). User notification preferences gain a GDD best-day alert setting controlling how many days before `bestDay` the email digest includes the task.

**Tech stack:** Prisma, Next.js App Router cron route, `lib/gdd-utils.ts` (new), Vitest.

---

## Data Model

### New: `GddRecord`

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

`@@unique([yardId, year])` gives one record per yard per year. A new calendar year produces a fresh record — all fired flags and cumulative total reset automatically.

### Modified: `LawnTask`

Two new nullable columns:

```prisma
gddThreshold  String?   // "pre_emergent" | "grubs" | "overseeding" — set when GDD enriches the task
bestDay       DateTime? // date the GDD threshold was crossed; null until threshold fires
```

All existing rows default to null for both fields.

### Modified: `User`

Two new notification preference fields:

```prisma
gddNotificationsEnabled  Boolean @default(true)
gddBestDayReminderDays   Int     @default(0)  // 0 = alert on best day; N = alert N days before
```

---

## GDD Formula and Thresholds

### Formula

Base 50°F (turf standard):

```
dailyGdd = max(0, (dailyHigh + dailyLow) / 2 - 50)
```

Negative daily values clamp to 0. GDD never decreases within a year.

### Three thresholds

| Threshold | Trigger | Matching task keyword | `gddThreshold` tag |
|---|---|---|---|
| Pre-emergent | cumulative GDD ≥ 50 | title contains `"pre-emergent"` (case-insensitive) | `"pre_emergent"` |
| Grubs | cumulative GDD ≥ 300 | title contains `"grub"` (case-insensitive) | `"grubs"` |
| Overseeding | avg daily temp < 65°F AND month Aug–Oct | title contains `"overseed"` (case-insensitive) | `"overseeding"` |

Overseeding is temperature-triggered rather than GDD-accumulated, but uses the same `overseedingFired` flag and daily check pattern.

### Filtering (pure functions in `lib/gdd-utils.ts`)

**Warm-season grass types** (`bermuda`, `zoysia`, `st_augustine`, `centipede`, `bahia`):
- Skip grubs threshold entirely
- Skip overseeding threshold entirely
- Skip pre-emergent threshold if yard's state is in the deep South set

**Deep South states** (warm-season pre-emergent skip):
`AL, FL, GA, LA, MS, SC, TX`

**Grubs threshold** additionally restricted to Japanese beetle range:
`CT, DC, DE, IA, IL, IN, KY, MA, MD, ME, MI, MN, MO, NC, NH, NJ, NY, OH, PA, RI, TN, VA, VT, WI, WV`

---

## Task Enrichment

GDD never creates tasks. When a threshold fires for the first time in a year, the cron finds matching pending tasks across all sections of the yard and annotates them.

### Matching

For each section in the yard, query:

```ts
db.lawnTask.findMany({
  where: {
    yardSectionId: section.id,
    status: "pending",
    title: { contains: <keyword>, mode: "insensitive" },
  }
})
```

For matched tasks, set:
- `bestDay = today` (the date the threshold was crossed)
- `gddThreshold = <threshold key>`

Set the fired flag on `GddRecord` in the same Prisma transaction as the task updates.

### Behavior

- `bestDay` is set once (the day the threshold fires) and does not change unless the task is reset to pending in a future year.
- If no tasks match the keyword for a given threshold, the fired flag is still set so the cron doesn't retry.
- Tasks that are already `completed` or `skipped` are excluded — only `pending` tasks are enriched.

---

## Cron Integration

New GDD block in `app/api/cron/daily/route.ts`, executed after the existing per-yard weather fetch loop:

```
for each yard with a zip code:
  if weather fetch failed for this yard: skip
  extract dailyHigh, dailyLow from today's forecast
  compute dailyGdd = computeDailyGdd(dailyHigh, dailyLow)
  upsert GddRecord { yardId, year: currentYear }
    → create: cumulativeGdd = dailyGdd, all fired flags false
    → update: increment cumulativeGdd by dailyGdd
  re-read updated record
  for each threshold [pre_emergent, grubs, overseeding]:
    if already fired: skip
    if not applicable per filter functions: skip
    if threshold not yet crossed: skip
    find matching pending tasks across yard sections by keyword
    set bestDay + gddThreshold on matching tasks (same transaction as setting fired flag)
```

---

## Email Digest

### `DigestTask` interface update (`lib/email.ts`)

```ts
interface DigestTask {
  title: string;
  sectionName: string;
  overdueNote?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  bestDay?: Date | null;  // new
}
```

### Task card rendering

When `bestDay` is set, the upcoming task card in `buildDigestEmail` adds one line:

```html
<div style="color:#16a34a;font-size:12px;margin-top:4px;">
  Best day: June 14
</div>
```

### Digest inclusion logic (cron route)

When building the `upcomingTasks` list for a user's digest, include tasks that have `bestDay` set according to the user's `gddBestDayReminderDays` preference:

- `gddBestDayReminderDays = 0` → include in digest when `bestDay = today`
- `gddBestDayReminderDays = N` → include in digest starting N days before `bestDay`

Tasks without `bestDay` continue to use the existing `notifyDaysAhead` upcoming-task logic.

---

## Notification Preferences UI

Add GDD best-day alert controls to the existing notification preferences settings page:

- Toggle: "Best day alerts" (`gddNotificationsEnabled`)
- When enabled: dropdown "Alert me" → "On the best day" / "1 day before" / "2 days before" / "3 days before" (`gddBestDayReminderDays` = 0, 1, 2, 3)

---

## Files

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `GddRecord` model; add `gddThreshold` (String?), `bestDay` (DateTime?) to `LawnTask`; add `gddNotificationsEnabled` (Boolean), `gddBestDayReminderDays` (Int) to `User` |
| `lib/gdd-utils.ts` | New — `computeDailyGdd`, `isPreEmergentApplicable`, `isGrubAlertApplicable`, `isOverseedingApplicable` |
| `lib/__tests__/gdd-utils.test.ts` | New — unit tests for all four utility functions |
| `app/api/cron/daily/route.ts` | Add GDD enrichment block after weather fetch loop; pass `bestDay` to `DigestTask` when building digest |
| `lib/email.ts` | Add `bestDay` to `DigestTask` interface; add "Best day" line to upcoming task card template |
| `components/settings/NotificationPreferences.tsx` | Add GDD best-day alert toggle + days-before dropdown |

---

## Error States

- **Yard has no zip code** — skip GDD block entirely (log warning)
- **Weather fetch fails** — skip GDD block for that yard; cumulative GDD is not reset
- **No matching pending tasks for a threshold** — set fired flag, skip task updates (prevents daily re-check)
- **Invalid temp data** — `computeDailyGdd` returns 0; no negative accumulation possible from `max(0, …)`
