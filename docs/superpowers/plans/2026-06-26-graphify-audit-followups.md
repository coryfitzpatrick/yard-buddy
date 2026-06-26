# Graphify Audit Follow-ups (2026-06-26)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are independent and can be executed in any order; T1 → T2 → T3 → T4 is the recommended priority order if you only have time for some.

**Goal:** Address the gaps the initial Graphify knowledge-graph audit (graph built 2026-06-26, commit `4167a07`) surfaced before they compound. Four classes of work: (T1) verify schedule-recommendations plan completion, (T2) confirm production observability is wired, (T3) close the biggest test-coverage holes, (T4) reconcile stale design docs.

**Context for a fresh session.** The repo now ships with a committed Graphify knowledge graph at `graphify-out/`. You should have the graphify skill available — query it for any of the cross-cutting checks below (`get_neighbors`, `find_path`, etc.) rather than grepping by hand. If the skill is not loaded, fall back to reading `graphify-out/graph.json` with `jq` (queries used during the audit are recorded in each task below).

**Tech Stack:** Next.js 16 App Router, Prisma + PostgreSQL (Supabase), Stripe SDK, Vitest, Tailwind CSS, React. Vitest test pattern lives under `__tests__/` siblings to the routes/files they cover.

**Reference:** the audit narrative is in the chat transcript that produced this plan. The graph itself is the authoritative source — re-run queries against it rather than trusting the audit summary verbatim.

---

## File Structure

**Likely created:**
- `app/api/analyze/__tests__/route.test.ts`
- `app/api/cron/daily-tasks/__tests__/route.test.ts`
- `app/api/user/dismiss-home-screen-prompt/__tests__/route.test.ts`

**Likely modified:**
- `docs/superpowers/plans/2026-06-10-monetization.md` (mark stale or delete)
- `docs/superpowers/plans/2026-06-21-schedule-recommendations.md` (mark completed tasks done)
- `ops/axiom-setup.md` (reflect actual monitor configuration)
- `docs/superpowers/specs/2026-06-20-observability-axiom-design.md` (same)

**Discovery work (no file changes guaranteed):** T1 and T2 may reveal genuine product work to do; if so, write follow-up plans for those rather than expanding this one.

---

## T1: Verify schedule-recommendations Tasks 9–12 actually shipped

**Highest-value task in this plan.** Tasks 9, 10, 11, and 12 of the schedule-recommendations plan have zero code references in the graph, while tasks 1–8 do. Either (a) the linkage is genuinely missing because the work was completed in a way the graph didn't capture, or (b) the work was dropped before completion. Find out which.

**Files:**
- Read: `docs/superpowers/plans/2026-06-21-schedule-recommendations.md`
- Possibly modify: same plan to mark tasks complete, OR write a new plan to finish them

**Steps:**

- [ ] **Step 1: Read the plan and identify Tasks 9–12's expected deliverables.**

Open `docs/superpowers/plans/2026-06-21-schedule-recommendations.md`. Find sections for Tasks 9, 10, 11, 12. Note for each: the files it claimed to create or modify, the UI surface it touches (section detail page, yard edit form, section edit form, final verification), and any tests it claimed to add.

- [ ] **Step 2: Check whether the deliverables exist.**

For each of the four tasks, check the file paths the plan named:

```bash
# Task 9: Section Detail Page Integration — likely touches
ls app/\(dashboard\)/yard/\[id\]/section/ 2>/dev/null || ls app/\(dashboard\)/section/ 2>/dev/null

# Task 10: Yard Edit Form Mowing Inputs — likely touches
grep -l "mowing" components/yards/ app/\(dashboard\)/yard/ 2>/dev/null | head

# Task 11: Section Edit Form Plan-Gated Overrides — likely touches
grep -l "canSetSectionSchedule\|plan-gated" components/ 2>/dev/null | head

# Task 12: Final Verification — likely tests or a checklist
ls app/api/sections/__tests__/ 2>/dev/null
```

- [ ] **Step 3: Triage each task into one of three buckets.**

For each:
- **Done, graph just missed it:** the files exist and behave as the plan described. Edit the plan to mark Tasks 9-12 as `[x]` complete and add a note like "Implemented; graph linkage tightened in `<rebuild commit>`."
- **Done partially:** some deliverables shipped, others didn't. Write down what's missing.
- **Not done:** no evidence of the work. Write down what's missing.

- [ ] **Step 4: If anything is missing, write a focused follow-up plan.**

