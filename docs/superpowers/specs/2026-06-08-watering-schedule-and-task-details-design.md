# Watering Schedule & Completed Task Details — Design Spec

**Date:** 2026-06-08

## Overview

Two features:

1. **Watering Schedule** — capture a yard-wide watering schedule (days/week + minutes/session) and generate per-section AI recommendations that verify whether the schedule suits each section or suggest adjustments.
2. **Completed Task Details** — expand completed task cards to show full details (description, product, application rate, etc.) rather than only a strikethrough title.

---

## Feature 1: Watering Schedule

### Goal

Users set their existing watering schedule once at the yard level. The AI then generates a per-section recommendation: either confirming the schedule is appropriate or suggesting specific adjustments based on grass type, soil, area, and shade. A yard-level summary makes it instantly clear whether the schedule works everywhere or needs attention in specific sections.

### Data Model

**`Yard` model** — two new optional fields:

```prisma
wateringDaysPerWeek    Int?
wateringMinutesPerSession Int?
```

**`YardSection` model** — two new optional fields:

```prisma
wateringSchedule  String?   // AI recommendation text
wateringDeviates  Boolean?  // true when AI recommends change from yard default
```

`wateringSchedule` stores free-text like: *"Your 3x/week, 20 min schedule works well here"* or *"This shaded north-facing section only needs 15 min per session — reduce from your current 20 min to avoid overwatering."*

`wateringDeviates` is stored separately so the yard overview can compute a summary without parsing the recommendation text.

### Watering Input — Yard Forms

Two fields added to both the yard setup form and the yard edit form:

- **"Watering days per week"** — number input, 1–7, optional
- **"Minutes per session"** — number input, optional

**Placement:** Yard setup Step 3 (Soil & Equipment), after existing soil fields. Yard edit form after spreaderModel.

Both fields are optional — users who skip them still get AI-generated recommendations (Claude generates a schedule from scratch rather than validating an existing one).

### AI Recommendation Endpoint

**Route:** `POST /api/sections/[sectionId]/watering`

**Auth:** Session required; section must belong to authenticated user's yard.

**Inputs (from DB):**
- Section: `grassType`, `areaType`, `yardSizeSqft`, `soilPh`, `soilMoisture`, `notes`
- Yard: `wateringDaysPerWeek`, `wateringMinutesPerSession`, `zipCode`
- Current weather (via existing `getWeatherByZip`, optional — timeout-gated like analyze route)

**Claude prompt logic:**
- If yard has a schedule: ask Claude to assess whether the schedule suits this specific section, given its properties. Return whether it deviates and the recommendation text.
- If no yard schedule: ask Claude to recommend a schedule from scratch for the section.

**Response:** `{ schedule: string, deviates: boolean }`

**Side effect:** Updates `YardSection.wateringSchedule` and `YardSection.wateringDeviates` in the DB.

**No auto-trigger** — recommendation is generated on demand (button press), not on page load. This keeps API costs predictable.

### Section Detail Page — Watering Card

A **"Watering"** card appears on the section detail page between the health/analysis card and the tasks section.

**States:**

| State | Display |
|---|---|
| No recommendation yet (any yard schedule state) | "Get watering recommendation" button. If no yard schedule is set, a secondary note below: *"Add a watering schedule to your yard for a personalised assessment"* + link to yard edit — but the button still works (Claude generates from scratch). |
| Recommendation exists, `wateringDeviates: false` | Neutral/green card with recommendation text + small "Refresh" button |
| Recommendation exists, `wateringDeviates: true` | Amber card with recommendation text + small "Refresh" button |

When no yard schedule is set and Claude generates a recommendation from scratch, `wateringDeviates` is always `false` (there is no default to deviate from).

The card is always shown (not hidden when empty) so the entry point is discoverable.

### Yard Overview — Watering Summary

On `/yard/[id]`, above the section cards, a single summary line is shown when at least one section has a recommendation:

- **All non-deviating:** *"Watering schedule works well across all sections ✓"* (green)
- **Some deviate:** *"2 sections may need watering adjustments"* (amber) — each deviating section card gets a small amber water-drop indicator
- **No recommendations yet:** Nothing shown (not intrusive for new yards)

---

## Feature 2: Completed Task Details

### Goal

Completed tasks currently show only a strikethrough title and an undo button. Users lose visibility into what the task was about — description, product, application rate, etc. — unless they undo it. The fix is to render the same detail block on completed tasks as on pending tasks.

### Change

**File:** `components/dashboard/TaskList.tsx`

Completed task cards (rendered in the collapsible "X completed tasks" section) will show:

- Strikethrough title (existing)
- Description text
- Product name + Google Shopping link (if `productSearchQuery` set)
- Application rate and spreader setting (if set)
- Scheduled start/end dates (if set)
- Undo button (existing)

Styling remains `opacity-60` to visually differentiate completed tasks from pending ones. No new data fetching needed — all fields are already selected in every task query.

---

## What's Not Changing

- **Section deletion** — cascade delete already removes all analyses and tasks when a section is deleted. A freshly created section always starts with no history. No changes needed.
- **Watering as tasks** — watering schedule is a reference display only, not converted to recurring tasks or reminders.
- **Per-section schedule input** — users set watering at yard level only; per-section adjustments come from AI, not manual input.
