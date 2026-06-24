# Billing flow handoff — 2026-06-24

This doc captures the state of the billing work at session end so a future Claude session (or human) can pick up without re-deriving anything. Read this first, then `docs/billing-behavior-reference.md` for the actual product contract.

## TL;DR of where we are

The billing flow has been substantially rebuilt and audited in this session. The core rules are:

1. **Annual subscribers only get tier upgrades immediately.** Every other change waits for renewal.
2. **Monthly subscribers get every change immediately.**
3. **"You get what you paid for"** — annual subscribers finish their prepaid term at the prepaid tier.
4. **Yard archive happens at the moment of the downgrade**, never at submit time for deferred changes.
5. **Trial → paid resets the analysis quota** so trial usage doesn't dock the first paid month.

All five rules are documented in `docs/billing-behavior-reference.md` with row-by-row tables and a contract section. 617 tests pass; tsc clean. **The Stripe status mapping + past_due gating work that was open in the prior session is now landed — see "Stripe status mapping landed" below.**

## What landed in this session

Commits (most recent first):

- `25877d5` — Default Stripe status branch logs and maps to `past_due` (interim before explicit mapping work)
- `dfedae1` — Fix four billing-flow issues: webhook idempotency missed period-end, paused mapping, cancel route reading cached state, atomic user+yard transaction
- `dd1777c` — Solid unit coverage for billing flow against doc'd contract; +25 tests across 5 files; extracted `analysisCutoff` helper
- `b92a29d` — Hand cursor on all clickable surfaces; fix "yardsyou" missing space in `YardLimitExceededModal`
- `09ac3df` — Trial upgrade prompt: accurate copy ("more analyses, full task list, multi-yard"), normal-sized centered button
- `15dcaa3` — Reset analysis quota on trial → paid via `User.analysisQuotaResetAt` + new migration
- `773dad8` — Clarify trial capabilities on pricing card; trial is "full product, two real gates, two throttles"
- `6192c48` — Expand billing reference doc with walkthroughs, trial section, past-due section
- `dd6192c` — Simplify combined annual change: no fork, upgrade-now required
- `c8bd7d2` — Broaden "you get what you paid for" to all annual downgrades
- `0dc5391` — Remove pause feature; fix schedule cleanup and yard delete photos

Schema migrations applied:

- `20260623180000_drop_pause_columns` — dropped `pausedUntil`, `pauseStartedAt`, `pauseOriginalPeriodEnd`
- `20260624010000_analysis_quota_reset` — added `User.analysisQuotaResetAt`

Routes added/modified:

- `app/api/stripe/change-plan/route.ts` — central decision engine for tier and cadence changes
- `app/api/stripe/cancel/route.ts` — reads live Stripe state (not cached `User.planStatus`); releases pending schedule before setting `cancel_at_period_end`
- `app/api/stripe/cancel-pending/route.ts` — releases active subscription_schedule
- `app/api/stripe/webhook/route.ts` — `updateUserFromSubscription` is now `export`ed for direct unit testing; uses `db.$transaction` to make user update + yard auto-restore atomic
- `app/api/yards/archive/route.ts` — new; backs the at-renewal yard picker modal

Components:

- `components/yards/YardLimitExceededModal.tsx` — new; renders from `app/(dashboard)/layout.tsx` when active yard count exceeds the current plan's limit
- `components/settings/BillingSection.tsx` — no fork UI; direction copy updated for every cell of the contract

Pure helpers added/extracted:

- `lib/subscription.ts` — `tierRank`, `isTierUpgrade`, `isTierDowngrade`, `analysisCutoff`. The cutoff helper is now the single source of truth for "this month so far" analysis counting.

Test coverage:

- `app/api/stripe/change-plan/__tests__/route.test.ts` — 15 tests
- `app/api/stripe/cancel/__tests__/route.test.ts` — 6 tests (new file)
- `app/api/stripe/cancel-pending/__tests__/route.test.ts` — 3 tests
- `app/api/stripe/webhook/__tests__/route.test.ts` — 14 tests (new file)
- `app/api/yards/archive/__tests__/route.test.ts` — 7 tests (new file)
- `lib/__tests__/subscription.test.ts` — added 4 tests for `analysisCutoff`

Each `it()` title references the contract item it pins (e.g., "contract #1: monthly tier upgrade is immediate, no schedule"). When something fails, the test name names the rule.

## Stripe status mapping landed (this section was the open task; it's done now)

All seven steps from the original plan shipped. The notes below describe what's in the codebase now; the original step-by-step plan that follows is preserved as a record of the decisions, not a TODO.

**What changed:**