Do NOT expand this plan. Create `docs/superpowers/plans/2026-06-26-schedule-recommendations-finish.md` with the specific remaining work. That plan can then be picked up with `superpowers:executing-plans`.

- [ ] **Step 5: Run the rebuild + commit so the graph reflects reality.**

```bash
npm run graphify:rebuild
git add docs/superpowers/plans/ graphify-out/
git commit -m "Reconcile schedule-recommendations plan with shipped state"
```

**Verification:** After this task, re-running the audit query against the graph should show Tasks 9-12 either with code linkage (if implemented) or with the work transferred to a new active plan (if not).

---

## T2: Confirm production observability monitors exist

`ops/axiom-setup.md` and `docs/superpowers/specs/2026-06-20-observability-axiom-design.md` name four monitors that have no code references: "Cron Failed," "AI Failure Rate High," "AI Daily Summary Absent," "Daily Tasks Cron (8:00 UTC)." Either these are configured in the Axiom UI (so the doc is the source of truth, code isn't expected to assert them) or they were never set up. Verify and document.

**Files:**
- Read: `ops/axiom-setup.md`, `docs/superpowers/specs/2026-06-20-observability-axiom-design.md`
- Possibly modify: `ops/axiom-setup.md` to mark each monitor with a confirmation note

**Steps:**

- [ ] **Step 1: Read both docs and list the monitors precisely.**

For each named monitor: extract the exact name, the dataset/source it watches, the alert condition, and the destination (Slack, email, etc.).

- [ ] **Step 2: Open the Axiom dashboard and verify each monitor exists.**

User needs to do this part interactively. The agent's job is to surface the list and the URLs/checks to run; the user confirms in Axiom UI.

- [ ] **Step 3: Update `ops/axiom-setup.md` to reflect ground truth.**

For each monitor: add a line stating "Confirmed configured on YYYY-MM-DD" or "NOT YET CONFIGURED — TODO." This document should be the authoritative reference; if a monitor is missing, file it as a follow-up task in this same doc.

- [ ] **Step 4: If any monitor is missing, configure it.**

Configuration is done through Axiom UI, not code. Capture the steps as a checklist in `ops/axiom-setup.md`. Once configured, edit the doc to flip the marker.

**Verification:** Trigger a synthetic failure in a non-prod environment (or use Axiom's "Test alert" feature) for each monitor and confirm the alert fires to its destination. Document the test in the file.

---

## T3: Close the biggest test-coverage gaps on API routes

The audit found 34 API routes with no `__tests__` directory. Most won't get tests today, but three routes are the highest blast radius and should be covered now.

**Files:**
- Create: `app/api/analyze/__tests__/route.test.ts`
- Create: `app/api/cron/daily-tasks/__tests__/route.test.ts`
- Create: `app/api/user/dismiss-home-screen-prompt/__tests__/route.test.ts`

### T3.1: `dismiss-home-screen-prompt` (smallest, do first)

The route is 18 lines, no logic to speak of. Get the testing pattern down with this one before tackling the bigger routes.

- [ ] **Step 1: Read the route to confirm shape.**

```bash
cat app/api/user/dismiss-home-screen-prompt/route.ts
```

- [ ] **Step 2: Write three tests pinning the contract.**

In `app/api/user/dismiss-home-screen-prompt/__tests__/route.test.ts`:
- Unauthenticated request → 401, no DB write
- Authenticated request → 200, `User.addToHomeScreenDismissedAt` set to a recent timestamp
- Authenticated request when already dismissed → 200 still, timestamp updated to "now" (or at minimum, no error — confirm semantics by reading the route)

Mock `@/lib/auth` and `@/lib/db` like the existing Stripe webhook tests (`app/api/stripe/webhook/__tests__/route.test.ts` is the cleanest template — copy its mock structure).

- [ ] **Step 3: Run + commit.**

```bash
npx vitest run app/api/user/dismiss-home-screen-prompt
git add app/api/user/dismiss-home-screen-prompt/__tests__/
git commit -m "Add unit tests for dismiss-home-screen-prompt route"
```

### T3.2: `cron/daily-tasks` (medium complexity)

This route is 800+ lines and was recently modified for `past_due` exclusion. The test should pin the `past_due` filter and at least one happy-path digest send.

- [ ] **Step 1: Identify the testable seams.**

`runDailyTasks(today, progress)` (around line 103) is the orchestrator. Most of the function fetches from DB + sends emails/pushes. The hardest part is the `reminderUsers` query — that's where the `past_due` exclusion lives.

- [ ] **Step 2: Write tests pinning the contract from the past_due bundle:**

In `app/api/cron/daily-tasks/__tests__/route.test.ts`:
- past_due user is excluded from the `reminderUsers` query (mock `db.user.findMany` and assert the `where.AND[0].AND[0].planStatus.notIn` includes `"past_due"`)
- past_due user's digest email is NOT sent (mock the user with planStatus past_due, assert `resend.emails.send` not called)
- Active user with overdue tasks DOES get the digest email
- `lastNotifiedAt` is updated after a successful send

Mock `@/lib/db`, `@/lib/email`, `@capacitor/push-notifications`, and any weather call. Reference `app/api/stripe/webhook/__tests__/route.test.ts` for the mock structure.

- [ ] **Step 3: Run + commit.**

### T3.3: `analyze` route (biggest blast radius)

Most expensive route in the system. Even a basic happy-path + one rate-limit test would be huge.

- [ ] **Step 1: Identify the externals to mock.**

`analyzeImages`, `validateLawnImages`, `generateScheduleRecommendation` from `@/lib/claude`; `getWeatherByZip` from `@/lib/weather`; `checkRateLimit` from `@/lib/rate-limit`; `db` from `@/lib/db`; `emit*` from `@/lib/observability/events`.

- [ ] **Step 2: Write tests pinning the contract:**

- Unauthenticated → 401
- Rate-limited → 429
- Missing `sectionId` or empty `photos[]` → 400
- A non-owned photo URL → 400 (`invalid_photo_url`)
- Photo count over `MAX_PHOTOS` → 400
- Per-kind cap exceeded → 400
- Plan quota exhausted → 403 (`analysis_limit_reached`)
- Happy path: returns `analysis`, `result`, `plan`, `effective`; persists `lawnAnalysis` with the right shape; emits two telemetry events
- Trial-converted user uses `analysisQuotaResetAt` as the cutoff (`analysisCutoff` already tested in `lib/__tests__/subscription.test.ts`; this test just confirms the route passes it through)

- [ ] **Step 3: Run + commit.**

**Verification (for all three):** `npx vitest run` is clean; coverage of the three routes is no longer 0%.

---

## T4: Reconcile stale design docs

The graph found 11 concepts in design docs that have no code linkage. Some are stale (the doc never got updated when the code shifted), some are linkage misses (the code is there, graphify just couldn't tie them). Triage each.

**Files:** likely edits in `docs/superpowers/plans/`, `docs/superpowers/specs/`, `ops/axiom-setup.md`. T4.1 confirmed stale by audit; T4.2-T4.3 likely linkage issues.

### T4.1: `docs/superpowers/plans/2026-06-10-monetization.md`

Pre-billing-rework. References "Subscription Plan Gating" and "Stripe Security Requirements" concepts that the current code (post-`past_due` work) implements differently.

- [ ] Read the plan.
- [ ] Decide: is anything in it still aspirational (i.e., not yet shipped)? If no, add a top-of-file note: "Superseded by `docs/billing-behavior-reference.md` on 2026-06-24. Kept for historical context."
- [ ] If something in it IS still aspirational, transfer that item to a new follow-up plan and then add the supersession note.

### T4.2: `docs/superpowers/specs/2026-06-21-schedule-recommendations-design.md`

Concepts "Effective Schedule Computation Concept" and "Plan Gating Concept" are flagged. `lib/schedules/effective-schedule.ts` and `lib/can-set-section-schedule` both clearly exist.

- [ ] Open the spec, search for those two concepts.
- [ ] Confirm the code matches. If yes, this is a graphify linkage gap — no doc change needed. Run `npm run graphify:rebuild` after T1 to see if the linkage tightens.
- [ ] If the code doesn't match, file a follow-up plan with the specific drift.

### T4.3: `ops/axiom-setup.md` monitors

Covered by T2. Resolution there resolves these.

### T4.4: `docs/superpowers/specs/2026-06-20-observability-axiom-design.md`

"Cron Failure Alert Monitor" and "AI Failure Rate Alert Monitor" — same situation as T4.3, addressed by T2.

**Verification:** After this task, re-running the audit query should show 0-3 orphan concepts (a handful is expected; the goal is to eliminate the clearly-stale ones, not chase the linkage to zero).

---

## After all tasks

- [ ] Run `npm run graphify:rebuild` once at the end and commit the regenerated graph.
- [ ] If T1 surfaced unfinished work, the follow-up plan goes through its own normal flow — do NOT bolt it onto this plan.
- [ ] Update `AGENTS.md` if any of the work changes how a future session should approach things (e.g., new test patterns to reference).
