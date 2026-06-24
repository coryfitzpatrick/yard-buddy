# Billing behavior reference

Authoritative list of what happens when a subscriber changes plans. Every row in the tables below corresponds to one customer-visible behavior. If the implementation drifts from this doc, fix the implementation, not the doc.

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
| Our DB `User.planStatus` | `trialing` / `active` / `past_due` / `expired` / `canceled` — mapped from Stripe subscription status |
| Our DB `User.currentPeriodEnd` | Cached from Stripe `items[0].current_period_end` — used in UI for "Next charge on …" |

There is no `deferTier` flag, no `pendingYardArchiveIds`, no yard-pick stored at submit time for deferred downgrades. The yard pick happens after the plan actually changes, via the modal.

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
