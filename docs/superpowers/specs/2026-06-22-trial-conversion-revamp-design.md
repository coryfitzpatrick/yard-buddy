# Trial Conversion Revamp Design

**Date:** 2026-06-22
**Status:** Design approved, ready for implementation plan

## Goal

Improve trial → paid conversion by reframing the trial around *system experience* (smart diagnosis + reliable schedule + weather-aware reminders) instead of *yard outcomes* (which a short trial cannot deliver). Use a longer trial, an engagement-based extension, and visible-but-locked feature teasers to keep upgrade interest persistent without forcing users out before they have felt the value.

## Strategic Frame

**Why the current 14-day trial underperforms:**
- Yard improvement is slow. Watering color changes take 1-3 weeks. Soil amendments take 4-8 weeks. A 14-day window cannot show outcomes.
- Current trial caps visible tasks at 1, so users do not perceive the app's depth even on day 1.
- Users take one photo, see one task, and never come back.

**Three-part bet:**
1. **More time, more rhythm.** 21 days base, 28 with engagement extension. Enough reminder + weather cycles for the "this app keeps me on track" feeling to land. Watering color shifts begin to show.
2. **Visible locks during trial.** Even with full access otherwise, users see what paid tiers unlock (more tasks, more yards, per-section overrides). Conversion interest stays warm throughout.
3. **Engagement reward + nudge.** Earning +7 days for actually using the schedule is both a UX carrot and a behavior shaper. Users who never set a schedule probably will not convert anyway, so the +7 self-selects for likely converters.

## Day-by-Day User Journey

**Day 1 (signup):**
- Lands on dashboard, runs first analysis
- Sees task 1 in full + tasks 2-5 as locked previews ("Unlock 4 more tasks")
- `PersonalizedScheduleCard` prompts schedule setup
- Trial progress card appears at top of dashboard (0/2 steps)
- Trial banner: "21 days left"

**Day 2-5:**
- Watering and mowing reminders fire on the schedule the user set
- Weather widget shows forecast; weather alerts fire if rain forecast on a scheduled day
- Trial progress card updates to 1/2 if schedule was set on day 1
- **Day 5 nudge** if schedule still not set: push + email — "Set your schedule to earn 7 more trial days"

**Day 5-10 (engagement window):**
- User marks a task done → trial progress card shows 2/2 → +7 days awarded → card celebrates for 24h then hides → trial banner updates to "23 days left"
- **Day 10 nudge** if schedule set but no task completed: push + email — "Mark a task done to earn 7 more days"

**Day 10-18:**
- Reminders, weather alerts, schedule keep flowing
- Around day 14: in-app prompt to take second analysis ("See what's changed in your yard")
- Locked teasers continue surfacing in context ("Add another yard," "Per-section schedule override")

**Day 18-21 (or 25-28 if extended):**
- Trial-ending email at T-3 days (existing cron retargeted)
- Trial banner visual urgency increases ("3 days left")
- Dashboard banner: "Upgrade to keep your schedule running"

**Day 21 (or 28) — wall lands:**
- Reminders stop firing
- Cannot run new analyses
- Tasks visible read-only, locked previews stay locked
- Dashboard top: prominent upgrade prompt
- 30-day data retention grace period begins

## Trial Progress Card

**Placement:** Top of `/dashboard`, above existing trial banner. Visible while trial is active AND user has not yet earned the engagement bonus.

**States:**

State A — neither step done:
```
🌱 Earn 7 more trial days
☐ Set a watering or mowing schedule          [Set up →]
☐ Complete a task

20 days left in trial · Complete both to extend to <date>
```

State B — schedule set, task not yet completed:
```
🌱 Earn 7 more trial days
✓ Schedule set
☐ Complete a task — Mark any task as done from your yard tasks list

19 days left in trial · Complete one more to extend to <date>
```

State C — both done (shows for 24h, then hides):
```
🎉 You earned 7 more trial days
Trial now ends <date>
```

**Engagement detection:**
- **Schedule check:** any yard or section owned by this user has non-empty `wateringDays[]` or `mowingDays[]`
- **Task completion check:** any `LawnTask.completedAt` is non-null for tasks belonging to this user's yards
- **Bonus grant:** when both checks pass and `User.trialEngagementBonusGrantedAt` is null, set the flag and add 7 days to `trialEndsAt`. Idempotent.

**Nudges:**
- Day 5: cron checks each trialing user — if no schedule set, send push + email "Set your schedule to earn 7 more trial days." Idempotent per user via flag (`day5NudgeSentAt`).
- Day 10: cron checks — if schedule set but bonus not yet granted, send push + email "Mark a task done to earn 7 more days." Idempotent per user (`day10NudgeSentAt`).
- Nudges stop firing once the relevant condition is met.

## Locked Teasers During Trial

**Tasks 2-5 (on task list, after analysis):**
- Task 1: fully visible, actionable
- Tasks 2-5: title visible, body blurred, lock icon, CTA "Unlock all 5 tasks with Home Basic"

**"Add another yard" (on `/dashboard`):**
- Below the user's existing yard card
- Locked card with disabled CTA: "Track up to 3 yards with Home Plus"

**Per-section schedule override (on section detail page):**
- Existing toggle, locked for trial + Basic users
- "Per-section schedules with Home Plus"
- Verify lock UX is prominent (existing implementation may need polish)

**Supporting work — single-section yard timeline:**
- When `yard.sections.length === 1` (default "Whole Yard" case), surface the analysis chart + history list on the yard detail page directly
- Reuse the same widget that lives on the section detail page
- Section detail page keeps its widget for multi-section yards
- This benefits trial AND Home Basic users — both groups typically never split their yard and currently cannot find their analysis history

