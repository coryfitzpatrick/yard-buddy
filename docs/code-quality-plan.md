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

- [x] **4.1 — Delete `lib/claude.ts.bak`**
  - Already untracked; gitignore covers it via `*.bak`. Local file can be removed manually (`rm lib/claude.ts.bak`).

- [x] **4.2 — Add `*~lock~` to `.gitignore`**
  - Done in: `28d42c1` — Affinity Designer lock pattern added. Existing lock file is untracked; remove locally with `rm public/yard-analyzer-logo.af~lock~`.

- [x] **4.3 — Replace `as never` casts**
  - Done in: `28d42c1` — every `as never` in `SectionForm` and `YardSetupForm` swapped for `as YardSectionFormInput["<field>"]` so TypeScript still validates the field name.

- [x] **4.4 — Type `buildWeatherData`**
  - Done in: `28d42c1` — added `OwmCurrent` / `OwmForecast` / `OwmForecastItem` slices and typed `buildWeatherData` plus the `Promise.all` results.

- [x] **4.5 — `lib/stripe.ts` Reflect.get**
  - Done in: `28d42c1` — `(getStripe() as any)[prop]` → `Reflect.get(getStripe(), prop)`.

- [x] **4.6 — Split `YardSetupForm` (881 lines)** into a `useYardSetup()` hook + per-step components (`PropertyStep`, `AreaStep`, `GrassStep`, `SoilStep`, `PhotosStep`, `ReviewStep`).
  - Done in: `358b692` — `components/yard/setup/useYardSetup.ts` owns all step navigation, RHF, ZIP validation, equipment/watering state, yard-size lookup, refs, and the submit/canAdvance/handleAddAnotherSection handlers. Six step components (PropertyStep, AreaStep, GrassStep, SoilStep, PhotosStep, ReviewStep) plus a SuccessScreen consume a single `YardSetupController` prop. The 769-line YardSetupForm is now a 105-line shell. Surfaced + fixed a real cascading-renders lint in the saveArmed cooldown effect.

- [x] **4.7 — Pre-fetch `/api/yard` server-side** on `app/(dashboard)/analyze/page.tsx:51-70`. Removes the loading spinner + searchParams effect dance.
  - Done in: `85d8b54` — page is now a server component that auths, queries yards via Prisma, resolves the `searchParams.sectionId` preselect, and hands props to a new `AnalyzeClient` island. First paint is the right yard/section instead of a spinner, and the /api/yard round trip is gone for this page.

- [x] **4.8 — Fix dashboard double-fetch**
  - Done in: `28d42c1` — `tasks: { select: { status: true } }` include was unused (no `s.tasks` reference anywhere on the page). Dropped from the yards query.

- [x] **4.9 — Add `error.tsx` + `loading.tsx`**
  - Done in: `28d42c1` — `app/(dashboard)/error.tsx` (route-segment error boundary with reset + dashboard link) and `app/(dashboard)/loading.tsx` (spinner).

- [x] **4.10 — Move schedule parsing to `lib/schedule.ts`**
  - Done in: `be449f5` (folded into 3.1).

## Tier 5 — Polish

- [x] **5.1 — Lift `SoilQuickEdit` state up**; remove `forwardRef` + `useImperativeHandle` for a single caller.
  - Done in: `0e6656f` — `useSoilQuickEdit` hook owns the soil form state and `saveIfDirty`. Analyze page calls the hook and passes its return to a controlled `SoilQuickEdit`; the `soilRef` and the per-section IIFE are gone. Section-change reset moved from `useEffect` to React's adjust-state-during-render pattern, which also clears the cascading-renders lint that surfaced once the linter recognized the hook.
- [x] **5.2 — Replace `router.refresh()` with server actions + `revalidatePath`** (9 call sites).
  - Done in: `8098937` — added `app/_actions/{tasks,yards,sections,terms}.ts`; rewired TaskList (status + overdue reset), SectionCard, YardDeleteButton, YardEditForm, SplitYardForm, SectionForm (create + edit), and the terms-accept page. The two `router.refresh()` calls in `YardSetupForm` were post-navigation no-ops and just deleted. Dead routes removed: `/api/auth/accept-terms`, `/api/tasks/[id]`, `/api/yard/[id]/split`, plus the `DELETE` methods on `/api/yard/[id]` and the section route. Net -71 lines.
- [x] **5.3 — Memoize TaskList priority groups** (`TaskList.tsx:307-322`).
  - Done in: `e94bc53` — pending/maintenance/overdue/completed splits and the urgent/high/routine grouping all live in a single `useMemo` keyed on `tasks`.
- [x] **5.4 — Move magic time constants to `lib/time.ts`** (`DAY_MS`, `DAYS_30_MS`, `TRIAL_GRACE_DAYS`).
  - Done in: `59cf629` — added `lib/time.ts` (SECOND_MS / MINUTE_MS / HOUR_MS / DAY_MS / DAYS_30_MS / TRIAL_GRACE_DAYS). Replaced inline `24 * 60 * 60 * 1000` math across cron daily, register, email TTL, and subscription helpers.
- [x] **5.5 — Add a second prompt cache breakpoint** in `analyzeImages*` covering the static JSON-schema block, not just the system prompt.
  - Done in: extracted the ~1500-token JSON schema + sequencing rules into a single `ANALYZE_SCHEMA_BLOCK` constant. Both `analyzeImages` and `analyzeImagesBase64` now place it as a separate `text` block before the image content with its own `cache_control: ephemeral`, so the schema prefix caches across calls regardless of grass type or section. System prompt keeps its existing breakpoint.
- [x] **5.6 — Add tests** for `lib/slug.ts`, `lib/rate-limit.ts`, and `claude.ts`'s pure helpers (`detectDataGaps`, `buildContextWarnings`, `buildDataGapWarning`).
  - Done in: `8cc5748` — new `lib/__tests__/{slug,rate-limit,claude-helpers}.test.ts` files (38 tests). Required exporting `buildContextWarnings`. Tests surfaced a real bug — an empty `x-forwarded-for` header returned `""` instead of `"unknown"`, which would let a misconfigured proxy collide rate-limit keys across many clients. Fixed in the same commit.
- [x] **5.7 — Fix `app/(dashboard)/dashboard/page.tsx:90`** — `yards[0]?.weatherRefreshedAt` masquerades as global; either rename or take the max across yards.
  - Done in: `2256701` — reduced to the most recent timestamp across yards. Multi-yard users no longer see a stale indicator just because the first yard hadn't refreshed yet.

---

## How to resume after a context clear

1. Read this file.
2. Find the next unchecked item.
3. Implement, run typecheck + relevant tests, commit.
4. Update the matching line: `[ ]` → `[x]` and fill in `Done in: <commit-hash>`.
5. Commit the plan-doc update alongside (or right after) the work.
