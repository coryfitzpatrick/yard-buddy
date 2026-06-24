# Billing behavior reference

Authoritative list of what happens when a subscriber changes plans. Every row in the tables below corresponds to one customer-visible behavior. If the implementation drifts from this doc, fix the implementation, not the doc.

## TL;DR

| You're on | You want | Happens |
|---|---|---|
| Any plan | Tier upgrade (same cadence) | Now, pay prorated diff |
| Monthly | Tier downgrade | Now, credit prorated diff, pick yards if over limit |
| Monthly | Switch to annual (same tier) | Now, pay annual amount less unused-month credit |
| Annual | Tier upgrade (same or different cadence) | Now: upgrade to higher annual at prorated diff. If target cadence is monthly, also schedule the monthly switch for renewal. |
| Annual | Tier downgrade (any cadence target) | Wait until renewal. Pick yards at renewal via modal. |
| Annual | Switch to monthly (same tier) | Wait until renewal. |

**One rule of thumb:** if you're on annual, the only thing that takes effect today is a tier upgrade. Everything else waits.

## Plain-English walkthrough of the canonical cases

These are the specific journeys the rules were designed around.

### Basic annual → Basic monthly (same plan, switch off annual)

1. User clicks confirm.
2. Nothing changes today. The subscription stays on Basic annual through the rest of the prepaid year.
3. On the renewal date, the subscription switches to Basic monthly. The user is charged $5.99 then and every month after.
4. No yard archive — same tier, same yard limit.

### Basic annual → Plus monthly (upgrade tier AND switch off annual)

1. User clicks confirm.
2. **Today:** the remaining Basic annual term is upgraded to Plus annual. Stripe charges the prorated difference (Plus annual − Basic annual, scaled to remaining days of the year). Plus features unlock immediately.
3. **On the renewal date:** the subscription switches from Plus annual to Plus monthly. From then on, the user is billed $9.99/mo.
4. **There is no shortcut to "Plus monthly today."** The annual commitment has to finish out at the higher tier first.

### Plus monthly → Basic annual (tier downgrade AND switch to annual)

1. User clicks confirm.
2. Since the user has 2 yards on Plus and Basic only supports 1, the picker modal opens at submit. User picks the yard to keep, others go to archive list.
3. **Today:** subscription updates to Basic annual. Stripe charges $59.99 for the year less a credit for unused days of the current Plus monthly cycle. The unpicked yard is archived immediately.
4. The user's annual term runs 12 months from today.

### Plus annual → Basic annual (tier downgrade, same cadence, while on annual)

1. User clicks confirm.
2. Nothing changes today. The subscription stays on Plus annual with all yards through the rest of the prepaid year.
3. **On the renewal date:** subscription switches to Basic annual. The user is charged $59.99 for the next year.
4. **Also on the renewal date:** if the user has more yards than Basic supports, the next time they open the app the at-renewal yard limit modal blocks them and forces a pick. They can either keep 1 yard and archive the rest, or upgrade back to Plus to keep them all.

### Plus annual → Basic monthly (tier downgrade AND switch off annual)

1. User clicks confirm.
2. Nothing changes today.
3. **On the renewal date:** subscription switches to Basic monthly ($5.99/mo billing starts).
4. **Same yard-limit modal as above:** on next app load after the flip, user picks 1 yard to keep on Basic or upgrades.

### Pro tier variants

Pro behaves the same as Plus across all of these. Pro annual → Plus annual is a deferred downgrade with a yard limit modal at renewal (Plus supports 2 yards; if Pro user has 10, they pick 2). Pro monthly → Plus monthly is an immediate downgrade with a picker today.

## Core principles

1. **If you're on annual, the only change that takes effect today is a tier upgrade.** You pay the prorated difference and start using the higher tier immediately. Everything else (downgrade, cadence switch, combination) waits for renewal.
2. **If you're on monthly, every change takes effect today.** Upgrades charge the prorated difference; downgrades credit the prorated difference toward your next bill; switching to annual prepays the year (with a credit for unused days of the current month).
3. **You always get what you paid for.** Annual subscribers finish the year they prepaid at the tier they prepaid for. We never strip features mid-prepaid-term, never issue partial-year refunds.
4. **Yard archive happens at the moment of the downgrade.** For monthly downgrades that's "now"; for annual downgrades that's "renewal day." The user picks which yards to keep when the downgrade actually takes effect, not at submit time.
5. **Money never goes back to a card.** Prorated differences become customer balance credit that consumes future invoices automatically.

## Same-cadence tier changes

