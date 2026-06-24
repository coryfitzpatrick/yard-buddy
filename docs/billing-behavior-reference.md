# Billing behavior reference

Authoritative list of what happens when a subscriber changes plans, by direction. Every change a billing UI surface offers maps to a row in one of the tables below. If the implementation drifts from this doc, fix the implementation, not the doc.

## Core principles

1. **You get what you paid for.** Any change that would strip features from a prepaid annual term is deferred to the renewal date. Annual subscribers always finish the year they paid for at the tier they paid for.
2. **Upgrades that add value apply immediately.** When a user pays more (tier up, or moving to annual prepayment), they get the value today.
3. **The user picks where intent is ambiguous.** Annual→monthly combined with an upgrade has two reasonable interpretations; we ask the user which they want rather than guess.
4. **We never refund to a card.** Prorated differences are applied as customer balance credit that consumes future invoices automatically.

## Naming conventions

- "Now": applies at the moment the user clicks confirm. Stripe is updated immediately, our DB plan reflects the new tier on the next page load, the next bill is charged or credited per the proration.
- "At renewal": applies on the user's current `current_period_end`. A Stripe `subscription_schedule` is created with two phases — phase 1 holds the current state until renewal, phase 2 carries the target state.
- "Same tier": the plan key (`home_basic`, `home_plus`, `professional`) does not change.
- "Tier upgrade" / "tier downgrade": defined by tier rank in `lib/subscription.ts` (`tierRank`): trial < home_basic < home_plus < professional < admin.

## Same-cadence tier changes

These cover Basic ↔ Plus ↔ Pro without changing the billing cadence.

### From monthly

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Basic monthly | Plus monthly | Now | Charged prorated Plus−Basic for rest of month | No archive (Plus has more yards) |
| Basic monthly | Pro monthly | Now | Charged prorated Pro−Basic for rest of month | No archive |
| Plus monthly | Pro monthly | Now | Charged prorated Pro−Plus for rest of month | No archive |
| Plus monthly | Basic monthly | Now | Credited prorated Plus−Basic for rest of month | If user has >1 yard, picker opens to choose the one to keep; others archived now |
| Pro monthly | Plus monthly | Now | Credited prorated Pro−Plus for rest of month | If user has >2 yards, picker; others archived now |
| Pro monthly | Basic monthly | Now | Credited prorated Pro−Basic for rest of month | If user has >1 yard, picker; others archived now |

### From annual

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Basic annual | Plus annual | Now | Charged prorated Plus annual − Basic annual for remaining days of the year | No archive |
| Basic annual | Pro annual | Now | Charged prorated Pro annual − Basic annual for remaining days | No archive |
| Plus annual | Pro annual | Now | Charged prorated Pro annual − Plus annual for remaining days | No archive |
| Plus annual | Basic annual | **At renewal** | Nothing today | At renewal, picker selection (made at submit time) is applied: the chosen yard stays, others archive on renewal date |
| Pro annual | Plus annual | **At renewal** | Nothing today | At renewal, picker selection is applied to fit Plus's limit |
| Pro annual | Basic annual | **At renewal** | Nothing today | At renewal, picker selection is applied to fit Basic's limit |

## Same-tier cadence changes

| From | To | When | Money | Notes |
|---|---|---|---|---|
| Any monthly | Same tier annual | Now | Charged annual amount today; unused days of current month credited toward next bill | New annual term runs 12 months from confirm date |
| Any annual | Same tier monthly | **At renewal** | Nothing today | On renewal, monthly billing begins at the same tier |

## Combined tier change + cadence change

### Monthly → annual (cadence is moving to commit-up direction)

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Basic monthly | Plus annual | Now | Charged Plus annual amount today, less credit for unused days of current month | No archive |
| Basic monthly | Pro annual | Now | Charged Pro annual amount today, less credit for unused days | No archive |
| Plus monthly | Pro annual | Now | Charged Pro annual amount today, less credit for unused days | No archive |
| Plus monthly | Basic annual | Now | Charged Basic annual amount today, less credit for unused days of current Plus month | Picker opens if >1 yard; others archived now |
| Pro monthly | Plus annual | Now | Charged Plus annual amount today, less credit for unused days of current Pro month | Picker opens if >2 yards; others archived now |
| Pro monthly | Basic annual | Now | Charged Basic annual amount today, less credit for unused days | Picker opens if >1 yard; others archived now |

