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

- [ ] **2.1 — Hash password-reset + email-change tokens**
  - Files: `prisma/schema.prisma:187-208`, `app/api/auth/reset-password/route.ts:27-32`, `app/api/user/email/confirm/route.ts:15-19`, the routes that *issue* tokens too.
  - Fix: store `sha256(token)`, mail the raw token to the user, look up by hash. Migration to clear old tokens.
  - Done in:

- [ ] **2.2 — Zod-validate `/api/tasks/[id]` PATCH body**
  - Files: `app/api/tasks/[id]/route.ts:13-37`
  - Fix: add a strict Zod schema, parse before update.
  - Done in:

- [ ] **2.3 — Stop logging raw emails in cron**
  - Files: `app/api/cron/daily/route.ts:155, 513, 592, 594`
  - Fix: log `user.id`. Never the email/IP.
  - Done in:

- [ ] **2.4 — Harden unsubscribe link**
  - Files: `app/api/notifications/unsubscribe/route.ts:5-19`
  - Fix: require a POST/confirm click so prefetchers can't disable; add an issuedAt claim with a sane window so leaked tokens age out.
  - Done in:

## Tier 3 — Big refactor wins (delete code, prevent drift)

- [ ] **3.1 — Extract `ScheduleEditor`**
  - `SectionForm` (458–577) and `YardEditForm` (156–251) ship identical day-picker + time/height Select JSX, plus duplicated `DAYS / TIME_OPTIONS / MOWING_HEIGHTS / WATERING_MINUTES / parseSchedule / serializeSchedule`.
  - Plan: new `components/yard/ScheduleEditor.tsx` with `kind: "mow" | "water"` + `lib/schedule.ts` for parse/serialize. Replace both call sites.
  - Expected: ~250 lines deleted.
  - Done in:

- [ ] **3.2 — Extract `GrassIdentifyUpload`**
  - `YardSetupForm.tsx:555-640` and `SectionForm.tsx:277-343` duplicate the camera/file inputs and `identifyGrass()` logic verbatim.
  - Plan: new `components/yard/GrassIdentifyUpload.tsx` exposing an `onIdentified(grassType, confidence, explanation)` callback. Replace both call sites.
  - Expected: ~150 lines deleted.
  - Done in:

- [ ] **3.3 — Extract `SoilFields`**
  - `SectionForm.tsx:411-451` and `SoilQuickEdit.tsx:137-218` are already drifting (`organicMatterPct` is in SoilQuickEdit only).
  - Plan: new `components/yard/SoilFields.tsx` (controlled component). Use in both. Drives a single source of truth for the soil schema.
  - Done in:

- [ ] **3.4 — Co-locate `AREA_NAME_MAP`**
  - Defined identically in `YardSetupForm.tsx:45` and `SectionForm.tsx:69`.
  - Fix: move to `components/yard/AreaTypeSelector.tsx` next to `AREA_CONFIG`, export.
  - Done in:

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
