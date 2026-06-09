# Personalized Reminders — Section Detail & Edit

**Date:** 2026-06-09
**Status:** Approved

## Overview

Add a "Personalized Reminders" card to the section detail page that displays the user's self-described mowing and watering schedules. Users set and edit these on the section edit page. The card replaces the existing `RoutineCaptureCard` (AI task-generation flow) and the `WateringCard` (AI watering recommendation) with a single, simpler read-only display. Content is always visible regardless of lawn health score.

## Data Model

Add one new field to `YardSection`:

```prisma
mowingSchedule  String?
```

`wateringSchedule` already exists and is reused for user-entered watering text. The AI population path (WateringCard button → `/api/sections/[sectionId]/watering`) is removed along with the card, so this field is now exclusively user-managed.

`wateringDeviates` is no longer needed (it only supported the AI deviation indicator) and can be removed from the schema.

`currentRoutine` stays in the schema untouched. Existing values are ignored going forward — users who had a routine saved will see an empty card until they fill in the edit page.

Migration: `prisma migrate dev --name add_mowing_schedule_drop_watering_deviates`

## Section Detail Page

**Layout (updated order):**
1. Header — section name, grass type, size, Edit / Analyze buttons
2. Latest analysis — health score, chart, summary, issues, photos
3. Past analyses — collapsible list
4. **Personalized Reminders** — collapsible, closed by default
5. TaskList

**Personalized Reminders card behavior:**
- Collapsible, **closed by default**
- Always rendered — not conditional on health score
- Header: calendar-check icon + "Personalized Reminders" label + chevron toggle
- When open and fields are populated: shows mowing schedule and watering schedule as labeled text blocks
- When open and only one field is set: shows only the populated field
- When open and both are empty: shows "Set your schedule on the edit page →" link
- No inline editing, no AI generation, no API calls

**Remove:**
- `WateringCard` component and its route (`/api/sections/[sectionId]/watering`)
- `RoutineCaptureCard` component and its routes (`/api/sections/[sectionId]/routine/preview` and `/confirm`)

## Section Edit Page

`SectionForm` gets two new optional text fields in a "Personalized Reminders" fieldset, placed below the existing soil/notes fields:

| Field | Schema field | Placeholder |
|-------|-------------|-------------|
| Mowing schedule | `mowingSchedule` | e.g. Weekly at 3.5 inches |
| Watering schedule | `wateringSchedule` | e.g. Mon/Wed/Fri mornings, 20 min per zone |

Help text below the fieldset: "These are your own notes — they won't affect AI analysis."

Because the create page (`/sections/new`) and edit page share `SectionForm`, these fields are available at section creation time. Values filled in during creation appear in the detail page card immediately.

## Seed Data

Update `scripts/seed-demo.ts` to:
- Populate `mowingSchedule` for all seven demo sections with realistic values
- Remove all `wateringDeviates` field assignments (field is being dropped)
- Keep existing `wateringSchedule` values as-is (they become the user-entered watering schedule)

## Out of Scope

- Reminder notifications triggered by mowing/watering schedule (Phase 2 scheduler)
- Parsing or migrating existing `currentRoutine` values
- AI generation of tasks from this card
- The fertilizer field (removed with `RoutineCaptureCard`)
