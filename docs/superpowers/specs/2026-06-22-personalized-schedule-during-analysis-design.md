# Personalized Schedule during analysis

**Date:** 2026-06-22
**Status:** Approved, ready for implementation plan

## Motivation

The unified schedule system shipped recently (2026-06-21 spec) gives users push reminders + email weather alerts the moment they have a watering or mowing schedule set. But there's no path that walks them from "I just ran an analysis" to "I have a working schedule" without sending them to the yard edit form and asking them to figure out the day picker on their own. New users see AI's text recommendation but no actionable surface; existing users see deviation cards but only after navigating back to the section detail page.

This spec makes the schedule setup a first-class part of the analysis flow. After analysis completes, the results page shows a "Personalized Schedule" picker pre-populated with the AI's suggestion. The user can accept as-is, edit any field, or skip. When they save, both watering and mowing schedules land on either the section or the whole yard (Plus/Pro/Admin choice). Subsequent analyses surface the picker again when AI suggests changes; otherwise show a positive confirmation. The existing weather-aware reminders fire automatically once the schedule exists.

## Scope

In scope:
- New `PersonalizedScheduleCard` rendered as part of `AnalysisResults` on the analyze page.
- Three render modes: picker (when AI deviates or user has no schedule), confirmation (when AI agrees), placeholder (when the schedule Claude call failed).
- Deterministic day distribution function `distributeWateringDays(n)` and `distributeMowingDays(n)`.
- 2-attempt retry loop on the schedule Claude call inside the analyze route.
- New combined `POST /api/sections/[sectionId]/schedule/apply` endpoint that writes both watering and mowing in one transaction.
- "Apply to whole yard" checkbox visible only for Plus/Pro/Admin, unchecked by default.
- Inline save-time warnings via the existing `ScheduleWarnings` component.
- `SectionForm` rename ("Personalized Reminders" → "Personalized Schedule") and removal of the misleading "These are your own notes…" footer.
- Existing `ScheduleRecommendationCard` on the section page gets a state-B enhancement: when effective is empty AND there's a suggestion, show an Apply button (closes the long-standing gap from the prior spec).

Out of scope:
- AI picking specific days or times (we deterministically auto-distribute).
- Standalone "retry just the schedule" endpoint (we retry inside the analyze route instead).
- Modal save confirmation (inline warnings only).
- Per-section weather alert preferences.
- Removing the existing per-kind `/watering/apply` and `/mowing/apply` endpoints — they stay for the section-page card.
- Bulk apply to specific sections beyond the whole-yard checkbox.

## Data flow

### Day distribution helper

`lib/schedules/distribute-days.ts` exports two pure functions:

```ts
export function distributeWateringDays(count: number): string[];
export function distributeMowingDays(count: number): string[];
```

| count | watering | mowing |
|---|---|---|
| 1 | `["Wed"]` | `["Sat"]` |
| 2 | `["Mon","Thu"]` | `["Wed","Sat"]` |
| 3 | `["Mon","Wed","Fri"]` | `["Mon","Wed","Sat"]` |
| 4 | `["Mon","Tue","Thu","Sat"]` | `["Mon","Wed","Fri","Sat"]` |
| 5 | `["Mon","Tue","Wed","Thu","Fri"]` | `["Mon","Tue","Thu","Fri","Sat"]` |
| 6 | `["Mon","Tue","Wed","Thu","Fri","Sat"]` | `["Mon","Tue","Wed","Thu","Fri","Sat"]` |
| 7 | all | all |

Out-of-range or null inputs return `[]`.

### Default times

- Watering: `"07:00"` (morning, before evaporation)
- Mowing: `"10:00"` (mid-morning, dew burned off)

Both editable; both remain optional (saving with no time means no push reminders fire for that schedule until time is set).

### Analyze route retry

Current best-effort wrapper around `generateScheduleRecommendation` is replaced with a 2-attempt loop:

```ts
let schedule: ScheduleRecommendationResult | null = null;
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    schedule = await generateScheduleRecommendation(opts, ctx);
    break;
  } catch (err) {
    if (attempt === 1) {
      logger.warn("analyze: schedule call failed after retry", { userId, sectionId, yardId, grassType, err: err instanceof Error ? err.message : String(err) });
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
```