### From monthly

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Basic monthly | Plus monthly | Now | Charged prorated Plus − Basic for rest of month | No archive (Plus has more yards) |
| Basic monthly | Pro monthly | Now | Charged prorated Pro − Basic for rest of month | No archive |
| Plus monthly | Pro monthly | Now | Charged prorated Pro − Plus for rest of month | No archive |
| Plus monthly | Basic monthly | Now | Credited prorated Plus − Basic toward next bill | Picker if >1 yard; chosen one(s) stay, others archive now |
| Pro monthly | Plus monthly | Now | Credited prorated Pro − Plus toward next bill | Picker if >2 yards; archive now |
| Pro monthly | Basic monthly | Now | Credited prorated Pro − Basic toward next bill | Picker if >1 yard; archive now |

### From annual

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Basic annual | Plus annual | Now | Charged prorated Plus annual − Basic annual for remaining days | No archive |
| Basic annual | Pro annual | Now | Charged prorated Pro annual − Basic annual for remaining days | No archive |
| Plus annual | Pro annual | Now | Charged prorated Pro annual − Plus annual for remaining days | No archive |
| Plus annual | Basic annual | **At renewal** | Nothing today | At renewal the plan flips; if user has >1 yard, the at-renewal yard limit modal opens on next app load — pick 1 to keep or upgrade to keep all |
| Pro annual | Plus annual | **At renewal** | Nothing today | At renewal the modal opens; pick 2 to keep or upgrade |
| Pro annual | Basic annual | **At renewal** | Nothing today | At renewal the modal opens; pick 1 to keep or upgrade |

## Same-tier cadence changes

| From | To | When | Money | Notes |
|---|---|---|---|---|
| Any monthly | Same tier annual | Now | Charged annual amount today; unused days of current month credited toward next bill | New annual term runs 12 months from confirm date |
| Any annual | Same tier monthly | **At renewal** | Nothing today | On renewal, monthly billing begins at the same tier |

## Combined tier + cadence changes

### Monthly → annual (commit-up direction; always immediate)

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Basic monthly | Plus annual | Now | Charged Plus annual amount today, less credit for unused days of current month | No archive |
| Basic monthly | Pro annual | Now | Charged Pro annual amount today, less credit | No archive |
| Plus monthly | Pro annual | Now | Charged Pro annual amount today, less credit | No archive |
| Plus monthly | Basic annual | Now | Charged Basic annual amount today, less credit | Picker if >1 yard; archive now |
| Pro monthly | Plus annual | Now | Charged Plus annual amount today, less credit | Picker if >2 yards; archive now |
| Pro monthly | Basic annual | Now | Charged Basic annual amount today, less credit | Picker if >1 yard; archive now |

### Annual → monthly + tier upgrade (tier today, cadence at renewal)

To upgrade to a higher plan on monthly while currently on a lower plan annual, **the remaining annual term has to be upgraded to the higher tier first.** There is no path that delivers the higher tier on monthly billing today without first paying for the higher tier on annual through the prepaid term. This is the only kind of immediate change available to an annual subscriber.

| From | To | Today | At renewal |
|---|---|---|---|
| Basic annual | Plus monthly | Charged prorated Plus annual − Basic annual; the remaining annual term upgrades to Plus annual; Plus features unlock | Cadence flips to Plus monthly |
| Basic annual | Pro monthly | Charged prorated Pro annual − Basic annual; remaining annual term upgrades to Pro annual; Pro features unlock | Cadence flips to Pro monthly |
| Plus annual | Pro monthly | Charged prorated Pro annual − Plus annual; remaining annual term upgrades to Pro annual; Pro features unlock | Cadence flips to Pro monthly |

No yard archive in any of these — the new tier has more headroom.

### Annual → monthly + tier downgrade (entirely deferred)

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Plus annual | Basic monthly | **At renewal** | Nothing today | At renewal the at-renewal yard limit modal opens; pick 1 or upgrade |
| Pro annual | Plus monthly | **At renewal** | Nothing today | Modal opens; pick 2 or upgrade |
| Pro annual | Basic monthly | **At renewal** | Nothing today | Modal opens; pick 1 or upgrade |

## Cancellation

| When | Effect today | At renewal |
|---|---|---|
| User clicks Cancel | `cancel_at_period_end = true` set on Stripe. Pending subscription_schedule (if any) is released. Continued access to current plan. | Subscription transitions to `canceled`. Webhook flips DB `planStatus = "canceled"`. Data retained for 30 days, then deleted. |

Annual subscribers who cancel mid-term keep access through the original renewal date. No partial-year refunds. Pending plan switches are dropped — the subscription just ends at the original renewal.

