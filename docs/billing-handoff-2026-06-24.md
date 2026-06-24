# Billing flow handoff — 2026-06-24

This doc captures the state of the billing work at session end so a future Claude session (or human) can pick up without re-deriving anything. Read this first, then `docs/billing-behavior-reference.md` for the actual product contract.

## TL;DR of where we are

The billing flow has been substantially rebuilt and audited in this session. The core rules are:

1. **Annual subscribers only get tier upgrades immediately.** Every other change waits for renewal.
2. **Monthly subscribers get every change immediately.**
3. **"You get what you paid for"** — annual subscribers finish their prepaid term at the prepaid tier.
4. **Yard archive happens at the moment of the downgrade**, never at submit time for deferred changes.
5. **Trial → paid resets the analysis quota** so trial usage doesn't dock the first paid month.

All five rules are documented in `docs/billing-behavior-reference.md` with row-by-row tables and a contract section. 612 tests pass; tsc clean. **There is one open work item — see "Open: Stripe status mapping" below.**

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

## Open: Stripe status mapping (the next thing to do)

User asked us to explicitly handle every Stripe subscription status instead of relying on the catchall default. **The plan was proposed but NOT executed.** Pick up here.

### The four Stripe statuses currently falling into the default

| Stripe status | Semantic meaning | Proposed app `planStatus` | Rationale |
|---|---|---|---|
| `incomplete` | Sub created, initial payment hasn't cleared (SCA pending). Lives up to 23h. | **new** `incomplete` | They JUST signed up; "past_due" would imply they're late, which is wrong. No paid feature access. Deletion clock does NOT start. |
| `unpaid` | Stripe finished dunning retries and gave up. Sub still exists; user can recover by updating card. | **new** `incomplete` | Same UX as above — billing is recoverable, no paid feature access. Stripe did NOT cancel; mapping to `canceled` would be wrong because it would start the deletion clock prematurely. |
| `incomplete_expired` | 23h SCA window passed. Sub is permanently dead. | `canceled` | Subscription is over. 30-day data retention applies. |
| `paused` | Someone set `pause_collection` (admin action; we don't surface it). | `active` (recommended) — but USER WAS UNDECIDED | Stripe-side pause typically comps the user during a support issue. Mapping to `active` honors that intent. Open question — see below. |

### Implementation steps to execute the plan

1. **Extend the `PlanStatus` union** in `lib/subscription.ts`:
   ```ts
   export type PlanStatus = "trialing" | "active" | "past_due" | "expired" | "canceled" | "incomplete";
   ```
2. **Add an `incomplete` row to `LIMITS`** in the same file. Use the same numbers as `expired` (`maxYards: 1, maxAnalysesPerYardPerMonth: 0, maxVisibleTasks: 1, canRunAnalysis: false`). They have no paid features until payment clears.
3. **Critically, `isEffectivelyExpired` MUST NOT include `"incomplete"`** — the entire point of separating it from `expired` is to prevent the deletion cron from running on someone who's mid-checkout.
4. **Update the webhook switch** in `app/api/stripe/webhook/route.ts` (around lines 25-45):
   ```ts
   case "incomplete":         planStatus = "incomplete"; break;
   case "unpaid":             planStatus = "incomplete"; break;
   case "incomplete_expired": planStatus = "canceled";   break;
   case "paused":             planStatus = "active";     break; // confirm with user!
   ```
5. **Keep the defensive default** (warn log + `past_due`) as a guardrail for future Stripe statuses.
6. **UI surface for `incomplete`**: add a banner to the dashboard layout that shows when `planStatus === "incomplete"` with copy like *"Finish your payment to activate [Plan]. [Open billing portal →]"*. Link goes to `/api/stripe/portal`.
7. **Update existing test** in `app/api/stripe/webhook/__tests__/route.test.ts`:
   - The contract #6 tests currently assert "unknown status maps to past_due + log." Update them:
     - `incomplete` should now hit its own case and map to `incomplete` (no log)
     - The default-case test should use a genuinely unknown status (e.g., `"made_up_status"`) to exercise the guardrail
   - Add new tests for each of `incomplete`, `unpaid`, `incomplete_expired`, and `paused` mapping
8. **Update the doc contract** in `docs/billing-behavior-reference.md`. The webhook section currently says:
   > 6. **Any unrecognized Stripe `status`** … → persists `planStatus = "past_due"` AND emits a `logger.warn`
   
   Update to enumerate the four newly-handled statuses, with contract items #6a–6d, and keep #6 (default) as the guardrail with adjusted wording.

### Open question that needs the user's call

**`paused` mapping**: my recommendation is `active`, on the reasoning that Stripe-side pause is typically a manual support intervention to comp a user. The user said *"we should not have a pause feature to fall back on"* — that referred to NOT pretending we support pause, which is a different concern. Mapping `paused` to `active` doesn't add a pause feature; it just keeps a comp'd user in working state.

The conservative alternative is `incomplete` (gate access until pause is lifted). Less generous but defensible.

Confirm with the user before wiring this case.

## Remaining open items from the original audit

These were flagged in the audit but NOT addressed in this session:

1. **Past-due users get full plan access.** `getPlanLimits` doesn't degrade for `planStatus === "past_due"`. They keep all features until Stripe's retry window expires. Email + portal link via webhook is the only nudge.
2. **No reminder email before a scheduled annual→monthly fires.** A user who scheduled the switch in January gets no email in late December. They could be surprised when the next bill changes shape.
3. **Trial expiration has no explicit "you're now expired" page.** When the 21 days end, the account goes read-only with no in-app moment that says "trial over, pick a plan or your data deletes in 30 days."

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
