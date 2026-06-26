# Billing manual test plan

Authoritative manual test plan for the entire billing model: trial, checkout, every upgrade/downgrade/cadence change, cancellation, failed payments, the four "billing unwell" Stripe statuses, the at-renewal yard limit modal, and the analysis quota reset on trial-to-paid.

This doc is paired with `docs/billing-behavior-reference.md` (the product contract — what *should* happen) and `docs/billing-handoff-2026-06-24.md` (current state of the work). This doc is the *how to verify*; the contract doc is the *what to verify*.

**Audience.** Anyone who needs to validate billing end-to-end against live Stripe test mode, including someone who has never used Stripe before. Sections 1–3 cover Stripe basics; the rest of the doc assumes you've worked through them.

---

## 1. Stripe primer (skip if you've used Stripe before)

### What Stripe gives you

- **Customer.** A `cus_…` record. One per user in our app.
- **Subscription.** A `sub_…` record. Has a `status` (active / trialing / past_due / canceled / etc.), an `items[]` array (we always have exactly one item), and an attached `schedule` if a future change is pending.
- **Subscription schedule.** A `sub_sched_…` record describing one or more *phases*. We use this for deferred changes (annual → monthly at renewal, annual tier downgrades at renewal). Phase 1 is "what runs today through renewal," phase 2 is "what kicks in at renewal." `end_behavior = "release"` means once phase 2 starts, the schedule detaches and the subscription continues on its own.
- **Invoice.** Generated automatically when a subscription renews or a proration is taken. Has a `status` of `paid`, `open`, or `void`.
- **Webhook event.** Stripe POSTs JSON to our server when anything changes. We care about `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, and `checkout.session.completed`.

### Test mode

Everything in this doc runs in **Stripe test mode**. The toggle is in the top-right of the Dashboard. Test mode customers and subscriptions are isolated from live mode. Test API keys start `sk_test_…` and `pk_test_…`.

### Test cards (memorize these three)

| Number | Behavior | Used for |
|---|---|---|
| `4242 4242 4242 4242` | Succeeds | Default happy path |
| `4000 0025 0000 3155` | Requires SCA authentication; first charge succeeds only after you click "Complete authentication" | Putting a subscription into Stripe `incomplete` status |
| `4000 0000 0000 0341` | First charge succeeds, every renewal fails | Triggering `past_due` via `invoice.payment_failed` |

Any future expiry, any CVC, any ZIP all work. Stripe's full list: https://docs.stripe.com/testing#cards

### Test clocks

The most important Stripe-test-mode concept. A test clock is a fake clock you attach to a customer; advancing it makes Stripe behave as if time has passed (renewals fire, dunning starts, trials end). Without a test clock you'd have to wait a year to verify an annual renewal.

Workflow:

```bash
# 1. Create a clock at "now"
stripe test_helpers test_clocks create --frozen-time $(date +%s)
# Returns clock_<id>

# 2. Create a customer attached to that clock
stripe customers create --test-clock clock_<id> --email test+annual@example.com

# 3. Use that customer in checkout (set their cus_id on the User in our DB,
#    or sign in as a new user and let the checkout route create them — but
#    then you'd need to migrate the customer to the clock, which is fiddly.
#    Easier: create the User manually in the DB with the pre-clocked
#    stripeCustomerId set, then go through checkout.)

# 4. Advance the clock to test a future event
stripe test_helpers test_clocks advance clock_<id> --frozen-time $(date -v+13M +%s)
# (-v+13M = 13 months from now on macOS date; use date -d on Linux)
```

Advancing past a `current_period_end` makes Stripe fire renewal events. Advancing past 23 hours after an `incomplete` subscription makes it transition to `incomplete_expired`. Advancing past Stripe's dunning window (~3 weeks) after a `payment_failed` cascades the subscription into `unpaid` or `canceled`.

### Stripe CLI essentials

```bash
# Install (macOS)
brew install stripe/stripe-cli/stripe

# Log in (one-time)
stripe login

# Forward webhooks to your local dev server (leave running while testing)
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the printed "Webhook signing secret" (whsec_…) into STRIPE_WEBHOOK_SECRET

# Trigger a fake event manually (good for cases we can't easily reach naturally)
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.updated

# Inspect any object
stripe customers retrieve cus_…
stripe subscriptions retrieve sub_…
stripe subscription_schedules retrieve sub_sched_…
stripe invoices upcoming --customer cus_…
```

### Where to look in the Dashboard

For each scenario you'll bounce between:

- **Dashboard → Customers → [your test customer]**: see subscription status, attached schedule, payment method, balance credits.
- **Dashboard → Customers → [customer] → Subscription**: click into it to see `current_period_end`, item price, cancel-at-period-end flag, and schedule reference.
- **Dashboard → Developers → Events**: shows every webhook event Stripe sent in chronological order. Click into an event to see the full JSON.
- **Dashboard → Developers → Webhooks**: shows delivery attempts to your endpoint (useful when the `stripe listen` terminal is closed).

---

## 2. From zero to ready (one-time Stripe setup)

If you've never used Stripe before, work through this section once. Every step has a "How to verify it worked" check — don't skip ahead until each one's green, because the next step assumes the previous one succeeded.

Expect to spend ~30 minutes the first time.

### 2.1 Create or sign in to a Stripe account

1. Go to https://dashboard.stripe.com/register (or sign in if you already have an account).
2. You'll get prompted to provide business details for live mode. **Skip this for now** — click "Skip for now" or the equivalent. Test mode works without business activation.

**Verify:** You land on the Dashboard home page. There's a sidebar on the left with Home, Payments, Customers, Product catalog, etc.

### 2.2 Switch to test mode

In the top-right of the Dashboard there's a toggle showing "Test mode" (orange) or live mode (no badge). Click it to switch to **Test mode**. Everything in this doc runs in test mode.

**Verify:** The top of the Dashboard shows an orange "TEST MODE" indicator. Without it, you'll burn real money or worse get blocked because business activation isn't complete.

### 2.3 Get your test mode API keys

1. Sidebar → **Developers** → **API keys**.
2. You'll see a **Publishable key** (`pk_test_…`) and a **Secret key** (`sk_test_…` — click "Reveal" to see the full value).
3. Copy both. The secret key will go into `.env.local`. We don't use the publishable key in this app today, but copy it anyway — it's needed if we ever add a client-side Stripe component.

**Verify:** Both keys start with `pk_test_` and `sk_test_`. If they start with `pk_live_` / `sk_live_`, you're in the wrong mode — go back to §2.2.

### 2.4 Install the Stripe CLI and log in

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Verify install
stripe --version
# stripe version 1.xx.x

# Authenticate the CLI to your account (opens a browser window for approval)
stripe login
```

