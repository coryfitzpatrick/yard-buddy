# Plan Downgrade and Archived Yards Design

**Date:** 2026-06-22
**Status:** Design approved, ready for implementation plan

## Goal

Make plan downgrades safe, transparent, and reversible. Today the `change-plan` endpoint accepts any switch without validating against the user's yard count, silently leaving downgraded users over-limit. Today the pricing page shows the trial card to anyone who has paid, including customers whose subscription has lapsed. This design closes both gaps and introduces a soft-archive mechanism so users do not lose data when they downsize.

## Strategic Frame

**Three rules:**

1. **Downgrade requires a picker.** When a downgrade would put the user over the new plan's yard limit, force them through a modal that picks which yards remain active. Yards not selected are soft-archived. Confirmation requires typing "DOWNGRADE" exactly.
2. **Once paid, never trial.** Any user with `User.stripeCustomerId` set is permanently ineligible for the trial. Hide the trial card from the pricing page and reject `plan: "trial"` from the `change-plan` API, even when their current status is `canceled` or `expired`.
3. **Archive is reversible, not permanent.** Soft-archived yards preserve all data (analyses, tasks, schedules, photos) but do not count against plan limits and do not fire reminders. Upgrading restores the most recently archived yards automatically up to the new limit. Account cancellation still triggers the existing 30-day grace deletion sweep, which deletes archived and active yards together (no special handling needed since `Yard.userId` cascades).

## User Flows

### Downgrade flow

**Triggers:** any plan switch where the target plan's `maxYards` is less than the user's current active yard count.

**Entry points:**
- `/settings/billing` → click "Downgrade to Home Plus" on the destination plan's row.
- `/pricing` → click the destination plan's "Downgrade" CTA → routes to `/settings/billing?action=downgrade&to=home_plus`. The billing page reads the query string on mount and auto-opens the downgrade modal with the target plan pre-selected.

**Modal contents:**

- **Heading:** "Downgrading to Home Plus. You'll have 3 yards. The {N - 3} yards you don't pick will be archived."
- **Yard checklist:** all active yards listed with checkboxes. Counter at the top: "3 of 3 selected" updates as user clicks.
- **Explanatory copy:** "Archived yards stop sending reminders and don't count toward your plan. Your data is kept and restored if you upgrade. Your card will be credited for unused time on your current plan."
- **Typed confirmation field:** placeholder "Type DOWNGRADE to confirm".
- **Submit button:** disabled until selected count equals new plan's limit AND confirmation text is exactly "DOWNGRADE".

**Submit behavior:**

- POST `/api/stripe/change-plan` with `{ plan, period, archiveYardIds: string[] }`.
- Server: Stripe `subscriptions.update` with `proration_behavior: "always_invoice"` (existing pattern; the customer is credited for unused time on the old plan).
- Server: `db.yard.updateMany({ where: { id: { in: archiveYardIds }, userId }, data: { archivedAt: new Date() } })`.
- Server: `db.user.update({ plan: newPlan })`.
- All three wrapped in a single Stripe + Prisma transaction so a partial state is impossible.
- Modal closes. Settings page revalidates and shows the new plan plus the archived-yards one-liner.

### Upgrade flow

**Trigger:** any plan switch where the target plan's `maxYards` is greater than the user's current plan's `maxYards` AND the user has archived yards.

**Behavior:**

- The existing `checkout` route handles new-subscription upgrades; the existing `change-plan` route handles in-place tier upgrades. Both paths converge on the Stripe webhook for subscription updates.
- After the plan flip succeeds (on the webhook for new subscriptions, inline for change-plan), query the user's archived yards ordered by `archivedAt` descending. Unarchive the most recent `(newLimit - currentActiveCount)` by setting `archivedAt: null`.
- Wrapped in a transaction so a webhook retry that re-runs the unarchive is idempotent (already-restored yards have `archivedAt: null` and are skipped by the take/limit).

### Delete-archived flow

**Trigger:** user clicks "Delete permanently" on the archived-yards row in `/settings/billing`.

**Modal contents:**

- **Warning:** "This permanently deletes all {N} archived yards, their analyses, tasks, and photos. This cannot be undone."
- **Typed confirmation:** "Type DELETE to confirm".
- **Submit button:** disabled until text matches exactly.

**Submit behavior:**

- POST `/api/yards/archived/delete` with `{ confirmation: "DELETE" }`.
- Server validates confirmation, then deletes via `db.yard.deleteMany({ where: { userId, archivedAt: { not: null } } })`. The cascade handles sections, analyses, tasks per existing schema.
- Server also cleans up Supabase storage for the analysis photos, using the same pattern as `app/api/cron/account-deletion/route.ts`.
- Returns count of deleted yards. Settings revalidates.

### Cancel flow (unchanged)