- Webhook `updateUserFromSubscription` switch now explicitly enumerates `incomplete`, `unpaid`, `paused` → `past_due` and `incomplete_expired` → `canceled`. The default branch still warns + maps to `past_due` (tested with a fabricated `"made_up_status"`).
- `lib/subscription.ts` gained a `past_due` row in `LIMITS` (no-access entitlements: `maxAnalysesPerYardPerMonth: 0`, `canRunAnalysis: false`, `maxYards: 1`, `maxVisibleTasks: 1`). `getPlanLimits` returns it when `planStatus === "past_due"`. `past_due` is deliberately NOT in `isEffectivelyExpired` — no deletion clock.
- `app/(dashboard)/layout.tsx` renders a persistent red banner for `past_due` users linking to `/api/stripe/portal?flow=payment_method_update`.
- `app/api/cron/daily-tasks/route.ts` excludes `past_due` from both the reminder-user query and the task digest send. Card-expiry warnings still go through their own cron path.
- `docs/billing-behavior-reference.md` Webhook section has explicit items #5a–d for the four "billing unwell" Stripe statuses; the default-guardrail #6 example was changed to a fabricated unknown status. New section "What `past_due` actually means now" replaces the old "past_due users currently keep full plan access" line.
- Webhook test suite (+5 tests): renamed/expanded #6 into #5a, #5b, #5c, #5d, and a new #6 guardrail using `"made_up_status"`.
- Subscription test suite (+2 tests, replaced the two stale past_due tests): now pins no-access for past_due, blocks `canRunAnalysis`, asserts `isEffectivelyExpired` is false (no deletion clock), and `getDaysUntilDeletion` is null.

**The original plan (kept for traceability):**

### Decision: collapse "billing unwell" states into `past_due` and fix the access gate

The user pointed out that from a customer's perspective, `incomplete`, `unpaid`, `paused`, and `past_due` are all the same lived experience: "my billing is broken, I can't use the app, I need to fix it." Four distinct Stripe signals, one user-facing reality. So instead of introducing a new `PlanStatus` value, **collapse all four to `past_due` and fix the existing `past_due` access gate at the same time**.

This bundles audit item #1 (past_due users get full plan access today, which is wrong) into the same change.

### The mapping