500ms between attempts is enough to ride out transient 5xx and rate-limit blips without delaying the response noticeably (the analyze route already spends 5–15s on the main analysis Claude call).

## Component: `PersonalizedScheduleCard`

Location: `components/analysis/PersonalizedScheduleCard.tsx`. Client component.

### Props

```tsx
interface Props {
  sectionId: string;
  yardId: string;
  plan: string | null;
  latestAnalysis: {
    wateringSuggestedDaysPerWeek: number | null;
    wateringSuggestedMinutesPerSession: number | null;
    mowingSuggestedDaysPerWeek: number | null;
    mowingSuggestedHeightInches: number | null;
  };
  effective: {
    wateringDays: string[];
    wateringTime: string | null;
    wateringMinutesPerSession: number | null;
    mowingDays: string[];
    mowingTime: string | null;
    mowingHeightInches: number | null;
  };
}
```

### Render modes

The card decides its mode independently for watering and mowing:

- **Picker mode** when EITHER `effective.days.length === 0` OR
  `effective.days.length !== suggestedDaysPerWeek` OR
  `effective.minutesPerSession (or heightInches) !== suggestedMinutesPerSession (or heightInches)`.
- **Confirmation mode** when there's a non-null suggestion AND effective matches it.
- **Placeholder mode** when the suggested fields are null on the analysis (retry already failed).

If watering is in picker mode and mowing is in confirmation mode, the card renders both — picker UI for watering, confirmation banner for mowing — and the Save button writes only what was edited (the mowing values stay at their current effective).

### Picker UI

For each kind in picker mode:

```
Mowing schedule
[Sun] [Mon] [Tue] [Wed] [Thu] [Fri] [Sat]    chips, pre-selected via distributeMowingDays(suggested)
[10:00 AM ▾]  [3 in ▾]                       pre-filled with default time + suggested height
```

Day chips toggle on click (existing `ScheduleEditor` already has this UX). Time dropdown uses `SCHEDULE_TIME_OPTIONS`. Height/minutes dropdown uses `MOWING_HEIGHT_OPTIONS` / `WATERING_MINUTE_OPTIONS`. All reused from existing code.

Below both kinds, when applicable:
```
[ ] Apply to whole yard (all sections)
```
Visible only when `canSetSectionSchedule(plan)` is true (Plus/Pro/Admin). Unchecked by default.

Action row:
```
[Save schedule]  [Skip for now]
```

### Confirmation UI

```
Personalized Schedule
✓ Your watering schedule (3 days/week, 20 min/session at 7:00 AM) still looks right.
✓ Your mowing schedule (1 day/week at 3 in, 10:00 AM) still looks right.
```

When only one kind is in confirmation mode, only that line shows; the other kind shows its picker.

### Placeholder UI

```
Personalized Schedule
We couldn't generate a schedule recommendation for this analysis. Run another to try again.
```

Renders only when BOTH kinds have null suggested values. If just one kind has null suggestions (rare partial failure), the available kind renders its picker/confirmation as normal.

### Inline warnings

The `ScheduleWarnings` components (`WateringWarning`, `MowingWarning`) already exist and trigger when day count or duration/height deviates from the saved suggestion. The picker mounts them below the day chips, exactly as YardEditForm / SectionForm do today.

### Save flow

Clicking **Save schedule** posts to the new endpoint (below). Spinner replaces button label. On success, `router.refresh()`. On failure, inline error banner.

