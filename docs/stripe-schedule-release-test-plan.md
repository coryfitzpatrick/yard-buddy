# Stripe schedule release: manual test plan

Verify that subscription_schedule lifecycle behaves correctly in Stripe test mode before the annual→monthly deferred-switch flow goes live. This covers the three release sites we added (`change-plan` annual→monthly path, `change-plan` immediate path, `cancel`, `cancel-pending`) and the cases where Stripe's own behavior is not obvious from the SDK types.

## Prerequisites

- Stripe test mode keys plumbed into `.env.local`:
  - `STRIPE_SECRET_KEY` (sk_test_...)
  - `STRIPE_WEBHOOK_SECRET` for local Stripe CLI webhook forwarding
  - `STRIPE_PRICE_HOME_BASIC_MONTHLY` / `_ANNUAL`
  - `STRIPE_PRICE_HOME_PLUS_MONTHLY` / `_ANNUAL`
  - `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL`
- Stripe CLI installed and `stripe listen --forward-to localhost:3000/api/stripe/webhook` running.
- A test user in the dev DB. Test card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- Tail the dev server logs in one terminal.
- Open the customer's Stripe Dashboard page (test mode) so you can watch state transitions visually.

For scenarios that hinge on a future renewal date, use the Stripe CLI's clock-advancing helper after each subscription is created:

```bash
# Create a test clock advanced to "right before annual renewal"
stripe test_helpers test_clocks create --frozen-time $(date -v+11m +%s)
# Attach it to a new customer/subscription, or advance an existing clock
stripe test_helpers test_clocks advance <clock_id> --frozen-time <unix_ts>
```

The clock lets you confirm what actually happens at phase 2 boundaries without waiting a year.

## What "PASS" means for each scenario

For every scenario below, all three of these must hold:

1. **Stripe state** matches what the table says. Verify via Dashboard → Customer → Subscription, and click into the schedule object.
2. **Our DB** matches what the table says (`User.plan`, `User.planStatus`, `User.currentPeriodEnd`).
3. **Our UI** at `/settings` reflects the state without manual reload weirdness.

If any one of them drifts, fail the scenario and capture the divergence in a note. Do not "patch around" in the UI; treat the route handlers as the source of truth.

## Scenarios

### S1. Pure annual → monthly switch (same tier)

**Setup:** subscribe a test user to **Plus annual** via `/api/stripe/checkout?plan=home_plus&period=annual`.

**Action:** in the billing UI, switch to monthly while keeping Plus.

**Expected Stripe state:**
- Subscription still has `items[0].price.id = STRIPE_PRICE_HOME_PLUS_ANNUAL`.
- `subscription.schedule` is set; the schedule has two phases:
  - Phase 1: `items[0].price = home_plus_annual`, `end_date = subscription.items[0].current_period_end`.
  - Phase 2: `items[0].price = home_plus_monthly`, `duration.interval = "month"`, `duration.interval_count = 1`.
- `end_behavior = "release"`.

**Expected DB:** `plan = "home_plus"`, `planStatus = "active"`, `currentPeriodEnd` unchanged.

**Expected UI:** pending-switch banner appears on `/settings` with the renewal date.

### S2. Tier change + annual → monthly (combined)

**Setup:** subscribe to **Plus annual**.

**Action:** switch to **Basic monthly** in one go from the billing UI.

**Expected Stripe state:**
- Subscription price flips immediately to `home_basic_annual`. A proration invoice is created and shown as a customer balance credit (negative).
- A schedule is attached with phase 1 = Basic annual until renewal, phase 2 = Basic monthly.

**Expected DB:** `plan = "home_basic"` immediately; `currentPeriodEnd` unchanged.

**Expected UI:** plan label flips to Home Basic. Pending banner reads "Switching to Home Basic (Monthly) on …".

### S3. Cancel a pending switch via `/cancel-pending`

**Setup:** from S1 or S2 above, have an active schedule.

**Action:** click **Cancel pending switch** on the billing screen (calls `/api/stripe/cancel-pending`).

**Expected Stripe state:**
- `subscription.schedule = null`.
- Schedule object's `status = "released"`.
- Subscription continues unchanged from before the pending switch was scheduled.

**Expected DB:** unchanged.

**Expected UI:** pending banner disappears.

### S4. Cancel subscription while a schedule is pending

**Setup:** Plus annual with a pending → Plus monthly schedule (S1 state).

