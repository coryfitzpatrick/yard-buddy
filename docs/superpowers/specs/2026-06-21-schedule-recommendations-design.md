# Watering and mowing schedule recommendations

**Date:** 2026-06-21
**Status:** Approved, ready for implementation plan

## Motivation

Today the section detail page shows AI-driven diagnosis and task recommendations, but nothing surfaces when the user's watering or mowing schedule is itself the underlying problem. We want the analysis to detect cases where the user's existing schedule doesn't suit a given section, present the suggestion clearly, and let the user accept the change or dismiss with an honest "we can't guarantee best results" notice. Both watering and mowing follow the same flow because both are easy adjustments a homeowner can act on.

The recommendation is tied to the analysis flow rather than being a standalone refreshable endpoint, so usage is naturally gated by the user's plan's analysis quota and Claude credits are bounded.

## Scope

In scope:
- Watering schedule recommendation (days per week, minutes per session)
- Mowing schedule recommendation (days per week, height in inches)
- Both detected automatically on every analysis run
- Apply / Ignore / Dismiss UX on the section detail page
- Per-section structured overrides for Home Plus and Professional plans
- Yard-wide structured fields for all plans
- Plan-gated edit forms (Home Basic sees yard-level only; Plus/Pro can override per-section)

Out of scope (deferred):
- Updating the daily reminder cron (`app/api/cron/daily-tasks/route.ts`) to read the new structured per-section overrides. The structured fields drive only the recommendation cards and Apply flow in v1; reminder emails keep reading the existing free-text `mowingSchedule` / `wateringSchedule` columns until a follow-up plan.
- A bulk "Apply to all deviating sections" action.
- A standalone `/recommend` endpoint that runs Claude outside the analysis flow.
- Mowing or watering applied to sections that have never been analyzed (no analysis row = no recommendation surface).

## Data model

Single Prisma migration adds the columns below and includes `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for any new tables (none here — only column adds on existing tables, which already have RLS enabled).

### `LawnAnalysis` — 10 new nullable columns

The recommendation lives on the analysis row that produced it, so a dismissed recommendation from a stale analysis doesn't suppress fresh guidance from a newer analysis.

| Column | Type | Purpose |
|---|---|---|
| `wateringSchedule` | `String?` | AI free-text explanation, shown verbatim in the card |
| `wateringDeviates` | `Boolean?` | AI's flag — true when the suggestion meaningfully differs from the effective schedule at analysis time |
| `wateringSuggestedDaysPerWeek` | `Int?` | structured suggestion used by Apply |
| `wateringSuggestedMinutesPerSession` | `Int?` | structured suggestion used by Apply |
| `wateringRecommendationDismissedAt` | `DateTime?` | set by `/dismiss`, cleared by `/apply` |
| `mowingSchedule` | `String?` | AI free-text explanation |
| `mowingDeviates` | `Boolean?` | true when the suggestion meaningfully differs |
| `mowingSuggestedDaysPerWeek` | `Int?` | structured suggestion used by Apply |
| `mowingSuggestedHeightInches` | `Float?` | structured suggestion used by Apply |
| `mowingRecommendationDismissedAt` | `DateTime?` | set by `/dismiss`, cleared by `/apply` |

### `Yard` — 2 new nullable columns

| Column | Type | Purpose |
|---|---|---|
| `mowingDaysPerWeek` | `Int?` | yard-wide mowing frequency |
| `mowingHeightInches` | `Float?` | yard-wide mowing height |

(`Yard.wateringDaysPerWeek` and `Yard.wateringMinutesPerSession` already exist. `Yard.mowingSchedule` free-text field stays as user notes.)

### `YardSection` — 4 new nullable columns

| Column | Type | Purpose |
|---|---|---|
| `wateringDaysPerWeek` | `Int?` | per-section watering override (Plus/Pro), null inherits yard |
| `wateringMinutesPerSession` | `Int?` | per-section watering override (Plus/Pro), null inherits yard |
| `mowingDaysPerWeek` | `Int?` | per-section mowing override (Plus/Pro), null inherits yard |
| `mowingHeightInches` | `Float?` | per-section mowing override (Plus/Pro), null inherits yard |

The existing `YardSection.wateringSchedule` and `YardSection.mowingSchedule` free-text columns stay as user-editable notes.

## Plan gating

Helper `lib/plan/can-set-section-schedule.ts`:

```ts
export function canSetSectionSchedule(plan: string | null): boolean {
  return plan === "home_plus" || plan === "professional";
}
```

Trial users inherit their target plan's behavior (so a Plus trial sees Plus-tier UI). Used by API routes and the section edit form.

## Effective schedule helper

`lib/schedules/effective-schedule.ts` — pure function used in the prompt builder, the recommendation card, the Apply route, and the deviation recomputation logic.

```ts
export function effectiveWatering(section, yard, plan) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    daysPerWeek: (canOverride ? section.wateringDaysPerWeek : null) ?? yard.wateringDaysPerWeek ?? null,
    minutesPerSession: (canOverride ? section.wateringMinutesPerSession : null) ?? yard.wateringMinutesPerSession ?? null,
  };
}