**Verify:** `stripe config --list` shows a `device_name` and `display_name`. `stripe customers list --limit 1` runs without an "unauthorized" error.

### 2.5 Create the six Products and Prices

The app expects six prices (Basic / Plus / Pro × monthly / annual). Two ways to do this:

#### Option A — CLI (recommended; ~2 minutes)

Paste this block into a terminal. It creates all 6 products and prices and prints the price IDs at the end, ready to paste into `.env.local`. Amounts are in cents.

```bash
# Home Basic — $5.99/mo, $59.99/yr
HB_PROD=$(stripe products create --name "Home Basic" -q | jq -r .id)
HB_MON=$(stripe prices create --product "$HB_PROD" --unit-amount 599 --currency usd -d "recurring[interval]=month" -q | jq -r .id)
HB_YR=$(stripe prices create --product "$HB_PROD" --unit-amount 5999 --currency usd -d "recurring[interval]=year" -q | jq -r .id)

# Home Plus — $9.99/mo, $99.99/yr
HP_PROD=$(stripe products create --name "Home Plus" -q | jq -r .id)
HP_MON=$(stripe prices create --product "$HP_PROD" --unit-amount 999 --currency usd -d "recurring[interval]=month" -q | jq -r .id)
HP_YR=$(stripe prices create --product "$HP_PROD" --unit-amount 9999 --currency usd -d "recurring[interval]=year" -q | jq -r .id)

# Professional — $24.99/mo, $249.99/yr
PRO_PROD=$(stripe products create --name "Professional" -q | jq -r .id)
PRO_MON=$(stripe prices create --product "$PRO_PROD" --unit-amount 2499 --currency usd -d "recurring[interval]=month" -q | jq -r .id)
PRO_YR=$(stripe prices create --product "$PRO_PROD" --unit-amount 24999 --currency usd -d "recurring[interval]=year" -q | jq -r .id)

echo ""
echo "Paste these into .env.local:"
echo "STRIPE_PRICE_HOME_BASIC_MONTHLY=$HB_MON"
echo "STRIPE_PRICE_HOME_BASIC_ANNUAL=$HB_YR"
echo "STRIPE_PRICE_HOME_PLUS_MONTHLY=$HP_MON"
echo "STRIPE_PRICE_HOME_PLUS_ANNUAL=$HP_YR"
echo "STRIPE_PRICE_PRO_MONTHLY=$PRO_MON"
echo "STRIPE_PRICE_PRO_ANNUAL=$PRO_YR"
```