### Annual → monthly + tier upgrade (the only ambiguous case)

For these, the confirm screen shows a fork. The user picks one of two options.

| From | To | Option A: "Upgrade now (annual)" | Option B: "Schedule for renewal" |
|---|---|---|---|
| Basic annual | Plus monthly | Charged prorated Plus annual − Basic annual today; tier flips to Plus on annual cadence. On renewal date, cadence flips to Plus monthly. | Nothing today. On renewal date, plan switches to Plus monthly. |
| Basic annual | Pro monthly | Charged prorated Pro annual − Basic annual today; tier flips to Pro on annual cadence. On renewal date, cadence flips to Pro monthly. | Nothing today. On renewal date, plan switches to Pro monthly. |
| Plus annual | Pro monthly | Charged prorated Pro annual − Plus annual today; tier flips to Pro on annual cadence. On renewal date, cadence flips to Pro monthly. | Nothing today. On renewal date, plan switches to Pro monthly. |

In both options, no yards are archived (the target tier has more headroom).

### Annual → monthly + tier downgrade (always defers)

| From | To | When | Money | Yards |
|---|---|---|---|---|
| Plus annual | Basic monthly | **At renewal** | Nothing today | At renewal, picker selection is applied; others archive on renewal date |
| Pro annual | Plus monthly | **At renewal** | Nothing today | At renewal, picker selection applied to fit Plus limit |
| Pro annual | Basic monthly | **At renewal** | Nothing today | At renewal, picker selection applied to fit Basic limit |

The "fork" pattern does not appear for downgrades because there is only one rational option — you keep what you paid for through the prepaid term, then switch on renewal day. There is no "downgrade now and stay on annual" button because that would forfeit features you already paid for.

## Cancellation

| When | Effect today | At renewal |
|---|---|---|
| User clicks Cancel | `cancel_at_period_end = true` set on Stripe subscription. Pending subscription_schedule (if any) is released. Continued access to current plan. | Subscription transitions to `canceled`. Webhook flips DB `planStatus = "canceled"`. Data retained for 30 days, then deleted. |

Annual subscribers who cancel mid-term keep access through the original renewal date. No partial-year refunds. Pending plan switches are dropped — the subscription just ends at the original renewal.

## Cancellation of a pending switch

| Trigger | Effect |
|---|---|
| User clicks "Cancel pending switch" | Active subscription_schedule is released. Subscription stays on its current price/tier exactly as it was before the switch was scheduled. No money moves. |

## What gets persisted where

| Source of truth | What lives there |
|---|---|
| Stripe subscription | Current price (drives DB `plan` and `currentPeriodEnd`), `cancel_at_period_end`, `schedule` reference |
| Stripe subscription_schedule | Phase 1 and phase 2 prices, phase boundaries |
| Our DB `User.plan` | Cached current tier — updated on webhook events. Authoritative for app entitlements. |
| Our DB `User.planStatus` | `trialing` / `active` / `past_due` / `expired` / `canceled` — mapped from Stripe subscription status |
| Our DB `User.currentPeriodEnd` | Cached from Stripe `items[0].current_period_end` — used in UI for "Next charge on …" |
| Our DB `User.pendingYardArchiveIds` | *Pending implementation* — the yard IDs to archive at renewal for deferred downgrades. Cleared on schedule release / cancel-pending / phase 2 transition. |

## Implementation entry points

- `app/api/stripe/change-plan/route.ts` — accepts `{ plan, period, archiveYardIds?, deferTier? }` and routes to the immediate or scheduled path based on the rules above
- `app/api/stripe/cancel/route.ts` — releases pending schedule, then sets `cancel_at_period_end`
- `app/api/stripe/cancel-pending/route.ts` — releases pending schedule only; subscription continues unchanged
- `app/api/stripe/webhook/route.ts` — `customer.subscription.updated` handler keeps DB in sync; phase 2 transitions arrive as plain `updated` events
- `lib/subscription.ts` — `tierRank`, `isTierUpgrade`, `isTierDowngrade`, plan limits, `getPlanLimits`
- `components/settings/BillingSection.tsx` — confirm screen direction copy and the fork UI

## See also

- `docs/stripe-schedule-release-test-plan.md` — manual test plan for verifying these flows against Stripe in test mode
- `app/terms/page.tsx` § 6 — customer-facing version of these rules
- `app/pricing/page.tsx` "How billing works" expandable — short customer-facing summary