Clicking **Skip for now** does nothing — navigates away by default (just stays on the page). No API call. No dismissed flag is set on the analysis row (the analyze-page card is separate from the section-page card's dismissal lifecycle).

## API endpoint

`POST /api/sections/[sectionId]/schedule/apply`

Body:
```ts
{
  watering: {
    days: string[];
    time: string | null;
    minutesPerSession: number | null;
  };
  mowing: {
    days: string[];
    time: string | null;
    heightInches: number | null;
  };
  applyToYard: boolean;
}
```

Validation:
- Session required; section ownership enforced.
- `days` arrays must contain only the seven valid day strings.
- `time` must match `^\d{2}:\d{2}$` or be null.
- `minutesPerSession` and `heightInches` must be positive or null.

Behavior:
- For Home Basic (where `canSetSectionSchedule(plan)` is false), `applyToYard` is forced to `true` regardless of the request body.
- For Plus/Pro/Admin, honor `applyToYard`.
- One `db.$transaction`:
  - If applyToYard: `tx.yard.update` with the six watering+mowing fields.
  - Else: `tx.yardSection.update` with the six fields.
  - Clear `wateringRecommendationDismissedAt` and `mowingRecommendationDismissedAt` on the latest analysis row.
- Emit `watering.applied` and `mowing.applied` with `target: "yard" | "section"` and plan.
- Return `{ target, watering, mowing }` reflecting the new effective values.

The existing single-kind `/watering/apply` and `/mowing/apply` endpoints stay — the section page's `ScheduleRecommendationCard` uses them. Don't deprecate them; the new endpoint is purely for the analyze-page combined save.

## SectionForm cleanup

In `components/yard/SectionForm.tsx`:
- Rename heading text **"Personalized Reminders"** → **"Personalized Schedule"**.
- Delete the line **"These are your own notes. They won't affect your lawn analysis."** It's misleading now — the day chips and minutes inputs do drive cron behavior.

## Section page `ScheduleRecommendationCard` enhancement

The existing card on `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` adds one new behavior to state B:

When `effective.days.length === 0` AND `wateringSuggestedDaysPerWeek != null` (i.e., the user has no schedule yet and there's a fresh recommendation), the card renders:

```
Watering
Water 3 days/week at 20 min/session...

You haven't set up a watering schedule yet.
[Set up watering]
```

The button posts the same combined-save the analyze-page picker uses (POSTing to `/schedule/apply` with auto-distributed days from `distributeWateringDays(3)` and the default time). Single-click setup from the section page, matching the analyze-page flow.

Same for mowing.

## Failure and edge cases

- **Schedule call still fails after retry**: card renders placeholder mode. User can run another analysis. Failure rate expected sub-0.1% with retry.
- **Save endpoint 5xx**: inline error banner ("Couldn't save schedule. Try again."). User's picks are preserved in component state.
- **User has a Plus subscription that downgrades to Basic between save and next render**: not specific to this work; effective schedule helper already handles this (lossless downgrade, section overrides ignored).
- **Concurrent analysis runs** (race between the picker save and another analysis creating a new row): not a concern. The save writes to Yard / YardSection, not LawnAnalysis. New analysis rows have null dismissed flags by default, so the dismissal-clear writes to the right row (the latest at save time).
- **User edits day chips to zero days then clicks Save**: allowed. They've explicitly chosen no schedule. We pass `days: []` to the endpoint; cron will skip the section silently.
- **Skip behavior**: zero state change. User navigates away normally.

## Testing

Per the project memory rule, integration tests use a real database.

### Unit
- `distributeWateringDays(n)` and `distributeMowingDays(n)` for n = 0..8 and null. Expected results match the table above; out-of-range returns `[]`.

### Component
- `PersonalizedScheduleCard` renders picker mode when AI suggests new values.
- Renders confirmation mode when AI agrees with current schedule.
- Renders placeholder mode when both kinds have null suggestions.
- "Apply to whole yard" checkbox visible only when plan is Plus/Pro/Admin.
- Inline warnings appear when user picks fewer days than suggested.
- "Skip for now" does not call any API.

### Integration
- `POST /schedule/apply` for Basic user writes to yard regardless of `applyToYard: false` request.
- For Plus user with `applyToYard: true`, writes to yard; section override fields untouched.
- For Plus user with `applyToYard: false`, writes to section override fields; yard fields untouched.
- Transaction rolls back on partial failure; no dismissed-flag clear happens if any write failed.

### Analyze route
- Retry loop succeeds on second attempt when the first attempt throws.
- Both attempts failing produces a `warn` log and null schedule fields on the saved analysis row.

### SectionForm
- New heading text renders; old footer text is absent.

## Telemetry

No new event kinds. The existing `watering.applied` and `mowing.applied` emitters cover the combined save. Each fires once per call (so a successful combined save emits both events).

## Non-goals (deferred)

- Push notification *during* analysis (e.g. "Your schedule is ready — tap to confirm"). Out of scope; the picker is in-page UI.
- Standalone schedule retry endpoint. Reserved for if real-world failure rates warrant it.
- AI picking specific days based on local climate. Deterministic distribution is good enough until evidence suggests otherwise.
- Replacing the existing `/watering/apply` and `/mowing/apply` endpoints. Keep both single-kind paths since the section page still calls them.