## Wall Behavior at Day 21 / 28

**What stops working when `isEffectivelyExpired(user)` is true:**
- New analyses blocked (already enforced via `canRunAnalysis: false`)
- Schedule reminder cron skips this user (push and email)
- Schedule editing locked — cannot change days/time, cannot apply new recommendations
- Tasks visible but read-only; locked previews stay locked
- Weather widget keeps showing forecast (cheap, may pull user back in)

**What the user sees on day 21/28:**
- Existing trial-ended banner ("Your free trial has ended. Your data will be deleted in 30 days unless you upgrade") — keep, extend to dashboard top (currently only shows on yard detail)
- Dashboard-level prominent upgrade CTA card at top: "Restart your schedule + reminders" with Upgrade button
- Final push + email at midnight on expiry day: "Your trial ended. Upgrade to keep your schedule running."

**Recovery path:**
- User opens app post-expiry → sees banner + dashboard CTA
- Clicks Upgrade → Stripe checkout → returns → `planStatus = "active"` → reminders resume on next cron tick → no data loss

## Data Loss Warnings During Grace Period

**In-app banners:**
- Existing yard detail banner — keep
- Same banner added to `/dashboard` top (currently dashboard does not show it)
- Settings billing section shows the countdown prominently
- Banner visual urgency escalates: amber when more than 7 days remain, red when 7 or fewer days remain (existing pattern on yard detail, extend everywhere)

**Email touchpoints during the 30-day grace period:**
- Day 0 (expiry day): "Your trial ended. Your data deletes in 30 days unless you upgrade."
- T-14 days: "16 days until your yard data is permanently deleted."
- T-7 days: "Last week to save your yard data."
- T-2 days: "Your data deletes in 2 days. This is your final notice."
- Day 30 (deletion day): "Your account data has been deleted per our retention policy."

**Push (mobile users) — restrained cadence:**
- T-7 days: single push — "Last week to keep your Yard Analyzer data"
- T-1 day: single push — "Your data deletes tomorrow"

**Settings page:**
- Grace period countdown prominently in billing section
- Single-click "Restore my account" link → Stripe checkout

**Cron:** new `account-deletion-warnings` cron OR extension of existing `account-deletion` cron handles the email + push touchpoints. Idempotent per user per touchpoint.

## Technical Summary

### Database Changes

**`User` model additions (Prisma):**
- `trialEngagementBonusGrantedAt: DateTime?` — idempotent flag for the +7 bonus
- `day5NudgeSentAt: DateTime?` — idempotent flag for day-5 schedule nudge
- `day10NudgeSentAt: DateTime?` — idempotent flag for day-10 task-completion nudge
- Grace-period email/push idempotency flags (e.g., `graceDay14EmailSentAt`, `graceDay7EmailSentAt`, `graceDay2EmailSentAt`, `gracePush7SentAt`, `gracePush1SentAt`) or a single JSON column
- New migration with `ALTER TABLE … ENABLE ROW LEVEL SECURITY` per project convention

### Subscription & Trial Logic

**`lib/time.ts`:**
- Change `TRIAL_DAYS` constant from 14 to 21

**`lib/subscription.ts`:**
- `grantEngagementBonus(userId)` — adds 7 days to `trialEndsAt`, sets `trialEngagementBonusGrantedAt`, idempotent
- `getEngagementStatus(user)` — returns `{ scheduleSet: boolean; taskCompleted: boolean; bonusEarned: boolean }`
- Engagement checks query for schedule presence and task completion

### Engagement Detection Hooks

- On schedule-apply endpoints (watering, mowing, combined) — after successful write, check engagement status and grant bonus if both conditions met
- On task-complete action (`app/_actions/tasks.ts`) — after successful update, same check

### UI Components (new)

- `TrialProgressCard` — `/dashboard` top, three states, hides after 24h celebration
- `LockedTaskPreview` — blurred/locked variant of task card, takes lock copy as prop
- `LockedYardCard` — "Add another yard" locked variant for `/dashboard`
- Yard detail page change: render analysis timeline widget inline when `sections.length === 1`

### Cron Jobs

- `app/api/cron/trial-reminders/route.ts` — extend with day-5 schedule nudge and day-10 task-completion nudge, idempotent
- Verify the schedule reminder cron skips users where `isEffectivelyExpired(user)` is true. Fix if it does not.
- New `app/api/cron/account-deletion-warnings/route.ts` (or extend existing `account-deletion` cron) — sends T-14, T-7, T-2 emails and T-7, T-1 pushes during grace period
- Final trial-end push + email on expiry midnight — extend existing trial-reminders or new touchpoint

### Pricing / Plan Display

- Free trial card on `/pricing` updates from "14 days" → "21 days" (28 with engagement bonus)
- Add small copy explaining the bonus: "Earn 7 more days by setting your schedule and completing your first task"

### Out of Scope (Separate Future Work)

- Watering / mowing log model and "I did it" button on schedule reminders — full schedule tracking is its own feature
- Analytics dashboard / trends view — separate feature
- Onboarding tour or first-run hints — separate UX project

## Open Implementation Questions

These are flagged for the implementation plan to resolve, not blockers for this design:

1. Does the existing reminder cron already skip expired users? If yes, no extra work. If no, the implementation plan needs a fix.
2. Is the per-section override toggle's lock UX prominent enough today, or does it need polish?
3. Single column vs. multiple columns for grace-period idempotency flags — implementation choice based on whether we want future flexibility (JSON) or strict schema clarity (named columns).