## Cancellation of a pending switch

| Trigger | Effect |
|---|---|
| User clicks "Cancel pending switch" | Active subscription_schedule is released. Subscription stays on its current price/tier exactly as it was before the switch was scheduled. No money moves. |

## Trial

The trial is "full product with two real gates and two quantitative throttles." Most paid features work; the user is just metered on volume and on task visibility, plus the 21-day clock.

**Real gates (capability):**
- **Tasks**: `maxVisibleTasks: 1` — only the first prioritized task is visible; the rest are teased with titles and a count.
- **Time**: 21 days, +7 if the user sets a schedule AND completes a task (one-time engagement bonus).

**Throttles (count caps):**
- 1 yard
- 2 analyses per month

**Not gated:**
- Watering and mowing schedules (yard level and per-section). `canSetSectionSchedule` returns `true` for `"trial"`.
- Email reminders for schedules.
- Running analyses (within the 2/month throttle).
- Full UI, weather widget, photo history.

| When | What happens |
|---|---|
| Account creation | 21-day trial begins. No card required. `User.plan = "trial"`, `User.planStatus = "trialing"`, `User.trialEndsAt = now + 21d`. |
| User engages with the product | If they set up a schedule AND complete a task during the trial, `trialEngagementBonusGrantedAt` is set and `trialEndsAt` extends by 7 days. One-time per account. |
| Trial ends without subscription | `isEffectivelyExpired` returns true. `getPlanLimits` returns the `expired` row (no analyses allowed, 1 yard limit). `getDaysUntilDeletion` starts counting down 30 days from `trialEndsAt`. |
| Trial user subscribes before trial ends | Stripe checkout creates a real subscription. Webhook updates `plan` and `planStatus`, and stamps `User.analysisQuotaResetAt = now` so trial analyses don't count against the new plan's first calendar month. The analyze route uses `max(startOfMonth, analysisQuotaResetAt)` as the cutoff, so the user gets the full paid quota (4 on Basic, 8 on Plus/Pro) for the rest of that month. |
| 30 days past trial end with no subscription | Account-deletion cron removes the user, their yards, analyses, and Supabase photos. |

## Failed payments

| When | What happens |
|---|---|
| Stripe charge fails on renewal | Stripe retries per its default schedule. `invoice.payment_failed` webhook fires. If our `User.lastPaymentFailedInvoiceId !== invoice.id` (idempotency), we update `planStatus = "past_due"` (if it was `"active"`), record the invoice id, and email the user with a billing portal link. |
| User updates card before Stripe gives up | Next retry succeeds, `customer.subscription.updated` webhook flips `planStatus` back to `"active"`. |
| Stripe gives up retries | Subscription transitions to `canceled` in Stripe. Webhook flips DB `planStatus = "canceled"`. 30-day deletion clock starts as for any cancellation. |

## What `past_due` actually means now

`past_due` is the single user-facing bucket for "billing is broken, you can't use the app until it's fixed." It collapses four Stripe states: `past_due` (failed renewal), `incomplete` (SCA pending), `unpaid` (dunning exhausted), and `paused` (admin pause_collection). The Stripe distinction lives in the webhook log; in our DB it's one bucket.

While `planStatus === "past_due"`:

- **No paid feature access.** `getPlanLimits` returns the `past_due` row: `maxAnalysesPerYardPerMonth: 0`, `canRunAnalysis: false`, `maxVisibleTasks: 1`, `maxYards: 1`. Same shape as `expired`, different meaning.
- **Persistent in-app banner** at the top of the dashboard layout: *"Your billing needs attention. Paid features are paused until your payment method is updated."* Links to `/api/stripe/portal?flow=payment_method_update` which jumps straight into the Stripe billing portal card-update flow.
- **No deletion clock.** `past_due` is intentionally NOT in `isEffectivelyExpired`, so `getDaysUntilDeletion` returns null. Billing is recoverable; the moment a retry succeeds the webhook flips `planStatus` back to `"active"` and all access returns.
- **No task/weather reminder emails.** The daily-tasks cron filters `past_due` out of the reminder-user query — sending watering reminders to someone who can't use the app is incoherent. Card-expiry warnings still go through.

## At-renewal yard limit modal

When a deferred annual downgrade's phase 2 fires, the user's plan flips down. If they have more active yards than the new plan supports, the next time they open the app the dashboard layout renders `YardLimitExceededModal` and gates further use:

- Modal title: "Your plan changed to [Plan]"
- Body: "[Plan] supports N yards, and you currently have M. Pick the N yards you want to keep on [Plan], or upgrade to keep all M."
- Two actions: a primary "Keep N, archive M−N" submit button and a secondary "Upgrade to keep all M" link to `/pricing`.

