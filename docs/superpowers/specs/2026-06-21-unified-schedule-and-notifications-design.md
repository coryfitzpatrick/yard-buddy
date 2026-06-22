# Unified schedule system + push notifications + weather alerts

**Date:** 2026-06-21
**Status:** Approved, ready for implementation plan

## Motivation

After shipping the schedule recommendations feature (2026-06-21 spec), the codebase has two parallel schedule data systems:

1. **JSON `wateringSchedule` / `mowingSchedule`** — the user's actual settings (days, time, duration), parsed by the daily cron to send email reminders.
2. **Structured `wateringDaysPerWeek` / `wateringMinutesPerSession` / `mowingDaysPerWeek` / `mowingHeightInches`** — added in the recommendation feature, written by the Apply button, but disconnected from the email reminder flow.

The two systems carry overlapping data (days/week count, duration) but neither is a strict superset. Apply doesn't reflect into the JSON; the cron doesn't see structured. This spec collapses them into a single structured schema and replaces the legacy JSON with `wateringDays[]` + `wateringTime` + `wateringMinutesPerSession` (and mowing equivalents). The recommendations remain count-only (AI doesn't pick specific days); the user picks days and time; warnings appear when their choices deviate from the recommendation.

At the same time, we add push notifications for watering/mowing reminders and weather alerts (rain expected on a scheduled day), each independently toggleable per channel and per type, with master email and push switches that silence everything in one click.

## Scope

In scope:

- Single structured schedule model on `Yard` and `YardSection` (`wateringDays`, `wateringTime`, `wateringMinutesPerSession`, `mowingDays`, `mowingTime`, `mowingHeightInches`)
- Migration of existing JSON data into the new structured columns
- Drop of all legacy schedule columns (JSON `wateringSchedule`/`mowingSchedule`, `*DaysPerWeek` user-set fields)
- Daily cron rewrite to read structured fields directly
- Push trigger predicates for watering reminders, mowing reminders, watering weather warnings, mowing weather warnings
- Email digest sections for weather alerts on upcoming scheduled days
- Inline AI-deviation warnings in YardEditForm and SectionForm (advisory only, no Apply per field)
- Apply button on ScheduleRecommendationCard updates only `wateringMinutesPerSession` (or `mowingHeightInches`); never touches days or time
- Settings UI rewrite with 4 content categories (Task / Schedule / Weather / Best day), per-channel toggles, and 2 master toggles
- Six new `User` schema columns for granular notification preferences

Out of scope:

- Auto-cancellation of pushes based on weather (the alert is informational; the user decides)
- Per-section weather alerts (alerts fire at the yard level; if any of a yard's sections has a scheduled day with bad weather, one alert per yard)
- Localized push delivery times (uses the user's stored `wateringTime`/`mowingTime` as-is in UTC for v1; timezone handling stays as it is today)
- AI suggesting specific days or specific times (user picks; AI only suggests count + duration/height)

## Data model

### Schema additions on `Yard` and `YardSection`

| Column | Type | Purpose |
|---|---|---|
| `wateringDays` | `String[]` | e.g. `["Mon","Wed","Fri"]`. Empty array means "no watering schedule". |
| `wateringTime` | `String?` | e.g. `"07:00"`. ISO 24-hour HH:MM, UTC-equivalent. |
| `mowingDays` | `String[]` | e.g. `["Sat"]` |
| `mowingTime` | `String?` |  |

`wateringMinutesPerSession` and `mowingHeightInches` already exist on both tables and are kept.

### Schema drops on `Yard` and `YardSection`

| Column | Reason |
|---|---|
| `wateringDaysPerWeek` | Derived from `wateringDays.length` |
| `mowingDaysPerWeek` | Derived from `mowingDays.length` |
| `wateringSchedule` (JSON `String?`) | Replaced by structured `wateringDays` + `wateringTime` + `wateringMinutesPerSession` |
| `mowingSchedule` (JSON `String?`) | Replaced |

### Schema unchanged on `LawnAnalysis`

The AI continues to suggest a count (`*SuggestedDaysPerWeek`) and a duration (`wateringSuggestedMinutesPerSession`) or height (`mowingSuggestedHeightInches`). No specific-days or time suggestions. The existing fields stay; nothing on `LawnAnalysis` changes.

### Schema additions on `User`

| Column | Default | Purpose |
|---|---|---|
| `emailNotificationsEnabled` | `true` | Master email switch — when off, no email goes out regardless of per-type toggle |
| `pushNotificationsEnabled` | `true` | Master push switch |
| `taskPushEnabled` | `false` | Push for upcoming/overdue tasks |
| `schedulePushEnabled` | `true` | Push for watering/mowing day reminders |
| `weatherEmailEnabled` | `true` | Weather alert section in the daily email digest |
| `weatherPushEnabled` | `true` | Push when rain forecast on a scheduled day |

`notificationsEnabled` (email task digest), `reminderNotificationsEnabled` (email schedule reminders), and `gddNotificationsEnabled` (push best-day) stay. Their semantics narrow as the new toggles share scope:
- `notificationsEnabled` keeps controlling **email digest** of task content.
- `reminderNotificationsEnabled` keeps controlling **email digest** of schedule reminders.
- `gddNotificationsEnabled` keeps controlling **push** for GDD best-day alerts.

### Migration steps (single Prisma migration)

1. Add the four new schedule columns on `Yard` and `YardSection`.
2. Add the six new notification columns on `User`.
3. Data migrate: for each `Yard` and `YardSection` row with a non-null `wateringSchedule` JSON, parse it; if it parses to `{ days, time, inches }`, populate `wateringDays = days`, `wateringTime = time`, `wateringMinutesPerSession = parseInt(inches)`. If `wateringMinutesPerSession` is already set, keep the existing value. Same for mowing.
4. Drop `wateringSchedule`, `mowingSchedule`, `wateringDaysPerWeek`, `mowingDaysPerWeek` on both tables.

The migration uses `BEGIN; ... COMMIT;` so partial failure rolls back. Per the project memory rule, no new tables, so no RLS additions; column-level inheritance covers the new fields.

## Effective schedule and override semantics

The `effectiveWatering` and `effectiveMowing` helpers from the prior spec stay in `lib/schedules/effective-schedule.ts` but their return shape changes to include the new fields:

```ts
export function effectiveWatering(section, yard, plan) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    days: (canOverride && section.wateringDays.length > 0) ? section.wateringDays : yard.wateringDays,
    time: (canOverride ? section.wateringTime : null) ?? yard.wateringTime ?? null,
    minutesPerSession: (canOverride ? section.wateringMinutesPerSession : null) ?? yard.wateringMinutesPerSession ?? null,
  };
}
```

`wateringDays` falls back to the yard's array when the section's is empty (because `String[]` defaults to `[]`, not `null` — empty means "no override"). The same shape applies to mowing.

## AI prompt — unchanged

`buildSchedulePrompt` and `generateScheduleRecommendation` continue to ask for `suggestedDaysPerWeek` + `suggestedMinutesPerSession` (watering) and `suggestedDaysPerWeek` + `suggestedHeightInches` (mowing). No specific-days, no specific-time suggestions. The prompt does receive the new structured `wateringDays`/`mowingDays` from the effective schedule (using `.length` as the day count it knows about) so it can assess whether the user's day count deviates from what it would recommend.

## Apply button — narrower

`POST /api/sections/[sectionId]/watering/apply` writes only `wateringMinutesPerSession` to either Yard or YardSection (per plan). It no longer writes any "days per week" field, because that field no longer exists as a user setting. Days remain user-only.

`POST /api/sections/[sectionId]/mowing/apply` writes only `mowingHeightInches`.

The `/dismiss` routes behave exactly as today.

## ScheduleRecommendationCard — refreshed

The card on the section detail page now reads from the new structured fields via the updated effective-schedule helper. State C ("deviating, not dismissed") displays a more honest comparison:

```
Watering recommendation
Reduce to 15 min per session; this shaded section is overwatered at 20 min.

Current: 3 days/week (Mon, Wed, Fri), 20 min/session, 07:00
Suggested: 3 days/week, 15 min/session

[Apply suggested minutes]  [Ignore]
```

The "Suggested" column only lists what AI recommends (count + duration), not your specific days or time. Apply updates only the duration. If the day counts also mismatch (e.g. Current 4 days/week, Suggested 3), the warning text spells it out but the Apply button still only changes the minutes — the user adjusts their days in the edit form.

State D (dismissed) keeps the prior collapsed-banner UX.

## Inline warnings on the edit forms

YardEditForm and SectionForm both show advisory warnings beneath the relevant inputs when the user's pick deviates from the latest analysis's recommendation. Warnings are display-only — no per-field Apply buttons (Apply lives on the recommendation card).

Watering warnings appear when any of these hold:
- `wateringDays.length !== latestAnalysis.wateringSuggestedDaysPerWeek`
- `wateringMinutesPerSession !== latestAnalysis.wateringSuggestedMinutesPerSession`

Mowing warnings appear when:
- `mowingDays.length !== latestAnalysis.mowingSuggestedDaysPerWeek`
- `mowingHeightInches !== latestAnalysis.mowingSuggestedHeightInches`

Warning copy: `"We recommend 3 days/week. You've selected 2."` Minimal, no judgmental language. Per the project's no-em-dash rule, copy uses commas or rephrasing.

No warnings appear when the section has never been analyzed (no recommendation available).

## ScheduleEditor — rewritten

The current `ScheduleEditor` component writes a JSON string to `wateringSchedule`/`mowingSchedule`. It is rewritten to bind directly to `wateringDays`, `wateringTime`, `wateringMinutesPerSession` (and the mowing equivalents) on the parent form. The JSON serialization layer is removed entirely.

UI sketch:

```
Watering days:  [Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun]   (chip toggles)
Time of day:    [07:00 ▾]
Minutes per session: [20]
```

The component is used in YardEditForm and SectionForm (the per-section override form).

## Daily cron rewrite

`app/api/cron/daily-tasks/route.ts` and its companion `lib/cron/reminder-scheduler.ts` are rewritten to use the structured schedule fields. The JSON-parsing path in `getTodayReminders` is deleted.

### Reminder push trigger predicates (new, in `lib/push/triggers.ts`)

```ts
function isScheduledToday(days: string[], today: Date): boolean {
  const todayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][today.getUTCDay()];
  return days.includes(todayName);
}

export function shouldPushWateringReminder(
  { effective, todayIsScheduled }: { effective: { days: string[]; time: string | null }; todayIsScheduled: boolean },
): boolean {
  return todayIsScheduled && effective.days.length > 0 && !!effective.time;
}

export function shouldPushMowingReminder(...): boolean { /* symmetric */ }
```

Both predicates are pure and unit-tested.

### Weather-alert push trigger predicates (new)

Watering: bad weather is forecast rain ≥ 50% chance OR rainfall ≥ 0.25" today.
Mowing: bad weather is forecast rain ≥ 50% chance OR rainfall ≥ 0.10" today (tighter because wet grass mows poorly).

```ts
export function shouldPushWateringWeatherWarning(
  { todayIsScheduled, todayForecast }: { todayIsScheduled: boolean; todayForecast: { chanceOfRain: number; rainfallInches: number } | null },
): boolean {
  if (!todayIsScheduled || !todayForecast) return false;
  return todayForecast.chanceOfRain >= 0.5 || todayForecast.rainfallInches >= 0.25;
}

export function shouldPushMowingWeatherWarning(...): boolean { /* threshold 0.10 */ }
```

### Cron loop — high-level shape

For each user:
1. Compute effective watering and mowing for every section across all of the user's yards.
2. For each (user, section), apply the four pure predicates above given today's date and today's forecast.
3. Aggregate per user (one watering reminder push max per user per day even if multiple sections water today; copy lists the sections).
4. Send each push only when `pushNotificationsEnabled && <per-type push toggle>` is true AND the user has registered device tokens.
5. Build the daily email digest with each section's content gated by `emailNotificationsEnabled && <per-type email toggle>`. The new "Weather alerts" digest section lists scheduled days in the next 5 days where the forecast triggers a warning.

### Removed cron logic

The `reminderUsers` query that filters by `mowingSchedule: { not: null }` / `wateringSchedule: { not: null }` is replaced with a structured-field filter (`OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }]` on Yard, plus the section-level OR). The JSON-parsing branch in `getTodayReminders` is removed.

## Email digest — weather alerts section

`buildDigestEmail` gains a new optional `weatherAlerts` array param:

```ts
type WeatherAlert = {
  yardName: string;
  date: string;       // "Wednesday, June 24"
  kind: "watering" | "mowing";
  reason: string;     // "Rain expected (70%)"
};
```

The section renders only when `weatherAlerts.length > 0` AND the user's `weatherEmailEnabled` is on. The cron computes this list by scanning the next 5 days of forecast per ZIP against each section's structured `wateringDays`/`mowingDays`.

## Settings UI rewrite

`components/settings/NotificationPreferences.tsx` is rewritten with four sections in this order:

1. **Master switches** — `emailNotificationsEnabled` and `pushNotificationsEnabled` toggles at the top, with a "Pause all email/push notifications" hint.
2. **Task reminders** — checkbox row for Email and Push. Email toggle binds to `notificationsEnabled`; Push toggle to `taskPushEnabled`. The `notifyDaysAhead` dropdown appears when Email is on.
3. **Schedule reminders** — Email row binds to `reminderNotificationsEnabled`; Push row to `schedulePushEnabled`. `reminderDaysBefore` dropdown when Email is on. Push fires at the user's stored `wateringTime`/`mowingTime`.
4. **Weather alerts** — Email row binds to `weatherEmailEnabled`; Push row to `weatherPushEnabled`. No timing dropdown; alerts trigger when forecast crosses thresholds.
5. **Best day alerts (GDD)** — Push row binds to `gddNotificationsEnabled`. No email path (today GDD is push-only).

Save action `PUT /api/user/notifications` is updated to accept the six new keys.

## Cleanup pass — what is removed

Code paths and DB columns being deleted because they are now unused or replaced:

| Path | Reason for removal |
|---|---|
| `Yard.wateringSchedule` (column) | Replaced by structured `wateringDays`/`wateringTime` |
| `Yard.mowingSchedule` (column) | Replaced |
| `YardSection.wateringSchedule` (column) | Replaced |
| `YardSection.mowingSchedule` (column) | Replaced |
| `Yard.wateringDaysPerWeek` (column) | Derived from `wateringDays.length` |
| `Yard.mowingDaysPerWeek` | Derived |
| `YardSection.wateringDaysPerWeek` | Derived |
| `YardSection.mowingDaysPerWeek` | Derived |
| `getTodayReminders` JSON-parse branch in `lib/cron/reminder-scheduler.ts` | Replaced with structured-field reading |
| `ScheduleEditor` JSON serialization | Replaced with direct structured-field binding |
| SectionForm's free-text `wateringSchedule`/`mowingSchedule` `<textarea>` inputs (if still present after recent task work) | Replaced by ScheduleEditor's structured inputs |
| Email-channel logic in cron tied to `reminderNotificationsEnabled` only | Replaced by per-channel logic (`emailNotificationsEnabled` master + per-type toggles) |

Code paths and columns that are kept (not removed) despite recent feature changes:

- `LawnAnalysis.wateringSuggested*` / `mowingSuggested*` — unchanged, used by both Apply and warnings.
- `lib/ai/schedule-prompt.ts` and `generateScheduleRecommendation` — unchanged.
- `lib/plan/can-set-section-schedule.ts` — unchanged.
- The four `/apply` / `/dismiss` routes — apply routes narrow their write to minutes/height only; dismiss is unchanged.

## Telemetry

The existing `watering.*` / `mowing.*` events stay. Four new events are added:

- `watering.reminder.pushed { sectionId, userId }` — emitted when a watering reminder push fires.
- `mowing.reminder.pushed { sectionId, userId }`
- `watering.weather.alerted { sectionId, userId, reason }` — emitted when a watering weather push fires.
- `mowing.weather.alerted { sectionId, userId, reason }`

The existing `ai.call` continues to fire for the schedule Claude call within the analyze route.

## Failure handling

- Push send failure (FCM/APNs returns 5xx, token revoked, etc.) logs at `warn` level and continues. No user-visible failure surface.
- Weather fetch failure during the cron run (per the existing `weatherByZip` try/catch) silently skips the weather-alert path for that ZIP. Reminders still fire (they don't depend on weather).
- Migration data-migration step that fails to parse a malformed JSON row leaves the new structured columns null on that row and logs the offending yardId/sectionId. The legacy columns are still dropped — the row simply loses its old schedule (and the user sets it again from the edit form). This is acceptable because malformed JSON is presumed rare; the alternative (keeping a sidecar column "for safety") complicates the schema.

## Testing

Per the project memory rule, integration tests hit a real database, not mocks.

- **Unit:** `effectiveWatering`/`effectiveMowing` updated for the new return shape.
- **Unit:** the four push trigger predicates across positive/negative/edge cases (no schedule, missing time, forecast unavailable).
- **Unit:** the new ScheduleEditor binding directly to structured fields.
- **Unit:** AI deviation comparison helpers (count, duration, height).
- **Integration:** cron end-to-end with three users (one with both reminders on, one with only push, one with everything off) — verifies the per-channel matrix.
- **Integration:** data migration on a fixture row with a valid JSON schedule, verifying the parse populates `wateringDays`/`wateringTime`/`wateringMinutesPerSession` correctly.
- **Component:** NotificationPreferences renders all 8 toggles, save action sends all 9 keys (6 new + 3 existing).
- **Component:** YardEditForm and SectionForm show the inline warnings when the user's pick deviates from the latest analysis recommendation.

## Non-goals

- Per-day timezone handling. Users in the same yard share a single `wateringTime` and we send push using that string-encoded time without timezone math. Improvement deferred.
- Weather thresholds being user-tunable. Thresholds are hard-coded in v1; could become per-user settings later.
- Auto-applying weather-based schedule adjustments. The alert is informational only; the user decides.
- Per-yard or per-section weather-alert preferences. One yard-level alert toggle covers both watering and mowing across all sections.