Existing `app/api/stripe/cancel/route.ts` and the `app/api/cron/account-deletion/route.ts` sweep are untouched. When the account is deleted, both active and archived yards are removed via the `Yard.userId` cascade.

### Trial card visibility

- Pricing page checks `hasEverPaid = !!user.stripeCustomerId`.
- If true, the Free Trial card is not rendered at all (even for `canceled` / `expired` users who currently see it).
- If false, existing logic for trialing / non-trialing applies.

## Schema Changes

### `Yard` model

Add one field:

```prisma
archivedAt DateTime?
```

Add one index:

```prisma
@@index([userId, archivedAt])
```

The `User` table already has RLS enabled and the `Yard` table inherits the project's RLS lockdown from the 2026-06-16 migration; this change adds a column to an existing table, so no new RLS work is required.

## Subscription Helper Changes (`lib/subscription.ts`)

- `hasEverPaid(user: { stripeCustomerId?: string | null }): boolean` — returns `user.stripeCustomerId != null`. Pure helper.
- `eligiblePlansForUser(user): Plan[]` — returns plan keys the user can switch to. Excludes `"trial"` when `hasEverPaid(user)` is true. Used by both API validation and UI gating.
- `getActiveYardCount(userId: string): Promise<number>` — `db.yard.count({ where: { userId, archivedAt: null } })`. Used in `canCreateYard` checks and the change-plan validator.
- `canCreateYard(user, count)` is unchanged. Call sites must pass the active count, not total. This is the audit step in the implementation plan.

## API Changes

### `POST /api/stripe/change-plan` (modified)

**New rejections:**
- `plan === "trial"` → 400 `{ error: "Cannot switch to trial" }`.
- `hasEverPaid(user) && plan === "trial"` → same 400 (defense in depth).
- If new plan's `maxYards` < `getActiveYardCount(userId)` AND `archiveYardIds` is missing or wrong length → 400 with `{ error: "Need to archive yards first", code: "archive_required", requiredCount: number }`. The frontend reads `code` to know to open the picker modal.

**New required body field:**
- `archiveYardIds?: string[]` — required when downgrading would put the user over the new plan's limit. Length must equal `currentActiveCount - newMaxYards`. All IDs must belong to the user and not already be archived.

**Transaction (all-or-nothing):**
- `stripe.subscriptions.update(...)` with `proration_behavior: "always_invoice"`.
- `db.$transaction([yard.updateMany({ where: { id: { in: archiveYardIds }, userId }, data: { archivedAt: new Date() } }), user.update({ where: { id: userId }, data: { plan } })])`.

If the Stripe call fails, the Prisma transaction is not started and we return the Stripe error code. If the Prisma transaction fails after a successful Stripe update, we log an error and return 500. The webhook is the source of truth for plan state, so a retry will resync, but `archivedAt` may need a manual fix. This edge is acceptable for an early-stage product; document the failure mode.

### `POST /api/yards/archived/delete` (new)

**Body:** `{ confirmation: "DELETE" }`.

**Behavior:**
- 401 if no session.
- 400 if confirmation is not exactly `"DELETE"`.
- Query all archived yards for the user, collect their analysis photo URLs, and remove the photos from Supabase storage following the pattern in `app/api/cron/account-deletion/route.ts`.
- `db.yard.deleteMany({ where: { userId, archivedAt: { not: null } } })`. The cascade handles sections, analyses, tasks.
- Return `{ ok: true, deleted: <count> }`.

### Stripe checkout + webhook (modified)

After a successful subscription create or upgrade event:
- Compute `newLimit = getPlanLimits({ plan }).maxYards`.
- Compute `activeCount = getActiveYardCount(userId)`.
- Compute `restoreCount = max(0, newLimit - activeCount)`.
- If `restoreCount > 0`: query archived yards ordered by `archivedAt` descending, take the first `restoreCount`, and `yard.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } })`.

Webhook handlers must be idempotent. Querying archived yards by `archivedAt: { not: null }` naturally skips already-restored yards on retry.

### Audit of existing routes (add `archivedAt: null` filter)

These query yards and should show only active yards:
- `app/(dashboard)/dashboard/page.tsx` — `db.yard.findMany`.
- `app/(dashboard)/yard/page.tsx` — `db.yard.findMany`.
- `app/(dashboard)/analyze/page.tsx` — `db.yard.findMany`.
- `app/api/yard/route.ts` — yard count for `canCreateYard`.
- `app/api/cron/daily-tasks/route.ts` — `reminderUsers` query already filters expired users; extend to skip yards where `archivedAt != null` so archived yards do not fire reminders.

These intentionally do NOT filter (data preservation):
- `app/api/cron/account-deletion/route.ts` — deletes the user; cascade handles all yards.
- Stripe webhook handlers — operate on user-level state.