**Action:** click **Cancel subscription** in the billing UI.

**Expected Stripe state:**
- Schedule released (`status = released`, `subscription.schedule = null`).
- Subscription has `cancel_at_period_end = true`.

**Expected DB:** `planStatus` stays `"active"` until period actually ends; webhook flips it to `"canceled"` only after `cancel_at_period_end` fires.

**Advance the clock** past `current_period_end` and verify:
- Subscription transitions to `canceled`.
- Webhook updates `User.planStatus = "canceled"`.
- No phase 2 invoice was ever created.

### S5. Change tier while a pending switch exists (immediate path)

**Setup:** Plus annual with pending → Plus monthly schedule.

**Action:** switch to **Pro annual** (a tier change that keeps the cadence and is therefore immediate).

**Expected Stripe state:**
- Old schedule released (`status = released`).
- Subscription price = `pro_annual`.
- Proration charge appears on the customer.
- `subscription.schedule = null`.

**Expected DB:** `plan = "professional"`, `planStatus = "active"`.

**Critical:** *Advance the clock past `current_period_end` and verify the subscription continues on Pro annual.* If the old schedule had not been released, phase 2 would have fired and the subscription would have flipped to Plus monthly — that is the bug we are guarding against.

### S6. Repeated pending switch (idempotency / replace)

**Setup:** Plus annual with pending → Plus monthly schedule.

**Action:** send the same `/api/stripe/change-plan` request again with `{plan: "home_plus", period: "monthly"}`.

**Expected Stripe state:**
- Old schedule released.
- New schedule created with identical shape.
- Subscription has exactly one schedule attached.

**Verify:** in the Dashboard, the customer's "Subscription schedules" list shows one active schedule and one released schedule. Not two active.

### S7. Tier-only change (no cadence change)

**Setup:** Plus **monthly**.

**Action:** switch to Basic monthly.

**Expected Stripe state:**
- Immediate price change to `home_basic_monthly`.
- Proration credit on customer balance.
- No schedule created (`subscription.schedule = null`).

**Expected DB:** `plan = "home_basic"`, `planStatus = "active"`.

### S8. Cadence change in the safe direction (monthly → annual)

**Setup:** Plus monthly.

**Action:** switch to Plus annual.

**Expected Stripe state:**
- Immediate price change. Annual amount is charged today, less a credit for unused days of the current month (visible as a balance line on the next invoice).
- No schedule.

**Expected DB:** `plan = "home_plus"`, `planStatus = "active"`. `currentPeriodEnd` now ~12 months out.

### S9. Downgrade past yard limit with pending switch

**Setup:** Plus annual with 2 yards, plus a pending → Plus monthly schedule.

**Action:** initiate downgrade to Basic monthly. Pick the yard to keep.

**Expected:**
- Yard archive picker enforces the rule (you cannot proceed without archiving 1 yard).
- After confirmation: tier change is immediate (Basic annual), the unchosen yard is archived, pending schedule is replaced with a fresh phase-2 = Basic monthly schedule.

### S10. Webhook reconciliation after Stripe-side direct edit

**Setup:** any active subscription with a schedule.

**Action:** in the Stripe Dashboard, manually release the schedule.

**Expected:**
- Webhook fires `subscription_schedule.released` and `customer.subscription.updated`.
- Our DB does not change (the subscription itself didn't change).
- `/settings` no longer shows a pending banner on next page load.

## After-the-fact verification commands

These are useful sanity checks when a scenario behaves oddly:

```bash
# List all schedules attached to a customer
stripe subscription_schedules list --customer cus_test_XXXX --limit 5

# Inspect a specific schedule
stripe subscription_schedules retrieve sub_sched_XXXX

# See the proration line items on the upcoming invoice
stripe invoices upcoming --customer cus_test_XXXX

# Force-fire the renewal in a test clock
stripe test_helpers test_clocks advance <clock_id> --frozen-time <unix_ts past period_end>
```

## Failure log template

When a scenario fails, capture:

- Scenario number and title
- Exact API request made (curl or app action)
- Stripe Dashboard state at failure (subscription status, schedule status, attached schedule ID)
- Our DB state at failure (`plan`, `planStatus`, `currentPeriodEnd`)
- Webhook events delivered between action and observation
- Reproduction steps if non-deterministic

Keep these notes in a follow-up issue or commit message; don't paper over the divergence with manual DB edits.