The modal cannot be dismissed without picking. Once submitted, `/api/yards/archive` archives the unpicked yards and the page refreshes.

## What gets persisted where

| Source of truth | What lives there |
|---|---|
| Stripe subscription | Current price (drives DB `plan` and `currentPeriodEnd`), `cancel_at_period_end`, `schedule` reference |
| Stripe subscription_schedule | Phase 1 and phase 2 prices, phase boundaries |
| Our DB `User.plan` | Cached current tier — updated on webhook events. Authoritative for app entitlements. |
| Our DB `User.planStatus` | `trialing` / `active` / `past_due` / `expired` / `canceled` — mapped from Stripe subscription status. `past_due` collapses Stripe `past_due`, `incomplete`, `unpaid`, `paused`; `incomplete_expired` maps to `canceled`. |
| Our DB `User.currentPeriodEnd` | Cached from Stripe `items[0].current_period_end` — used in UI for "Next charge on …" |
| Our DB `User.analysisQuotaResetAt` | Set when a trial user first subscribes to a paid plan; used by the analyze route as a cap-counting cutoff so trial usage doesn't dock the first paid month. |
| Our DB `User.lastPaymentFailedInvoiceId` | Idempotency guard so we don't double-process the same `invoice.payment_failed` retry. |

There is no `deferTier` flag, no `pendingYardArchiveIds`, no yard-pick stored at submit time for deferred downgrades. The yard pick happens after the plan actually changes, via the modal.

## Behavior contract (what tests must enforce)

These are the invariants that every code change must preserve. If a test fails one of these claims, the implementation is wrong, not the test.

### Route: `POST /api/stripe/change-plan`