## Pricing Page Changes (`app/pricing/page.tsx`)

- Compute `hasEverPaid = !!user?.stripeCustomerId` at the top of the server component.
- Skip rendering the Free Trial card when `hasEverPaid` is true.
- Detect tier direction per plan card. If the card's plan has a lower `maxYards` than the user's current plan: render a "Downgrade to {plan}" button with `href="/settings/billing?action=downgrade&to=<plan>"`. Visually less prominent than upgrade CTAs (outline variant, secondary color).
- Same downgrade CTA on annual and monthly buttons for the lower-tier card.

## Settings Billing Changes (`components/settings/BillingSection.tsx`)

- On page load, read `?action=downgrade&to=<plan>` from the URL and auto-open the downgrade modal with the target plan pre-selected.
- For each plan card, detect tier direction. Downgrade buttons open the modal instead of POSTing to change-plan directly. Upgrade buttons keep existing behavior.
- New section below "Current plan": if `archivedCount > 0`, render a one-liner — "**{N} yards archived from a previous plan.** Upgrade to restore, or [Delete permanently]." The "Delete permanently" link opens the delete-archived modal.

## Error Handling

**Downgrade modal:**
- 400 with `code: "archive_required"` → modal stays open; this only happens if the user manually tweaks the request, since the modal already enforces the picker.
- 400 with `code: "confirmation_required"` (text not "DOWNGRADE") → "Type DOWNGRADE exactly to confirm" inline.
- 402 (Stripe payment failure on the proration invoice) → "Couldn't process the plan change. Check your payment method and try again."
- 500 → generic "Something went wrong. Try again."
- Network failure → "Network error. Check your connection."

**Delete-archived modal:**
- 400 with `code: "confirmation_required"` → "Type DELETE exactly to confirm" inline.
- 500 → generic error.

**Upgrade auto-restore failure:**
- Webhook records the plan change successfully but the unarchive Prisma call fails. The user sees the new plan but their yards stay archived.
- Settings billing's archived-yards one-liner remains visible. Add a "Restore now" link that POSTs to a new `/api/yards/restore-from-archive` endpoint that performs the same auto-restore logic. Log failures to Axiom.

## Testing Scope

**Unit:**
- `hasEverPaid` returns true / false for the right inputs.
- `eligiblePlansForUser` excludes "trial" when the user has paid.
- `getActiveYardCount` returns the correct number ignoring archived yards.

**Integration (Vitest with test DB or mocks):**
- `change-plan` rejects `plan: "trial"` for paid users.
- `change-plan` rejects downgrade without `archiveYardIds` when over the new limit.
- `change-plan` rejects `archiveYardIds.length !== required`.
- `change-plan` rejects `archiveYardIds` containing IDs not owned by the user.
- `change-plan` succeeds with valid downgrade: Stripe called once, yards archived, plan updated.
- `yards/archived/delete` rejects wrong confirmation text.
- `yards/archived/delete` deletes only archived yards and returns count.
- Upgrade auto-restore: with three archived yards and a Pro upgrade, the three most recent unarchive.

**E2E (manual):**
- Pro user with 5 yards → downgrade to Plus → modal forces picking 3 → confirmation typed → success → Stripe credit posted → 2 yards show in archived count.
- Same user upgrades back to Pro → 2 archived yards auto-restore.
- Same user downgrades to Basic, then deletes archived yards → confirmation typed → archived yards gone.
- Canceled user opens `/pricing` → trial card not shown.

## Out of Scope

- Self-serve unarchive of a specific archived yard (only auto-restore on upgrade, or bulk delete; granular swap is a future feature).
- Pause flow changes (existing pause cron and pausedUntil are unaffected).
- Subscription "scheduled change at period end" — this design uses immediate downgrade with proration.
- Email / push notification confirming a downgrade or restore (existing audit log via Axiom is sufficient).
- Restoring archived yards' reminders on unarchive — reminders fire based on the yard's `wateringDays` / `mowingDays` which are preserved, so they resume automatically when `archivedAt` is null.

## Open Implementation Questions

These can be resolved during planning, not blockers for this design:

1. Should there be a maximum number of times a user can downgrade-and-re-upgrade per billing period? Stripe handles the proration, but excessive churn could be abusive. Probably not worth gating in v1.
2. When auto-restoring on upgrade, should we send a confirmation email "Your archived yards have been restored"? Probably not — they will see the yards back on their dashboard.
3. For the audit of existing yard queries, should the `archivedAt: null` filter be added via a Prisma extension (so it's automatic) or per-call-site? Per-call-site is more explicit and safer for the existing-route audit; Prisma extension is more elegant for the long term. Per-call-site recommended for the implementation, with a follow-up to consider the extension later.