export function effectiveMowing(section, yard, plan) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    daysPerWeek: (canOverride ? section.mowingDaysPerWeek : null) ?? yard.mowingDaysPerWeek ?? null,
    heightInches: (canOverride ? section.mowingHeightInches : null) ?? yard.mowingHeightInches ?? null,
  };
}
```

A downgraded Plus → Basic user keeps their per-section overrides in the database, but the helper ignores them until they upgrade back. Lossless downgrade.

## Prompt update

Replace the existing `buildWateringPrompt` in `lib/ai/watering-prompt.ts` with a combined `buildSchedulePrompt` in `lib/ai/schedule-prompt.ts`. One Claude call returns both watering and mowing recommendations, because both share the same context (grass type, soil, area type, current weather).

Input shape extends the current `WateringPromptOpts`:

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
```

Output shape:

```json
{
  "watering": {
    "schedule": "Reduce to 15 min per session — this shaded section is overwatered at 20 min.",
    "deviates": true,
    "suggestedDaysPerWeek": 3,
    "suggestedMinutesPerSession": 15
  },
  "mowing": {
    "schedule": "Raise the deck to 3 inches; cool-season fescue scalps below 2.5\".",
    "deviates": true,
    "suggestedDaysPerWeek": 1,
    "suggestedHeightInches": 3.0
  }
}
```