Requires `jq` (`brew install jq` if you don't have it). If you'd rather not install jq, drop the `| jq -r .id` and grep the `id` field out of each JSON response yourself.

**Verify:** the script prints six `STRIPE_PRICE_*` lines with values starting `price_`. Browse to **Dashboard → Product catalog** and confirm three products are listed: Home Basic, Home Plus, Professional, each with two prices (monthly and yearly).

#### Option B — Dashboard (clickier; ~10 minutes)

For each plan (Home Basic, Home Plus, Professional):

1. Sidebar → **Product catalog** → **+ Add product**.
2. Name: "Home Basic" (etc.). Description optional.
3. Under **Pricing**, set:
   - **Pricing model:** Standard pricing
   - **Price:** the monthly amount ($5.99 for Basic, $9.99 for Plus, $24.99 for Pro)
   - **Billing period:** Monthly
4. Click **Add another price** in the same product to add the annual price.
   - **Price:** the annual amount ($59.99 / $99.99 / $249.99)
   - **Billing period:** Yearly
5. Save the product.
6. Click into the product, then into each price, and copy the `price_…` ID from the URL or the metadata panel.

**Verify:** You have six `price_…` IDs in your clipboard / notes, two per plan.

### 2.6 Configure environment variables

Open `.env.local` (create it in the project root if it doesn't exist) and add or update these:

```bash
# Stripe — test mode
STRIPE_SECRET_KEY=sk_test_…              # from §2.3
STRIPE_WEBHOOK_SECRET=whsec_…            # set in §2.7 below

# All six prices from §2.5
STRIPE_PRICE_HOME_BASIC_MONTHLY=price_…
STRIPE_PRICE_HOME_BASIC_ANNUAL=price_…
STRIPE_PRICE_HOME_PLUS_MONTHLY=price_…
STRIPE_PRICE_HOME_PLUS_ANNUAL=price_…
STRIPE_PRICE_PRO_MONTHLY=price_…
STRIPE_PRICE_PRO_ANNUAL=price_…

# The app uses this to build success/cancel URLs in Stripe checkout
NEXTAUTH_URL=http://localhost:3000
```

**Verify (partial — webhook secret is added in 2.7):**

```bash
grep STRIPE_ .env.local | wc -l
# Should print 7 (six prices + secret key; webhook secret comes next)
```

### 2.7 Start the webhook forwarder and capture the signing secret

In a dedicated terminal pane (leave it running):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

On the first run, this prints:

```
> Ready! Your webhook signing secret is whsec_abc123… (^C to quit)
```

Copy that `whsec_…` value and paste it into `.env.local` as `STRIPE_WEBHOOK_SECRET`. The secret is stable across `stripe listen` restarts on the same machine, so you only do this once.

**Verify:** From a separate terminal, fire a synthetic event:

```bash
stripe trigger customer.created
```

The `stripe listen` terminal should print `--> customer.created [evt_…]` followed by `<-- [200] POST http://localhost:3000/api/stripe/webhook` (assuming `npm run dev` is running). A 200 confirms the dev server received the event and the signing secret is correct. A 400 means the secret is wrong or missing.

### 2.8 Smoke test — subscribe one user end-to-end

This proves the whole chain works before you start running real scenarios.

1. Start the dev server (in a new terminal): `npm run dev`
2. Sign up at `http://localhost:3000/register` with a throwaway email (e.g. `yardanalyzer+smoke@gmail.com`). You're now on a trial.
3. In a SQL terminal, confirm the user row:

   ```sql
   SELECT plan, "planStatus", "trialEndsAt", "stripeCustomerId", "stripeSubscriptionId"
   FROM "User" WHERE email = 'yardanalyzer+smoke@gmail.com';
   ```

   Expected: `plan=trial`, `planStatus=trialing`, `trialEndsAt` ~21 days from now, both Stripe IDs `NULL`.

4. Navigate to `/pricing` in the browser. Click "Subscribe" on **Home Basic Monthly**.
5. You'll be redirected to Stripe's hosted checkout page (a Stripe URL like `checkout.stripe.com/…`). Use:
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/30`)
   - CVC: any 3 digits
   - ZIP: any 5 digits
6. Click **Subscribe**. You'll be redirected back to `/settings?billing=success`.
7. Watch the `stripe listen` terminal — you should see three events in order:
   ```
   --> checkout.session.completed
   --> customer.subscription.created
   --> invoice.payment_succeeded
   ```
   All three should return `[200]`.
8. Re-run the SQL from step 3:
   ```
   plan          = home_basic
   planStatus    = active
   trialEndsAt   = (unchanged, but harmless)
   stripeCustomerId    = cus_…
   stripeSubscriptionId = sub_…
   ```

If all of that lines up, you're fully set up.

**If something failed at this point, troubleshoot before continuing:**

| Symptom | Likely cause | Fix |
|---|---|---|
| `/pricing` returns 500 | Missing `STRIPE_PRICE_*` env var | Re-check §2.6 — restart `npm run dev` after editing `.env.local` |
| Checkout page errors with "No such price" | Price ID in `.env.local` doesn't exist in your Stripe account | You're probably using IDs from a different Stripe account; re-do §2.5 |
| Webhook prints `[400] Webhook signature verification failed` | `STRIPE_WEBHOOK_SECRET` wrong or `stripe listen` was restarted with a new secret | Re-copy the secret from `stripe listen` output into `.env.local`, restart `npm run dev` |
| Webhook prints `[200]` but DB doesn't update | The webhook is processing for a customer that doesn't match your DB user's `stripeCustomerId` (likely because you ran checkout earlier and the customer was orphaned) | Confirm `User.stripeCustomerId` matches the `customer:` field in the event JSON; if not, manually update the User row or delete and re-signup |

### 2.9 Seed an over-limit user (for the yard-limit modal scenarios)

```bash
npx tsx scripts/seed-downgrade-user.ts
```

Creates `yardanalyzer+downgrade@gmail.com` as a Home Basic user with 5 active yards (over the 1-yard cap). Sign in with that Gmail alias to immediately exercise the at-renewal yard limit modal (scenario Y1).

---

## 3. Per-session setup checklist

Once §2 is done, here's what to spin up at the start of each testing session.

### Terminals (open all four, leave running)

1. `npm run dev` (the app)
2. `stripe listen --forward-to localhost:3000/api/stripe/webhook` (webhook forwarding)
3. Database tail — e.g. `psql $DATABASE_URL` or whatever you use for ad-hoc queries. You'll be running the SQL below after almost every action.
4. Browser DevTools console open on the app, plus a separate browser tab on the Stripe Dashboard for the customer you're testing.

### Quick verification query (paste into a SQL terminal)

```sql
SELECT id, email, plan, "planStatus", "currentPeriodEnd", "stripeCustomerId",
       "stripeSubscriptionId", "trialEndsAt", "analysisQuotaResetAt",
       "lastPaymentFailedInvoiceId"
FROM "User" WHERE email = 'YOUR_TEST_EMAIL';
```

Run this after every action; the goal of each scenario is to confirm that what you see here matches the contract.

---

## 4. How to read this doc

Every scenario has the same shape:

- **Goal** — one sentence: what behavior we're proving.
- **Setup** — the exact starting state.
- **Action** — what you click or what command you run.
- **Expected Stripe state** — what to verify in the Stripe Dashboard.
- **Expected DB state** — what to verify with the SQL above.
- **Expected UI state** — what to verify at `/settings`, `/pricing`, and the dashboard.

A scenario **passes** only if all four of Stripe / DB / UI / webhook log match. If any one drifts, that's a fail. Do not paper over divergences by manually editing the DB or refreshing your way out — the route handlers are the source of truth.

### Contract reference

Each scenario cites the contract item it pins, e.g. *(contract change-plan #6)*. Numbers correspond to the "Behavior contract" section of `docs/billing-behavior-reference.md`.

---

## 5. Trial lifecycle

### T1. New user signup creates a 21-day trial

**Goal.** A brand-new account starts on `trial` with no card required.

**Setup.** Sign up at `/register` with a fresh email.

**Action.** Complete signup.

**Expected DB:** `plan = "trial"`, `planStatus = "trialing"`, `trialEndsAt = signup + 21 days` (give or take a few seconds), `stripeCustomerId = null`, `stripeSubscriptionId = null`.

**Expected UI:** Dashboard shows the amber trial banner with "21 days remaining." Pricing page shows all three paid plans as eligible.

### T2. Engagement bonus extends trial by 7 days, once

**Goal.** Prove the one-time +7-day extension fires when the user sets a schedule AND completes a task.

**Setup.** T1, signed in.

**Action.**
1. Create a yard, set its watering days to any value.
2. Complete any pending task in that yard's section.
3. Refresh `/dashboard`.

**Expected DB:** `trialEngagementBonusGrantedAt` is now set (was null), `trialEndsAt` has advanced by 7 days.

**Expected UI:** Trial banner now shows 28 days remaining (or however many).

**Negative check.** Complete a second task and unset/reset the schedule. `trialEngagementBonusGrantedAt` should NOT change again, and `trialEndsAt` should NOT advance further. The bonus is one-time per account.

### T3. Trial expiry without subscribing

**Goal.** When `trialEndsAt` passes with no paid subscription, the user goes read-only and the deletion clock starts.

**Setup.** Manually set the test user's `trialEndsAt` to 1 minute ago via SQL.

**Action.** Reload `/dashboard`.

**Expected behavior:**
- The analyze button is disabled or rejects with "Upgrade your plan…"
- Yards beyond 1 are inaccessible if the user had more (shouldn't be possible on trial; safety check only).
- `/api/yards` returns the user's data but the UI no longer lets them act on it.

**Expected DB:** `planStatus` is still `"trialing"` (Stripe doesn't change it); `isEffectivelyExpired()` is what gates access.

**Expected UI:** "Days until deletion" counter visible somewhere (currently surfaced via `getDaysUntilDeletion`). 30-day deletion clock running from `trialEndsAt`.

### T4. Trial → paid resets the analysis-quota cutoff

**Goal.** Prove that converting from trial to paid mid-month doesn't dock the user for their trial usage. *(Contract: webhook #1, analyze cutoff #2)*

**Setup.**
1. Sign up fresh (T1).
2. Run 2 analyses (the trial cap). Now you should be blocked.
3. Confirm in SQL that `analysisQuotaResetAt IS NULL`.

**Action.** Go to `/pricing`, click "Subscribe" on Home Basic monthly, complete checkout with `4242 4242 4242 4242`. Wait for the checkout success redirect and confirm the webhook hit.

**Expected DB:**
- `plan = "home_basic"`, `planStatus = "active"`
- `stripeCustomerId` and `stripeSubscriptionId` populated
- `analysisQuotaResetAt` is now within the last few seconds (this is the critical field)
- `currentPeriodEnd` ~1 month from now

**Expected behavior:** Open a yard, run analyses. You should get a fresh **4 per month** budget (Basic), NOT zero — the 2 trial runs were counted against the trial month, and the cutoff now uses `analysisQuotaResetAt` instead of start-of-month.

**Expected UI:** Trial banner is gone. Settings shows "Home Basic" with the next renewal date.

---

## 6. Initial subscription

### S0. Checkout for each plan/period combination

**Goal.** Prove all six plan × period combinations check out cleanly.

For each row below, sign up a fresh trial user, go to `/pricing`, click the plan/period button, complete checkout with `4242 4242 4242 4242`, and verify DB + Stripe.

| Plan | Period | Expected `User.plan` | Expected price item |
|---|---|---|---|
| Home Basic | Monthly | `home_basic` | `STRIPE_PRICE_HOME_BASIC_MONTHLY` |
| Home Basic | Annual | `home_basic` | `STRIPE_PRICE_HOME_BASIC_ANNUAL` |
| Home Plus | Monthly | `home_plus` | `STRIPE_PRICE_HOME_PLUS_MONTHLY` |
| Home Plus | Annual | `home_plus` | `STRIPE_PRICE_HOME_PLUS_ANNUAL` |
| Professional | Monthly | `professional` | `STRIPE_PRICE_PRO_MONTHLY` |
| Professional | Annual | `professional` | `STRIPE_PRICE_PRO_ANNUAL` |

**Expected webhook sequence in `stripe listen` terminal for each:**
1. `checkout.session.completed`
2. `customer.subscription.created`
3. `invoice.payment_succeeded`

Last one fires `updateUserFromSubscription` again, but the idempotency guard skips the redundant DB write.

---

## 7. Tier upgrades (same cadence)

Run each row from a fresh subscription of the "from" plan/period.

### U1. Monthly tier upgrade *(contract change-plan #1)*

| From | To | Setup | Action |
|---|---|---|---|
| Home Basic monthly | Home Plus monthly | Subscribe via S0 | Settings → change plan → Home Plus → Monthly → Confirm |

**Expected Stripe state:** Subscription item price flips to `home_plus_monthly` immediately. An invoice appears under the customer with a *positive* line item (prorated diff for the rest of the month). No schedule attached.

**Expected DB:** `plan = "home_plus"`, `planStatus = "active"`, `currentPeriodEnd` unchanged.

**Expected UI:** Settings shows Home Plus.

Repeat for the matrix:

| From | To |
|---|---|
| Home Basic monthly | Pro monthly |
| Home Plus monthly | Pro monthly |

### U2. Annual tier upgrade *(contract change-plan #5)*

| From | To | Behavior |
|---|---|---|
| Home Basic annual | Home Plus annual | Immediate. Prorated diff charged today. No schedule. |
| Home Basic annual | Pro annual | Immediate. Prorated diff. No schedule. |
| Home Plus annual | Pro annual | Immediate. Prorated diff. No schedule. |

For each: subscribe (S0), change plan to the new annual tier, confirm. Verify Stripe price flip, positive proration invoice, no schedule, DB updated.

**Trap to watch for:** if any of these create a `subscription_schedule`, the route logic is wrong. Annual upgrades are immediate.

### U3. Upgrade restores most-recently-archived yards

**Goal.** When the new plan's yard cap is higher than the current count of active yards, recently archived yards come back automatically.

**Setup.**
1. Pro monthly with 10 yards.
2. Downgrade to Home Basic monthly, archive 9 yards (picker). You now have 1 active, 9 archived.
3. Stay on Home Basic monthly.

**Action.** Upgrade Home Basic monthly → Home Plus monthly (cap goes 1 → 2).

**Expected DB:** The most recently archived yard (by `archivedAt DESC`) has `archivedAt = null` again. Count of active yards is now 2.

**Expected UI:** The restored yard appears on the dashboard without you having to do anything.

---

## 8. Tier downgrades

### D1. Monthly downgrade — no yard issue *(contract change-plan #2)*

**Setup.** Pro monthly with 1 yard.

**Action.** Settings → change plan → Home Basic → Monthly → Confirm.

**Expected Stripe state:** Price flips to `home_basic_monthly`. A *negative* line item (proration credit) appears on the customer balance. No schedule.

**Expected DB:** `plan = "home_basic"`, `planStatus = "active"`, `currentPeriodEnd` unchanged.

### D2. Monthly downgrade — over yard limit, picker required

**Setup.** Pro monthly with 3 active yards.

**Action.** Settings → change plan → Home Basic monthly → Confirm.

**Expected behavior:**
1. UI prompts you to pick 1 yard to keep before submitting.
2. If you submit without picking the right count, the API returns `400 archive_count_mismatch` and the UI re-prompts.
3. On valid submission, Stripe flips price AND in the same transaction the unchosen yards have `archivedAt` set.

**Expected DB:** `plan = "home_basic"`, exactly 1 yard with `archivedAt = null`, the rest with `archivedAt` set.

**Expected UI:** Dashboard now shows only the kept yard. The over-limit modal does NOT appear (because we archived in the same transaction).

### D3. Annual same-cadence downgrade — fully deferred *(contract change-plan #6)*

**Goal.** Annual subscribers finish their year at the prepaid tier. The downgrade waits for renewal.

**Setup.** Pro annual on a test clock at "now."

**Action.** Settings → change plan → Home Plus → Annual → Confirm.

**Expected Stripe state today:**
- Subscription price is still `pro_annual` (unchanged).
- A schedule is attached:
  - Phase 1: `pro_annual`, ending at `current_period_end`
  - Phase 2: `home_plus_annual`, duration `{ interval: "year", interval_count: 1 }`
- `end_behavior = "release"`
- No proration invoice today.

**Expected DB today:** `plan = "professional"` (unchanged), no DB write.

**Expected UI:** Pending-switch banner appears: "Switching to Home Plus (Annual) on [renewal date]."

**Yard-archive trap:** the API must NOT require `archiveYardIds` for this submit, even if the user is over the new plan's limit. The pick happens at renewal via the modal, not at submit time.

**Advance the test clock past `current_period_end`:**

```bash
stripe test_helpers test_clocks advance clock_<id> --frozen-time $(date -v+13M +%s)
```

**Expected after clock advance:**
- Stripe fires `customer.subscription.updated` (price now `home_plus_annual`) and `invoice.payment_succeeded`.
- DB updates: `plan = "home_plus"`, `currentPeriodEnd` ~1 year out.
- Schedule object is now `status = "released"`.
- If the user was over the Plus 2-yard limit, the next time they open `/dashboard` the at-renewal yard limit modal blocks them and forces a pick or upgrade.

Repeat for: Pro annual → Basic annual, Plus annual → Basic annual.

### D4. Combined annual + tier downgrade + monthly *(contract change-plan #8)*

**Goal.** Plus annual → Basic monthly is fully deferred (no charge, no DB change today).

**Setup.** Plus annual on a test clock.

**Action.** Settings → change plan → Home Basic → Monthly → Confirm.

**Expected Stripe state today:**
- Subscription unchanged (still `home_plus_annual`).
- Schedule attached:
  - Phase 1: `home_plus_annual` through renewal
  - Phase 2: `home_basic_monthly`, duration `{ interval: "month", interval_count: 1 }`
- No proration invoice today.

**Expected DB today:** `plan = "home_plus"` unchanged.

**Expected UI:** Pending-switch banner: "Switching to Home Basic (Monthly) on [renewal date]."

**Advance the clock past `current_period_end`.** Subscription becomes `home_basic_monthly`. DB updates to `plan = "home_basic"`. Monthly billing now runs from renewal date. If over yard limit, modal gates the dashboard.

---

## 9. Cadence-only changes (same tier)

### C1. Monthly → annual same tier *(contract change-plan #3)*

**Setup.** Home Basic monthly.

**Action.** Change to Home Basic annual.

**Expected Stripe state:** Price flips to `home_basic_annual` immediately. Annual amount is charged today, less a credit for unused days of the current month. `currentPeriodEnd` is now ~12 months out. No schedule.

**Expected DB:** `plan = "home_basic"` (unchanged), `currentPeriodEnd` ~12 months out.

Repeat for Home Plus and Professional.

### C2. Annual → monthly same tier *(contract change-plan #4)*

**Setup.** Home Plus annual on a test clock.

**Action.** Change to Home Plus monthly.

**Expected Stripe state today:**
- Subscription price unchanged.
- Schedule attached, phase 1 = `home_plus_annual` through renewal, phase 2 = `home_plus_monthly`.
- No proration today.

**Expected DB today:** unchanged.

**Expected UI:** Pending-switch banner with renewal date.

**Advance clock past renewal.** Webhook fires, DB now shows monthly cadence (price flipped to `home_plus_monthly`, new `currentPeriodEnd` ~1 month out).

---

## 10. Combined: annual + tier upgrade + target monthly

This is the *only* combined-change path that does something immediate. The user moves both tier and cadence; the tier upgrade happens today on annual, and the cadence flip waits for renewal. *(Contract change-plan #7)*

### CU1. Basic annual → Plus monthly

**Setup.** Home Basic annual on a test clock.

**Action.** Change to Home Plus monthly.

**Expected Stripe state today:**
- Subscription price flips immediately to `home_plus_annual` (the *higher tier at the existing cadence*).
- A proration invoice is created for the diff (`home_plus_annual − home_basic_annual`, scaled to remaining days).
- A schedule is attached: phase 1 = `home_plus_annual` through renewal, phase 2 = `home_plus_monthly`.

**Expected DB today:** `plan = "home_plus"`, `currentPeriodEnd` unchanged. Plus features unlocked immediately.

**Expected UI:** Plan label now shows Home Plus. Pending banner: "Switching to Home Plus (Monthly) on [renewal date]."

**Advance clock past renewal.** Phase 2 fires, subscription becomes `home_plus_monthly`, DB updates `currentPeriodEnd`.

Repeat for Basic annual → Pro monthly, Plus annual → Pro monthly.

### CU2. There is no "downgrade and switch to monthly today" path

**Goal.** Prove that a combined annual + tier downgrade + monthly is fully deferred (see D4) — there is no shortcut.

This is just a re-statement of D4 — the only way to land on Basic monthly today from Plus annual is to first upgrade or to cancel and rebuy. No UI path should offer "downgrade now to Basic monthly."

---

## 11. Pending schedule edge cases

### P1. Replace a pending schedule with another change *(contract change-plan #9, schedule release)*

**Goal.** When a user already has a pending switch and submits a new change, the old schedule must be released before the new state is applied. If it isn't, the orphan schedule fires later and corrupts the subscription.

**Setup.** Plus annual with a pending → Plus monthly schedule (from C2).

**Action.** Change to Pro annual (an immediate annual tier upgrade).

**Expected Stripe state:**
- Old schedule's status flips to `released`.
- Subscription price is now `pro_annual`.
- `subscription.schedule = null`.
- Proration charged for the upgrade.

**Critical test.** Advance the clock past `current_period_end`. The subscription must continue on Pro annual. If you see it flip to `home_plus_monthly` at renewal, the old schedule wasn't released — that's the orphan-schedule bug we fixed.

### P2. Cancel a pending switch via `/cancel-pending` *(contract cancel-pending #1)*

**Setup.** Plus annual with a pending → Plus monthly schedule.

**Action.** Settings → "Cancel pending switch."

**Expected Stripe state:** schedule is released, `subscription.schedule = null`, subscription itself unchanged.

**Expected DB:** unchanged.

**Expected UI:** Pending banner disappears.

### P3. Repeated identical submit (idempotency)

**Setup.** Plus annual with a pending → Plus monthly schedule.

**Action.** Submit the same change to Plus monthly again.

**Expected Stripe state:** old schedule released, new schedule created with identical phases. Exactly one active schedule at the end.

**Verify:** Customer page in Dashboard → "Subscription schedules" section shows one active + one released. Not two active.

---

## 12. Cancellation

### CA1. Pure cancel (no pending schedule) *(contract cancel #1)*

**Setup.** Any active subscription with no pending schedule.

**Action.** Settings → Cancel subscription.

**Expected Stripe state:** `cancel_at_period_end = true`, status still `active` until period end.

**Expected DB:** unchanged immediately. `planStatus` stays `"active"` — the user keeps access through the prepaid period.

**Expected UI:** Banner: "Subscription will end on [renewal date]."

**Advance clock past `current_period_end`.** Subscription transitions to `canceled`. Webhook flips DB `planStatus = "canceled"`. 30-day deletion clock starts from `currentPeriodEnd`.

### CA2. Cancel with a pending schedule *(contract cancel #2)*

**Setup.** Plus annual with a pending → Plus monthly schedule.

**Action.** Settings → Cancel subscription.

**Expected Stripe state:**
- Schedule released (`status = released`, `subscription.schedule = null`).
- Subscription has `cancel_at_period_end = true`.

**Expected DB:** `planStatus` stays `"active"`.

**Advance clock past `current_period_end`.** Subscription becomes `canceled`. Phase 2 of the released schedule never fires. No phantom monthly invoice.

### CA3. Cancel a canceled subscription is rejected *(contract cancel #3, #4)*

**Setup.** Subscription already in `canceled` state in Stripe (CA1 after the clock advance).

**Action.** Hit Settings → Cancel again (UI normally hides the button; force the request via DevTools).

**Expected response:** `400`. No Stripe write.

Also verify: if `cancel_at_period_end` is already `true`, a second cancel request also returns 400.

**Note:** the cancel route reads *live Stripe state*, not cached `User.planStatus`. So if the DB is lagging behind a webhook, the route still rejects correctly.

---

## 13. Failed payments and the "billing unwell" Stripe statuses

This is where the recent work landed. Four distinct Stripe states collapse to one user-facing `past_due` in our DB. *(Contract webhook #5–6, "What past_due actually means now")*

### F1. Renewal payment fails → `past_due`

**Goal.** A real renewal failure flips `planStatus = "past_due"`, gates app access, sends a payment-failed email, and a portal banner appears.

**Setup.**
1. Sign up, subscribe to Home Basic monthly using card `4000 0000 0000 0341` (succeeds first charge, fails on renewal). Use a test clock for the customer.
2. Confirm `planStatus = "active"`.

**Action.** Advance the clock past `current_period_end`.

**Expected webhook sequence:**
- `invoice.payment_failed` fires.
- `customer.subscription.updated` (status `past_due`) fires.

**Expected DB:**
- `planStatus = "past_due"`
- `lastPaymentFailedInvoiceId` is set to the failing invoice's ID (idempotency guard)
- `plan` unchanged

**Expected UI:**
- Dashboard renders the red "Your billing needs attention. Paid features are paused…" banner with an "Open billing portal" link.
- Tasks visible drops to 1 (the past_due `maxVisibleTasks` value).
- Analyze attempts return 403 with "Upgrade your plan to start analyzing your lawn."
- Trial banner does not appear.

**Expected email:** the payment-failed email lands in the test user's inbox (or in the Resend dashboard if you're using a test-mode Resend key).

**Idempotency check.** Re-trigger the same invoice failure (use `stripe trigger invoice.payment_failed` or advance to the next retry). DB `planStatus` stays `past_due` (no re-write), `lastPaymentFailedInvoiceId` stays the same when the same invoice retries, no duplicate email.

### F2. Recovery — card updated, retry succeeds → back to `active`

**Setup.** F1's past_due user.

**Action.**
1. Click "Open billing portal" in the banner; Stripe portal opens in the `payment_method_update` flow.
2. Replace the card with `4242 4242 4242 4242`.
3. Trigger a retry: in the Dashboard go to the failed invoice and click "Charge customer" (or wait for Stripe's next automatic retry).

**Expected webhook sequence:**
- `invoice.payment_succeeded`
- `customer.subscription.updated` (status `active`)

**Expected DB:** `planStatus = "active"`, `lastPaymentFailedInvoiceId` may stay populated (old value; harmless).

**Expected UI:** Red past_due banner disappears immediately on next page load. Full app access returns. Analysis quota uses calendar-month cutoff (no automatic reset; the resets are only on trial → paid).

### F3. Stripe `incomplete` status (initial SCA didn't complete) → `past_due`

**Goal.** Subscribing with an SCA-required card and *not completing* authentication leaves the subscription in `incomplete`. Our webhook maps it to `past_due` silently (no warn log — it's an explicit case).

**Setup.** Sign up fresh, go to checkout with card `4000 0025 0000 3155`. When the SCA modal pops up, **close it** instead of completing authentication.

**Expected Stripe state:** Subscription created with `status = "incomplete"`. Stripe keeps the SCA window open for ~23 hours.

**Expected webhook:** `customer.subscription.created` followed by `customer.subscription.updated` with `status: "incomplete"`.

**Expected DB:** `planStatus = "past_due"` (the explicit mapping). NOT `expired`. NOT a warn log.

**Expected UI:** Red banner, gated access, exactly like F1.

**Stripe listen output check:** the dev terminal should NOT show "Unrecognized Stripe subscription status" — that warn is reserved for truly-unknown statuses. If you see it on this scenario, the explicit case got removed.

### F4. Stripe `incomplete_expired` (23h SCA window passed) → `canceled`

**Goal.** When the SCA window times out, Stripe transitions the subscription to `incomplete_expired`. Our webhook maps this to `canceled` (the subscription really is dead).

**Setup.** F3 in progress. Use a test clock attached to the customer.

**Action.** Advance the clock by 24 hours.

**Expected Stripe state:** Subscription `status = "incomplete_expired"`.

**Expected webhook:** `customer.subscription.updated` with `status: "incomplete_expired"`.

**Expected DB:** `planStatus = "canceled"`. The 30-day deletion clock applies (from `currentPeriodEnd` or the cancel timestamp, depending on what Stripe set).

**Stripe listen check:** no warn log. This is an explicit case.

### F5. Stripe `unpaid` (dunning exhausted) → `past_due`

**Goal.** After Stripe gives up all retry attempts, the subscription can transition to `unpaid` (depending on the customer's dunning settings). Our webhook maps it to `past_due`.

**Easier path: trigger directly.** Manual production of `unpaid` requires multiple failed retries over weeks. Instead:

```bash
stripe trigger customer.subscription.updated --override "subscription:status=unpaid"
```

(If the `--override` flag doesn't work in your Stripe CLI version, use the Dashboard's "Send test webhook" feature with a `customer.subscription.updated` payload edited to have `status: "unpaid"`.)

**Expected DB:** `planStatus = "past_due"`. No warn log.

### F6. Stripe `paused` (admin set pause_collection) → `past_due`

**Goal.** If an admin manually pauses billing on a subscription, it lands in `paused`. We treat it the same as past_due (gated access).

**Setup.** Any active subscription.

**Action.** In Dashboard → Subscription → ⋯ menu → "Pause payments."

**Expected webhook:** `customer.subscription.updated` with `status: "paused"`.

**Expected DB:** `planStatus = "past_due"`. No warn log.

**Recovery:** Unpause from the Dashboard → status flips back to `active` → DB syncs.

### F7. Truly-unknown future Stripe status → past_due + WARN

**Goal.** Prove the guardrail. Any status Stripe ships that we haven't enumerated must (a) not nuke the account and (b) log loudly.

**Action.** Trigger a webhook with a fabricated status:

```bash
# Construct the JSON by hand, or use the Dashboard's "Send test webhook":
# event type: customer.subscription.updated
# edit payload to set data.object.status to "made_up_status"
```

**Expected DB:** `planStatus = "past_due"` (the safe default).

**Expected dev terminal:** WARN log: `Unrecognized Stripe subscription status; mapping to past_due { stripeStatus: "made_up_status", … }`. This warn is what tells you to add an explicit case for any future Stripe status you encounter in production.

### F8. Past_due gating: emails are suppressed

**Goal.** Past_due users don't receive task reminders or weather digests — only billing-fix emails.

**Setup.** F1's past_due user with at least one yard, schedules set, and pending tasks. Ensure their email notification toggles are on.

**Action.** Manually trigger the daily-tasks cron:

```bash
curl -X GET "localhost:3000/api/cron/daily-tasks?key=$CRON_SECRET"
```

(Or hit your dev cron route however you normally do.)

**Expected behavior:** No reminder/digest/weather email lands in the user's inbox. Card-expiry warnings (separate cron) would still send if applicable.

**Expected log:** the cron's reminderUser query no longer includes past_due users, and the per-user digest send path short-circuits with the planStatus check.

---

## 14. At-renewal yard limit modal

### Y1. Deferred annual downgrade puts user over the new cap

**Goal.** When phase 2 of a deferred annual tier downgrade fires, if the user has more active yards than the new plan supports, the dashboard layout renders the modal and gates everything until they pick or upgrade. *(Contract layout #1)*

**Setup.** Use the seed script for the cleanest setup:

```bash
npx tsx scripts/seed-downgrade-user.ts
```

This creates `yardanalyzer+downgrade@gmail.com` on Home Basic with 5 active yards (the over-limit state mimics what happens right after a Plus → Basic phase-2 fires).

**Action.** Sign in as that user. Reload `/dashboard`.

**Expected UI:**
- A modal blocks the page: "Your plan changed to Home Basic. Home Basic supports 1 yard, and you currently have 5. Pick the 1 yard you want to keep on Home Basic, or upgrade to keep all 5."
- Two actions: "Keep 1, archive 4" (primary) and "Upgrade to keep all 5" (link to `/pricing`).
- The modal cannot be dismissed.

**Action: pick.** Choose one yard, click "Keep 1, archive 4."

**Expected DB:** The picked yard stays `archivedAt = null`; the other 4 get `archivedAt = now()`. Page refreshes; modal is gone.

**Action: upgrade instead.** Reset the user (re-run the seed), and this time click "Upgrade to keep all 5." Land on `/pricing`, upgrade to Home Plus or Pro (which has cap ≥ 5).

**Expected:** After upgrade, modal is gone. No yards were archived.

### Y2. Modal does not appear when under the limit

**Setup.** Any active user whose `activeYardCount <= maxYards`.

**Expected UI:** No modal on dashboard load.

### Y3. Admin / unlimited plans never see the modal

**Setup.** Run `npx tsx scripts/grant-pro.ts <email>` (or the admin grant script) to put a user on the admin plan with `maxYards: -1`.

**Expected UI:** No modal, ever, regardless of yard count.

---

## 15. Analysis quota cutoff

### A1. No reset, mid-month: counts from start of month *(analyze cutoff #1)*

**Setup.** Home Basic user (4 analyses/month/yard cap), `analysisQuotaResetAt IS NULL`. Pick a date mid-month.

**Action.** Run 4 analyses on one yard.

**Expected:** the 5th is blocked with `analysis_limit_reached`.

### A2. Reset in current month: counts from resetAt *(analyze cutoff #2)*

**Setup.** Trial user runs 2 analyses (quota cap), gets blocked, then subscribes (T4 flow).

**Expected after subscription:** `analysisQuotaResetAt` is set; running analyses from this point counts against the *new* 4-per-month Basic quota, not against the 2 trial runs.

### A3. Reset in previous month: falls back to start-of-month *(analyze cutoff #3)*

**Setup.** A user with `analysisQuotaResetAt` set to some date in the *previous* calendar month.

**Action.** Run analyses on the 1st of the current month.

**Expected:** Cutoff defaults to start-of-month (the resetAt is stale and ignored). Full plan quota available.

---

## 16. After-the-fact verification commands

```bash
# Inspect a subscription
stripe subscriptions retrieve sub_…

# Inspect a schedule (use the ID from subscription.schedule)
stripe subscription_schedules retrieve sub_sched_…

# List all schedules on a customer
stripe subscription_schedules list --customer cus_… --limit 5

# See upcoming invoice (next renewal preview, with prorations)
stripe invoices upcoming --customer cus_…

# Recent events delivered (last 10)
stripe events list --limit 10

# Force-fire any single event for a customer (great for past_due testing)
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.updated

# Test clock control
stripe test_helpers test_clocks create --frozen-time $(date +%s)
stripe test_helpers test_clocks advance clock_… --frozen-time $(date -v+13M +%s)
stripe test_helpers test_clocks retrieve clock_…
```

---

## 17. Failure log template

When a scenario fails, capture this in your notes (or paste into the PR description / issue):

- Scenario number and title
- Exact action taken (URL clicked, API request, CLI command)
- Stripe Dashboard state at failure:
  - Subscription status
  - Subscription item price ID
  - Schedule attached? If so, schedule ID and status
  - Upcoming invoice line items
- DB state at failure (the SQL from §3):
  - `plan`, `planStatus`, `currentPeriodEnd`
  - `stripeSubscriptionId`, `lastPaymentFailedInvoiceId`, `analysisQuotaResetAt`
- Webhook events delivered between action and observation (from the `stripe listen` terminal)
- Dev server log between action and observation
- Reproduction steps if non-deterministic

Don't paper over divergence by manually editing the DB. The route handlers are the source of truth; if they're wrong, fix the route. If the contract is wrong, fix `docs/billing-behavior-reference.md` and update the test plan in the same change.

---

## Quick scenario index

| # | Scenario | Pins contract item |
|---|---|---|
| T1 | Signup creates 21-day trial | trial section |
| T2 | Engagement bonus | trial section |
| T3 | Trial expiry | trial section |
| T4 | Trial → paid resets quota | webhook #1, analyze #2 |
| S0 | Checkout each plan/period | — |
| U1 | Monthly tier upgrade | change-plan #1 |
| U2 | Annual tier upgrade | change-plan #5 |
| U3 | Auto-restore archived yards on upgrade | webhook #7 |
| D1 | Monthly downgrade, no yard issue | change-plan #2 |
| D2 | Monthly downgrade, picker required | change-plan #2 |
| D3 | Annual same-cadence downgrade (deferred) | change-plan #6 |
| D4 | Annual + tier downgrade + monthly (deferred) | change-plan #8 |
| C1 | Monthly → annual (same tier) | change-plan #3 |
| C2 | Annual → monthly (same tier) | change-plan #4 |
| CU1 | Annual + tier upgrade + monthly | change-plan #7 |
| P1 | Replace pending schedule | change-plan #9 |
| P2 | Cancel pending switch | cancel-pending #1 |
| P3 | Repeated identical submit | change-plan #9 |
| CA1 | Pure cancel | cancel #1 |
| CA2 | Cancel with pending schedule | cancel #2 |
| CA3 | Cancel a canceled subscription | cancel #3, #4 |
| F1 | Renewal payment failure → past_due | webhook #5, payment-failed |
| F2 | Card update recovery → active | webhook #1 |
| F3 | Stripe incomplete → past_due | webhook #5a |
| F4 | Stripe incomplete_expired → canceled | webhook #5d |
| F5 | Stripe unpaid → past_due | webhook #5b |
| F6 | Stripe paused → past_due | webhook #5c |
| F7 | Unknown future status → past_due + WARN | webhook #6 |
| F8 | Past_due email suppression | "What past_due means" |
| Y1 | At-renewal yard limit modal | layout #1 |
| Y2 | Modal absent when under limit | layout #2 |
| Y3 | Admin never sees modal | layout #3 |
| A1 | No-reset analysis cutoff | analyze cutoff #1 |
| A2 | Trial → paid analysis cutoff | analyze cutoff #2 |
| A3 | Stale resetAt falls back | analyze cutoff #3 |

If a row is missing here, it's because the contract doesn't pin it — feel free to add one.
