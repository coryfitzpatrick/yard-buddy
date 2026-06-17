# Code Quality + Security Pass

> Living plan from the 2026-06-17 security/quality review. Check items off as
> they ship. Persists across sessions so a fresh agent can resume from here.
>
> **Legend**: `[ ]` = todo · `[~]` = in progress · `[x]` = done (with commit)

---

## Tier 1 — Ship today (exploitable cost-abuse)

- [x] **1.1 — BOLA on `/api/analyze`**
  - Done in: `9d2dd0f` — added `lib/storage-url.ts` with `isOwnedLawnPhotoUrl()` and call it on every `photos[].url` before the analyze call.

- [x] **1.2 — SSRF + cost abuse on `/api/identify-grass`**
  - Done in: `9d2dd0f` — same allowlist; route now refuses `imageUrl` outside the caller's `lawn-photos/<userId>/` prefix.

- [x] **1.3 — Rate limit Claude / external endpoints**
  - Done in: `9d2dd0f` — `checkRateLimit` applied to analyze (10/hr), identify-grass (10/hr), recommendations (20/hr), upload (60/hr), lookup-yard-size (30/hr), validate-zip (30/hr), weather (60/hr). Bonus: tightened upload MIME check to the explicit allowlist (4.x carryover) and Zod-validated the lookup-yard-size address field.

## Tier 2 — This week

- [x] **2.1 — Hash password-reset + email-change tokens**
  - Done in: `9855927` — `lib/token-hash.ts` shared between both flows; migration `20260617130000_purge_plaintext_tokens` clears the rows that pre-date the hash so they can't be replayed.

- [x] **2.2 — Zod-validate `/api/tasks/[id]` PATCH body**
  - Done in: `7a04426` — strict schema with both `status` and `stillWorthDoing` optional, requires at least one, rejects unknown fields.

- [x] **2.3 — Stop logging raw emails in cron**
  - Done in: `d6df1e1` — flipped `${user.email}` to `${user.id}` for the account-deletion and card-expiry log lines.

- [x] **2.4 — Harden unsubscribe link**
  - Done in: `e15e984` — GET now renders a confirm page; POST is required to actually opt out. Token format adds an issuedAt; tokens older than 90 days are rejected. Legacy two-segment tokens are still accepted so existing emails keep working. Confirm page is no-store + noindex.

## Tier 3 — Big refactor wins (delete code, prevent drift)

- [x] **3.1 — Extract `ScheduleEditor`**
  - Done in: `be449f5` — `lib/schedule.ts` owns the constants and `parseSchedule` / `serializeSchedule` / `formatScheduleSummary`. `components/yard/ScheduleEditor.tsx` is reused by `YardEditForm` and `SectionForm`. Yard page also calls `parseSchedule` instead of inlining JSON parsing. Net ~250 lines deleted.

- [x] **3.2 — Extract `GrassIdentifyUpload`**
  - Done in: `be449f5` — `components/yard/GrassIdentifyUpload.tsx` (forwardRef) holds the camera/file inputs, identify state, and the upload→identify-grass fetch. `YardSetupForm` and `SectionForm` now mount the component and reset it via the imperative handle when the user picks a grass type by hand.

- [~] **3.3 — Extract `SoilFields`** (partial)
  - Done in: `be449f5` — drift plugged. `organicMatterPct` now lives in `SectionForm` (with pre-fill on both edit pages) so it matches `SoilQuickEdit`. Full controlled-component extraction deferred until a third call site or the next round of drift; the RHF↔controlled bridge isn't worth the refactor risk yet.

- [x] **3.4 — Co-locate `AREA_NAME_MAP`**
  - Done in: `d2c532f` — exported from `AreaTypeSelector` alongside `AREA_CONFIG`; duplicate copies removed from `YardSetupForm` and `SectionForm`.

## Tier 4 — Cleanup

- [ ] **4.1 — Delete `lib/claude.ts.bak`** (83 KB dead file in the repo).
- [ ] **4.2 — Add `*~lock~` to `.gitignore`** and remove the Affinity Designer lock file.
- [ ] **4.3 — Replace `as never` casts** in `SectionForm.tsx:88-97, 147, 208` and `YardSetupForm.tsx:166, 187`. They silently swallow type errors.
- [ ] **4.4 — Type `buildWeatherData`** in `lib/weather.ts:7` from real OWM response types.
- [ ] **4.5 — `lib/stripe.ts:19`** — replace `(getStripe() as any)[prop]` with `Reflect.get`.
- [ ] **4.6 — Split `YardSetupForm` (881 lines)** into a `useYardSetup()` hook + per-step components (`PropertyStep`, `AreaStep`, `GrassStep`, `SoilStep`, `PhotosStep`, `ReviewStep`).
- [ ] **4.7 — Pre-fetch `/api/yard` server-side** on `app/(dashboard)/analyze/page.tsx:51-70`. Removes the loading spinner + searchParams effect dance.
- [ ] **4.8 — Fix dashboard double-fetch** (`app/(dashboard)/dashboard/page.tsx:24-42`) — the `include` already pulls tasks; the second `lawnTask.findMany` is redundant.
- [ ] **4.9 — Add `error.tsx` + `loading.tsx`** to `app/(dashboard)/`. Currently zero.
- [ ] **4.10 — Move schedule parsing to `lib/schedule.ts`** (duplicated 4 places). Folds into 3.1.

## Tier 5 — Polish

- [ ] **5.1 — Lift `SoilQuickEdit` state up**; remove `forwardRef` + `useImperativeHandle` for a single caller.
- [ ] **5.2 — Replace `router.refresh()` with server actions + `revalidatePath`** (9 call sites).
- [ ] **5.3 — Memoize TaskList priority groups** (`TaskList.tsx:307-322`).
- [ ] **5.4 — Move magic time constants to `lib/time.ts`** (`DAY_MS`, `DAYS_30_MS`, `TRIAL_GRACE_DAYS`).
- [ ] **5.5 — Add a second prompt cache breakpoint** in `analyzeImages*` covering the static JSON-schema block, not just the system prompt.
- [ ] **5.6 — Add tests** for `lib/slug.ts`, `lib/rate-limit.ts`, and `claude.ts`'s pure helpers (`detectDataGaps`, `buildContextWarnings`, `buildDataGapWarning`).
- [ ] **5.7 — Fix `app/(dashboard)/dashboard/page.tsx:90`** — `yards[0]?.weatherRefreshedAt` masquerades as global; either rename or take the max across yards.

---

## How to resume after a context clear

1. Read this file.
2. Find the next unchecked item.
3. Implement, run typecheck + relevant tests, commit.
4. Update the matching line: `[ ]` → `[x]` and fill in `Done in: <commit-hash>`.
5. Commit the plan-doc update alongside (or right after) the work.