1. **Tier upgrade on monthly** → calls `subscriptions.update` immediately with the target monthly price and `proration_behavior: "always_invoice"`. Creates no schedule. Persists `User.plan`. Returns `{ ok: true, deferred: false }`.
2. **Tier downgrade on monthly** → same as (1) but with target downgrade price. If `activeYardCount > newPlan.maxYards`, returns `400 archive_required` unless the request includes the right number of `archiveYardIds`. With a valid pick, archives those yards in the same transaction as the plan write.
3. **Same-tier monthly → annual** → calls `subscriptions.update` with the target annual price, no schedule, persists DB.
4. **Same-tier annual → monthly** → does NOT call `subscriptions.update`. Releases any pre-existing schedule, then creates a new schedule from the subscription with phase 1 = current annual price (kept through `current_period_end`) and phase 2 = target monthly price with monthly duration. Does NOT persist `User.plan` (it doesn't change today). Returns `{ ok: true, deferred: true }`.
5. **Tier upgrade on annual, same cadence (annual → annual)** → calls `subscriptions.update` immediately with the higher annual price. No schedule.
6. **Tier downgrade on annual, same cadence (annual → annual)** → does NOT call `subscriptions.update`. Creates a schedule with phase 1 = current annual, phase 2 = target annual with annual duration. Does NOT persist `User.plan`. Yard archive is NOT required at submit time; deferred to renewal.
7. **Combined: annual + tier upgrade + target monthly** (e.g. Basic annual → Plus monthly) → calls `subscriptions.update` immediately to upgrade the tier on the existing annual cadence (charges prorated upgrade diff). Then creates a schedule with phase 1 = new tier annual, phase 2 = new tier monthly with monthly duration. Persists `User.plan` immediately.
8. **Combined: annual + tier downgrade + target monthly** (e.g. Plus annual → Basic monthly) → fully deferred. No `subscriptions.update` today, no DB plan write today, no yard archive required at submit. Schedule has phase 1 = current annual, phase 2 = target monthly.
9. **Existing pending schedule + new change** → releases the old schedule before applying the new one in both immediate and scheduled branches.
10. **`plan === "trial"` in request** → rejected with 400.
11. **No subscription** → rejected with 400.

### Route: `POST /api/stripe/cancel`

The route reads live state from Stripe (via `subscriptions.retrieve`) rather than our cached `User.planStatus`, since webhook delivery delays can leave the DB lagging behind Stripe.

1. **No pending schedule, status active, `cancel_at_period_end: false`** → calls `subscriptions.update` with `cancel_at_period_end: true`. No schedule release attempt.
2. **Pending schedule exists** → calls `subscriptionSchedules.release` first, then `subscriptions.update` with `cancel_at_period_end: true`.
3. **Stripe reports status canceled** → returns 400, no schedule release, no update. (Note: uses live Stripe state, not cached `User.planStatus`.)
4. **`cancel_at_period_end` already true** → returns 400, no duplicate Stripe writes.

### Route: `POST /api/stripe/cancel-pending`

1. **Schedule attached** → releases it. Subscription itself is untouched. Returns 200.
2. **No schedule attached** → 400.
3. **No subscription** → 400.

### Route: `POST /api/yards/archive`

1. **Valid yard IDs the caller owns and that are not already archived** → sets `archivedAt` on each.
2. **Empty or non-array** → 400.
3. **An ID the user doesn't own or that's already archived** → 400 with `code: "archive_invalid_ids"`.

### Webhook: `customer.subscription.updated`

1. **Plan change from `"trial"` to any paid plan** → persists the new `plan`, persists `planStatus = "active"`, sets `analysisQuotaResetAt = now`.
2. **Plan change between paid tiers** → persists the new `plan`. Does NOT touch `analysisQuotaResetAt`.
3. **No-op idempotency** → skips the DB write only when ALL of plan, planStatus, currentPeriodEnd, and stripeSubscriptionId match what we already have. A renewal that advances `current_period_end` without changing plan/status MUST still write through, otherwise the "Next charge on …" UI sticks at the old date.
4. **Subscription `status = "canceled"`** → persists `planStatus = "canceled"`.
5. **Subscription `status = "past_due"`** → persists `planStatus = "past_due"`.
5a. **Subscription `status = "incomplete"`** (initial payment hasn't cleared; SCA pending, 23h window) → persists `planStatus = "past_due"`. No warn — explicitly mapped.
5b. **Subscription `status = "unpaid"`** (dunning retries exhausted; sub still exists, user can recover by updating card) → persists `planStatus = "past_due"`. No warn — explicitly mapped.
5c. **Subscription `status = "paused"`** (admin set `pause_collection`) → persists `planStatus = "past_due"`. No warn — explicitly mapped.
5d. **Subscription `status = "incomplete_expired"`** (23h SCA window passed; sub permanently dead) → persists `planStatus = "canceled"`. The 30-day deletion clock applies.
6. **Any other Stripe `status`** Stripe might ship in the future → persists `planStatus = "past_due"` AND emits a `logger.warn` with the offending status. The default is NEVER `"expired"` because expired triggers the 30-day deletion clock and we shouldn't nuke an account because Stripe sent something we don't recognize yet. The log surfaces the unknown status so a real handler can be added. (Tested with a fabricated `"made_up_status"` to exercise the guardrail without aliasing a known status.)
7. **Plan increase that allows more yards** → auto-restores most recently archived yards up to the new limit, atomically with the user update inside a single `db.$transaction`.

### Analyze route quota cutoff

1. **No `analysisQuotaResetAt`** → counts analyses from start of calendar month.
2. **`analysisQuotaResetAt` in current month** → counts analyses since that timestamp.
3. **`analysisQuotaResetAt` in a previous month** → falls back to start-of-month (the field has timed out naturally).

### Layout: dashboard renders `YardLimitExceededModal`

1. **`activeYardCount > maxYards`** → modal renders.
2. **`activeYardCount <= maxYards`** → modal does not render.
3. **`maxYards === -1`** (admin / unlimited) → modal never renders.

## Implementation entry points

- `app/api/stripe/change-plan/route.ts` — accepts `{ plan, period, archiveYardIds? }` and routes to immediate or scheduled based on the rules above
- `app/api/stripe/cancel/route.ts` — releases pending schedule, sets `cancel_at_period_end`
- `app/api/stripe/cancel-pending/route.ts` — releases pending schedule only
- `app/api/stripe/webhook/route.ts` — `customer.subscription.updated` keeps DB in sync; phase 2 transitions arrive as plain `updated` events
- `app/api/yards/archive/route.ts` — archives the yard IDs the user picks via the at-renewal modal
- `app/(dashboard)/layout.tsx` — renders `YardLimitExceededModal` when active yard count exceeds the current plan's limit
- `components/yards/YardLimitExceededModal.tsx` — the at-renewal yard picker
- `components/settings/BillingSection.tsx` — confirm screen direction copy
- `lib/subscription.ts` — `tierRank`, `isTierUpgrade`, `isTierDowngrade`, plan limits, `getPlanLimits`

## See also

- `docs/stripe-schedule-release-test-plan.md` — manual test plan for verifying these flows in Stripe test mode
- `app/terms/page.tsx` § 6 — customer-facing version of these rules
- `app/pricing/page.tsx` "How billing works" expandable — short customer-facing summary