`deviates: true` requires the suggested numbers to meaningfully differ from the inputs. When no inputs are provided (user hasn't set a schedule), Claude returns `deviates: false` and the suggested numbers become the recommended starting point.

`lib/claude.ts` gets a new `callSchedulePrompt` function that wraps the Claude call, validates the response with a Zod schema, and returns the typed shape. The existing `callWateringPrompt` is removed (single caller, easy to find and update).

## Analysis route integration

`app/api/analyze/route.ts` is the only place that calls the new prompt. After the existing analysis Claude call succeeds:

1. Read the section, yard, and user plan from the existing context.
2. Compute the effective watering and mowing schedules via the helper.
3. Call `callSchedulePrompt` with section properties, effective schedules, and the same weather summary the analysis used.
4. In the same transaction that creates the `LawnAnalysis` row, populate the 10 new watering/mowing fields with Claude's response. `wateringRecommendationDismissedAt` and `mowingRecommendationDismissedAt` are left null (fresh recommendation).

Failure handling: if the schedule Claude call fails or returns a malformed response, the analysis still succeeds with the watering/mowing fields left null. The card UI falls back to a passive "no schedule recommendation available for this analysis" state — explained below.

The schedule call adds ~30% to per-analysis Claude token cost. Telemetry's existing `ai.call` event fires for the schedule call as it does for the analysis call, so `ai.daily_summary` accounting needs no changes.

## API endpoints (apply and dismiss)

Four routes, all session-gated to the section's owner. None call Claude.

**`POST /api/sections/[sectionId]/watering/apply`**

1. Loads the latest analysis for this section (order by `createdAt desc`, limit 1).
2. Reads `wateringSuggestedDaysPerWeek` and `wateringSuggestedMinutesPerSession`. 400 if either is null.
3. Branches on `canSetSectionSchedule(user.plan)`:
   - True → writes the two values to `YardSection.wateringDaysPerWeek` / `wateringMinutesPerSession`.
   - False → writes to `Yard.wateringDaysPerWeek` / `wateringMinutesPerSession`.
4. Sets `LawnAnalysis.wateringRecommendationDismissedAt = null` on the latest analysis (cleared by Apply).
5. Returns the new effective schedule plus the target that was written (`"yard"` or `"section"`).

**`POST /api/sections/[sectionId]/watering/dismiss`**

1. Loads the latest analysis. 404 if none.
2. 409 if `wateringDeviates !== true` (nothing to dismiss).
3. Sets `LawnAnalysis.wateringRecommendationDismissedAt = now()`.

**`POST /api/sections/[sectionId]/mowing/apply`** and **`POST /api/sections/[sectionId]/mowing/dismiss`** — symmetric, operating on the mowing columns.

A small shared helper in `lib/schedules/apply-handler.ts` reduces duplication between the watering and mowing routes.

## UI: section detail page

The section detail page (`app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`) renders two new cards beneath the existing health/analysis card: **Watering** and **Mowing**. Each card is implemented as a single component `components/sections/ScheduleRecommendationCard.tsx` parameterized on type (`"watering" | "mowing"`).

Each card reads the latest analysis for the section and derives one of four states.

### State A — No analyses yet for this section

A passive prompt: "Run an analysis to see your watering recommendation." Link to `/analyze` preselecting this section. Same shape for mowing.

### State B — Recommendation exists, `deviates: false`

Neutral card. Shows the AI's free-text `wateringSchedule` (or `mowingSchedule`) as explanation. If the effective yard/section schedule is empty (first-time recommendation from scratch), the card shows an "Apply this schedule" button — accepting the AI's starting point. Otherwise the card is read-only confirmation.

### State C — Recommendation exists, `deviates: true`, not dismissed

Amber card. Layout:
- Heading: "This section may need a different watering schedule" (or mowing).
- AI free-text explanation.
- Side-by-side comparison: `Current: 3 days/week, 20 min` vs `Suggested: 3 days/week, 15 min`.
- Three action buttons: **Apply suggestion**, **Ignore**, and a tooltip-only "Run a new analysis to refresh".

Apply opens a confirmation dialog:
- Home Basic: "Update your yard-wide watering schedule to 3 days/week, 15 min? This affects every section in this yard."
- Home Plus/Pro: "Set this section's watering schedule to 3 days/week, 15 min, overriding the yard default?"

Confirm → calls `/apply` → toast confirmation → card recomputes to state B.

Ignore is a single click (no confirmation) → calls `/dismiss` → card recomputes to state D.

### State D — Recommendation exists, `deviates: true`, dismissed

Collapsed amber banner: "Schedule override — not following our guidance. Run a new analysis to refresh." No Apply button (user already chose to ignore); the user can still Apply by opening the same card and clicking Apply on the saved suggestion. To reduce nag, only the banner and a small "Show suggestion" toggle are visible; clicking the toggle re-expands the full state-C content (without recomputing). The dismissal stays set until a new analysis arrives.

### Server-side deviation recomputation

When the section page loads, the server computes `stillDeviates = saved.wateringSuggestedDaysPerWeek !== effective.daysPerWeek || saved.wateringSuggestedMinutesPerSession !== effective.minutesPerSession` for each schedule type. If `stillDeviates === false` (user manually edited the schedule into agreement), the card renders state B regardless of the dismissed timestamp — no DB write, no Claude call. Saves cost and matches the user's intuition that fixing the schedule resolves the badge.

## UI: yard and section edit forms

### Yard edit form (`components/yard/YardEditForm.tsx`)

Currently shows `wateringDaysPerWeek` and `wateringMinutesPerSession`. Add two symmetric mowing inputs:

- "Mowing days per week" — number input 1–7, optional
- "Mowing height (inches)" — number input, step 0.5, optional

Placement: next to the existing watering inputs.

### Section edit form (`components/yard/SectionForm.tsx`)

For Plus/Pro users, add four new optional inputs (override yard defaults):

- "Watering days per week (override yard default)" — number input 1–7, optional, placeholder shows the yard default
- "Watering minutes per session (override yard default)" — number input, optional, placeholder shows the yard default
- "Mowing days per week (override yard default)" — number input 1–7, optional, placeholder shows the yard default
- "Mowing height in inches (override yard default)" — number input, step 0.5, optional, placeholder shows the yard default

Empty values mean "inherit yard default". Partial overrides are allowed (e.g., set mowing height but not frequency).

For Home Basic users, these four inputs are hidden entirely. A single read-only line is shown instead: "Watering and mowing schedules are set at the yard level on your current plan." with a link to the yard edit form.

## Dismissal lifecycle

`*RecommendationDismissedAt` is set by `/dismiss`. It is cleared by:

1. `/apply` — the user accepted the suggestion.
2. The next analysis — when a new `LawnAnalysis` row is created, the dismissed timestamp defaults to `null` because it's a fresh row, not because we cleared the old one.

`stillDeviates === false` (computed on page load against saved suggestion vs current effective schedule) suppresses the badge regardless of the dismissed timestamp. We do not write to the timestamp in this case — the render condition is purely derived.

## Edge cases

- **No structured schedule set at analysis time.** Claude is asked to recommend one from scratch. Response has `deviates: false` and `suggested*` values populated. Card renders state B with an "Apply this schedule" button so the user can adopt the recommendation as their starting point.
- **AI returns `deviates: true` but `suggested*` values equal the effective schedule.** Treated as `deviates: false`. The Apply button is disabled when suggested === effective.
- **Section has never been analyzed.** Card renders state A. Apply and Ignore endpoints both 404.
- **User downgrades from Plus to Basic with section overrides set.** Overrides are kept in DB but ignored by `effectiveWatering`/`effectiveMowing`. Yard default applies. Section edit form hides the override inputs.
- **Section is deleted.** Cascade delete removes its analyses; nothing dangles.
- **Yard is deleted.** Cascade through sections through analyses. Same.
- **Claude schedule call fails inside analyze route.** The analysis still succeeds and saves with schedule fields null. Cards render state A on that analysis ("No schedule recommendation available — try another analysis").
- **User runs many analyses in rapid succession.** Each creates a new `LawnAnalysis` row. The cards always read the latest. Dismissals on older analyses are ignored once a new analysis arrives.

## Telemetry

Six new events emitted via `lib/observability/events.ts`:

- `watering.recommended { sectionId, deviates, plan }` — fired inside analyze route when watering recommendation is saved
- `watering.applied { sectionId, plan, target: "yard" | "section" }` — fired by `/watering/apply`
- `watering.dismissed { sectionId }` — fired by `/watering/dismiss`
- `mowing.recommended { sectionId, deviates, plan }`
- `mowing.applied { sectionId, plan, target: "yard" | "section" }`
- `mowing.dismissed { sectionId }`

Existing `ai.call` continues to fire for the schedule Claude call without modification.

## Testing

Per the testing memory, integration tests hit a real database, not mocks.

- **Unit:** `effectiveWatering` / `effectiveMowing` helper across all plan-and-override combinations.
- **Unit:** `buildSchedulePrompt` includes/excludes context lines correctly. `callSchedulePrompt` validates response shape.
- **Integration:** Analyze route end-to-end produces an analysis row with watering and mowing fields populated when Claude returns valid responses; null when Claude fails.
- **Integration:** `/watering/apply` writes to yard for Basic, section for Plus, clears dismissed timestamp. Same for mowing.
- **Integration:** `/watering/dismiss` and `/mowing/dismiss` set the timestamp, reject when `deviates !== true`.
- **Component:** ScheduleRecommendationCard renders each of the four states correctly given fixture analyses. Plan-gated Apply confirmation messaging matches plan tier.

## Non-goals

- This does not change how analysis results, tasks, or reminders are displayed — only the schedule cards.
- This does not introduce a refresh-without-analysis flow. Refresh = run a new analysis.
- This does not auto-apply recommendations on the user's behalf, regardless of how strongly Claude phrases the suggestion. All schedule changes are user-initiated through Apply.