| Stripe status | Semantic meaning | App `planStatus` | Why |
|---|---|---|---|
| `incomplete` | Sub created, initial payment hasn't cleared (SCA pending). Lives up to 23h. | `past_due` | Same lived experience as a failed payment — billing is unwell, user can fix it. |
| `unpaid` | Stripe finished dunning retries and gave up. Sub still exists; user can recover by updating card. | `past_due` | Same — recoverable, billing needs attention. |
| `incomplete_expired` | 23h SCA window passed. Sub is permanently dead. | `canceled` | This one really is dead. 30-day deletion clock applies. |
| `paused` | Someone set `pause_collection` (admin action; we don't surface it). | `past_due` | User confirmed: if billing is paused, access should be gated. Same lived experience as failed payment. |

We lose some at-a-glance debugging granularity in the User row (can't tell whether a `past_due` user is mid-SCA, mid-dunning, or pause-comped), but Stripe and our webhook logs still have it.

### Implementation steps

1. **No `PlanStatus` enum change.** Existing 5 values stay.
2. **Update the webhook switch** in `app/api/stripe/webhook/route.ts` (around lines 25-45):
   ```ts
   case "incomplete":         planStatus = "past_due"; break;
   case "unpaid":             planStatus = "past_due"; break;
   case "paused":             planStatus = "past_due"; break;
   case "incomplete_expired": planStatus = "canceled"; break;
   ```
   Keep the defensive default (warn log + `past_due`) as a guardrail for future Stripe statuses we haven't seen.
3. **Fix the `past_due` access gate** — this is audit item #1, now bundled here:
   - In `lib/subscription.ts`, add a `past_due` row to `LIMITS` with no-access entitlements (`maxYards: 1, maxAnalysesPerYardPerMonth: 0, maxVisibleTasks: 1, canRunAnalysis: false`).
   - Update `getPlanLimits` to return that row when `planStatus === "past_due"`. Currently it falls through to the user's plan tier and returns full access.
   - **CRITICAL**: do NOT include `past_due` in `isEffectivelyExpired`. The whole point is no access without starting the deletion clock — billing is recoverable.
4. **Dashboard banner for `past_due`**: add a banner in `app/(dashboard)/layout.tsx` that renders when `planStatus === "past_due"`. Copy: *"Your billing needs attention. [Open billing portal →]"* linked to `/api/stripe/portal`. The banner should be persistent (similar to the trial banner currently there).
5. **Update tests** in `app/api/stripe/webhook/__tests__/route.test.ts`:
   - Current contract #6 tests (paused + incomplete → past_due via default) need to be moved to their own explicit cases. The default-branch test should use a genuinely unknown status (e.g., `"made_up_status"`) to exercise the guardrail.
   - Add a test for `unpaid → past_due` and `incomplete_expired → canceled`.
   - Add tests for `getPlanLimits` returning the no-access row for `past_due`.
6. **Update the contract doc** `docs/billing-behavior-reference.md`:
   - Webhook section: replace the current items #5 (past_due → past_due) and #6 (default → past_due + log) with explicit items #5a (incomplete), #5b (unpaid), #5c (paused), #5d (incomplete_expired → canceled), and a revised default-guardrail #6 that uses a truly-unknown status as its example.
   - Add a new section after "Failed payments" titled "What `past_due` actually means now": no paid feature access (analyses, multi-yard, full task list), persistent banner in-app, billing portal link, no deletion clock.
   - The Failed payments section currently says `past_due` users keep full plan access — fix that. The new behavior is "no paid feature access until billing is restored."
7. **Audit other surfaces** for hardcoded `past_due` assumptions:
   - `app/api/analyze/route.ts` — does it call `canRunAnalysis` which respects the new limits? It should, but verify.
   - Email templates — `lib/email/weather-alerts.ts` etc. — do they continue sending to `past_due` users? Probably should stop, since access is now gated.

### Decisions made in this session

- **All "billing unwell" Stripe states (incomplete, unpaid, paused, past_due) collapse to one `past_due` planStatus.** No new enum value needed.
- **`past_due` now gates paid features.** Access is recoverable by updating payment; no deletion clock.
- **`incomplete_expired` maps to `canceled`** because the subscription is permanently dead.
- **Single user-facing banner** for all four cases — we don't surface which exact Stripe state to the user.

## Remaining open items from the original audit

Still NOT addressed:

1. **No reminder email before a scheduled annual→monthly fires.** A user who scheduled the switch in January gets no email in late December. They could be surprised when the next bill changes shape.
2. **Trial expiration has no explicit "you're now expired" page.** When the 21 days end, the account goes read-only with no in-app moment that says "trial over, pick a plan or your data deletes in 30 days."
3. **Task-window pushes from the daily-tasks cron are not gated by `past_due`.** The push paths around `safePushUser` for weather-tomorrow alerts, GDD pre-emergent/grub/overseed window-open alerts, and best-day pushes run per-yard without a planStatus check. These currently still fire for past_due users. Less impactful than the email digest (and arguably useful as a heads-up), but if you want symmetry with the email + reminder gating, add a `user.planStatus === "past_due"` early-return inside the per-yard loop.

Note: the original audit's "past-due users get full plan access" item is now closed by the Stripe status mapping work above.

None of these are blocking — they're product polish.

## Key files (cheatsheet)

| Purpose | File |
|---|---|
| Product contract | `docs/billing-behavior-reference.md` |
| Stripe schedule manual test plan | `docs/stripe-schedule-release-test-plan.md` |
| Plan limits, helpers, tier rank | `lib/subscription.ts` |
| Plan price IDs by env var | `lib/stripe.ts` |
| Plan change route | `app/api/stripe/change-plan/route.ts` |
| Cancel route | `app/api/stripe/cancel/route.ts` |
| Cancel pending switch route | `app/api/stripe/cancel-pending/route.ts` |
| Yard archive route (at-renewal picker) | `app/api/yards/archive/route.ts` |
| Webhook + `updateUserFromSubscription` | `app/api/stripe/webhook/route.ts` |
| Settings UI (confirm screen, prompts) | `components/settings/BillingSection.tsx` |
| At-renewal yard limit modal | `components/yards/YardLimitExceededModal.tsx` |
| Dashboard layout that mounts the modal | `app/(dashboard)/layout.tsx` |
| Pricing page (public + subscriber views) | `app/pricing/page.tsx` |
| Terms § 6 (customer-facing billing) | `app/terms/page.tsx` |
| Seed script for downgrade test user | `scripts/seed-downgrade-user.ts` |

## How to verify things still work

```bash
# Type check
npx tsc --noEmit

# Run full test suite (612 tests; ~4s)
npx vitest run

# Run only billing tests (45 tests; <1s)
npx vitest run app/api/stripe app/api/yards lib/__tests__/subscription.test.ts
```

## How to actually exercise the flow against Stripe

Follow `docs/stripe-schedule-release-test-plan.md`. It documents 10 scenarios with the exact Stripe Dashboard state, DB state, and UI state expected at each step. The most important one is **S5**: advance the test clock past `current_period_end` after a tier change with a pending switch, to verify the bug we fixed (orphan schedule firing months later) stays fixed.

## How to set up the over-limit test account

Run `npx tsx scripts/seed-downgrade-user.ts` against your local DB. Creates `yardanalyzer+downgrade@gmail.com` as a Home Basic user with 5 active yards, which is over the Basic limit. Sign in with that Gmail alias and the at-renewal yard limit modal should gate the dashboard.

## Reading order for someone picking this up

1. This file (where you are now)
2. `docs/billing-behavior-reference.md` — the product contract
3. `app/api/stripe/change-plan/route.ts` — most of the interesting logic lives here
4. `app/api/stripe/webhook/__tests__/route.test.ts` — the test names tell you what's pinned
5. `docs/stripe-schedule-release-test-plan.md` — only if you need to verify against live Stripe

That's it. The next concrete task is "Open: Stripe status mapping" above.
