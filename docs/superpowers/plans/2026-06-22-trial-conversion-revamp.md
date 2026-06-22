# Trial Conversion Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase trial → paid conversion by extending the trial to 21 days (28 with engagement bonus), adding visible-but-locked feature teasers, and orchestrating push + email nudges that walk users through the engagement loop before the wall lands.

**Architecture:** Five concerns: (1) DB schema additions on `User` for idempotency flags, (2) engagement detection wired into existing schedule-apply and task-complete write paths, (3) a new `TrialProgressCard` on the dashboard plus locked teasers in existing UI, (4) extended `trial-reminders` cron for day-5/10/14 nudges and trial-end notifications, (5) new grace-period warning cron and email/push touchpoints.

**Tech Stack:** Next.js 16 App Router, Prisma 5 + PostgreSQL (Supabase), Vitest, Resend, Firebase Admin (push), Tailwind CSS, React.

**Design spec:** `docs/superpowers/specs/2026-06-22-trial-conversion-revamp-design.md`

---

## File structure

**Created:**
- `prisma/migrations/<timestamp>_trial_revamp/migration.sql`
- `components/dashboard/TrialProgressCard.tsx`
- `components/dashboard/__tests__/TrialProgressCard.test.tsx`
- `components/yard/YardAnalysisTimeline.tsx`
- `app/api/cron/account-deletion-warnings/route.ts`
- `app/api/cron/account-deletion-warnings/__tests__/route.test.ts`
- `lib/__tests__/trial-engagement.test.ts`

**Modified:**
- `prisma/schema.prisma`
- `lib/time.ts`
- `lib/subscription.ts`
- `lib/email.ts`
- `app/api/auth/register/route.ts`
- `app/_actions/tasks.ts`
- `app/api/sections/[sectionId]/schedule/apply/route.ts`
- `app/api/sections/[sectionId]/watering/apply/route.ts`
- `app/api/sections/[sectionId]/mowing/apply/route.ts`
- `app/api/cron/trial-reminders/route.ts`
- `app/api/cron/daily-tasks/route.ts`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/yard/page.tsx`
- `app/(dashboard)/yard/[id]/page.tsx`
- `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`
- `app/pricing/page.tsx`
- `components/dashboard/LockedTaskCard.tsx`
- `components/dashboard/TaskList.tsx`
- `vercel.json`

---

## Task 1: Database migration for trial engagement and nudge flags

**Files:**
- Create: `prisma/migrations/<timestamp>_trial_revamp/migration.sql`
- Modify: `prisma/schema.prisma` (User model)

- [ ] **Step 1: Add fields to `User` model in `prisma/schema.prisma`**

Locate the `User` model and add after the existing `pausedUntil` field:

```prisma
  // Trial engagement extension — set when user completes the +7 day bonus criteria
  trialEngagementBonusGrantedAt DateTime?

  // Trial nudge idempotency flags
  day5NudgeSentAt   DateTime?
  day10NudgeSentAt  DateTime?
  day14SecondAnalysisPromptSentAt DateTime?

  // Grace period warning idempotency flags
  graceDay14EmailSentAt DateTime?
  graceDay7EmailSentAt  DateTime?
  graceDay2EmailSentAt  DateTime?
  gracePush7SentAt      DateTime?
  gracePush1SentAt      DateTime?
  trialEndedPushSentAt  DateTime?
```

- [ ] **Step 2: Generate migration SQL**

Create `prisma/migrations/20260622120000_trial_revamp/migration.sql` (use a timestamp at least one higher than the most recent existing migration):

```sql
ALTER TABLE "User"
  ADD COLUMN "trialEngagementBonusGrantedAt" TIMESTAMP(3),
  ADD COLUMN "day5NudgeSentAt" TIMESTAMP(3),
  ADD COLUMN "day10NudgeSentAt" TIMESTAMP(3),
  ADD COLUMN "day14SecondAnalysisPromptSentAt" TIMESTAMP(3),
  ADD COLUMN "graceDay14EmailSentAt" TIMESTAMP(3),
  ADD COLUMN "graceDay7EmailSentAt" TIMESTAMP(3),
  ADD COLUMN "graceDay2EmailSentAt" TIMESTAMP(3),
  ADD COLUMN "gracePush7SentAt" TIMESTAMP(3),
  ADD COLUMN "gracePush1SentAt" TIMESTAMP(3),
  ADD COLUMN "trialEndedPushSentAt" TIMESTAMP(3);
```

Per project convention (codebase-wide 2026-06-16 RLS lockdown), new public tables get RLS enabled. The `User` table already has RLS enabled — no extra RLS work needed here since we are only adding columns to an existing table.

- [ ] **Step 3: Apply migration locally and regenerate the Prisma client**

Run:
```bash
DIRECT_URL=postgresql://x:y@localhost:5432/x npx prisma generate
npx prisma migrate dev --name trial_revamp
```
Expected: migration creates 10 new columns on `User`, Prisma client regenerates with the new fields available.

- [ ] **Step 4: Verify schema by reading generated types**

Run:
```bash
grep -A2 "trialEngagementBonusGrantedAt" node_modules/.prisma/client/index.d.ts | head -10
```
Expected: shows `trialEngagementBonusGrantedAt: Date | null` in the User type.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add trial engagement and nudge idempotency flags to User"
```

---

## Task 2: Bump trial length to 21 days

**Files:**
- Modify: `lib/time.ts`
- Modify: `app/api/auth/register/route.ts`

- [ ] **Step 1: Add `TRIAL_DAYS` constant to `lib/time.ts`**

Append to the end of `lib/time.ts`:

```ts
// Trial length in days. Engagement extension adds 7 more (see lib/subscription.ts).
export const TRIAL_DAYS = 21;
export const TRIAL_ENGAGEMENT_BONUS_DAYS = 7;
```

- [ ] **Step 2: Use `TRIAL_DAYS` in `app/api/auth/register/route.ts`**

In the import line, add `TRIAL_DAYS` alongside `DAY_MS, HOUR_MS`:

```ts
import { DAY_MS, HOUR_MS, TRIAL_DAYS } from "@/lib/time";
```

Replace:
```ts
trialEndsAt: new Date(Date.now() + 14 * DAY_MS),
```
with:
```ts
trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
```

- [ ] **Step 3: Run any register tests**

Run:
```bash
npx vitest run app/api/auth/register 2>&1 | tail -20
```
Expected: tests pass (if any exist for register; if no test file exists, this step is informational only).

- [ ] **Step 4: Commit**

```bash
git add lib/time.ts app/api/auth/register/route.ts
git commit -m "Extend default trial length to 21 days"
```

---

## Task 3: Engagement detection helper

**Files:**
- Modify: `lib/subscription.ts`
- Create: `lib/__tests__/trial-engagement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/trial-engagement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeEngagementStatus } from "@/lib/subscription";

describe("computeEngagementStatus", () => {
  const baseUser = {
    plan: "trial",
    planStatus: "trialing",
    trialEndsAt: new Date(Date.now() + 14 * 86400 * 1000),
    trialEngagementBonusGrantedAt: null,
  };

  it("returns scheduleSet=false when no yards or sections have schedule", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: false, anyTaskCompleted: false });
    expect(r.scheduleSet).toBe(false);
    expect(r.taskCompleted).toBe(false);
    expect(r.bonusEarned).toBe(false);
  });

  it("returns scheduleSet=true when anyScheduleSet=true", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: true, anyTaskCompleted: false });
    expect(r.scheduleSet).toBe(true);
    expect(r.bonusEarned).toBe(false);
  });

  it("returns bonusEarned=false until both schedule and task are set", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: true, anyTaskCompleted: false });
    expect(r.bonusEarned).toBe(false);
  });

  it("returns bonusEarned=true when both schedule and task are set and bonus not yet granted", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: true, anyTaskCompleted: true });
    expect(r.bonusEarned).toBe(true);
  });

  it("returns bonusEarned=false (already granted) when trialEngagementBonusGrantedAt is set", () => {
    const u = { ...baseUser, trialEngagementBonusGrantedAt: new Date() };
    const r = computeEngagementStatus(u, { anyScheduleSet: true, anyTaskCompleted: true });
    expect(r.bonusEarned).toBe(false);
    expect(r.bonusAlreadyGranted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run lib/__tests__/trial-engagement.test.ts 2>&1 | tail -20
```
Expected: FAIL with "computeEngagementStatus is not a function" or import error.

- [ ] **Step 3: Add `computeEngagementStatus` to `lib/subscription.ts`**

At the top, expand the `SubscriptionUser` type to allow the new field, and add the helpers. Replace:

```ts
export type SubscriptionUser = {
  plan: Plan | string;
  planStatus: PlanStatus | string;
  trialEndsAt: Date | null;
  currentPeriodEnd?: Date | null;
  pausedUntil?: Date | null;
};
```

with:

```ts
export type SubscriptionUser = {
  plan: Plan | string;
  planStatus: PlanStatus | string;
  trialEndsAt: Date | null;
  currentPeriodEnd?: Date | null;
  pausedUntil?: Date | null;
  trialEngagementBonusGrantedAt?: Date | null;
};

export interface EngagementSignals {
  anyScheduleSet: boolean;
  anyTaskCompleted: boolean;
}

export interface EngagementStatus {
  scheduleSet: boolean;
  taskCompleted: boolean;
  bonusEarned: boolean;          // both criteria met AND bonus not yet granted
  bonusAlreadyGranted: boolean;
}

export function computeEngagementStatus(
  user: SubscriptionUser,
  signals: EngagementSignals,
): EngagementStatus {
  const bonusAlreadyGranted = user.trialEngagementBonusGrantedAt != null;
  const scheduleSet = signals.anyScheduleSet;
  const taskCompleted = signals.anyTaskCompleted;
  return {
    scheduleSet,
    taskCompleted,
    bonusAlreadyGranted,
    bonusEarned: scheduleSet && taskCompleted && !bonusAlreadyGranted,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run lib/__tests__/trial-engagement.test.ts 2>&1 | tail -20
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts lib/__tests__/trial-engagement.test.ts
git commit -m "Add computeEngagementStatus helper for trial bonus eligibility"
```

---

## Task 4: Engagement signal queries and bonus grant

**Files:**
- Modify: `lib/subscription.ts`
- Modify: `lib/__tests__/trial-engagement.test.ts`

- [ ] **Step 1: Write the failing test for the grant helper**

Append to `lib/__tests__/trial-engagement.test.ts`:

```ts
import { db } from "@/lib/db";
import { grantEngagementBonusIfEligible } from "@/lib/subscription";

describe("grantEngagementBonusIfEligible", () => {
  it("is idempotent — returns granted=false when already granted", async () => {
    // This is a unit-level expectation. The full DB integration is covered by
    // higher-level tests on the write endpoints. We assert the helper's
    // observable behavior with a stubbed user lookup.
    const userId = "stub-user-id";
    const fakeUser = {
      id: userId,
      plan: "trial",
      planStatus: "trialing",
      trialEndsAt: new Date(),
      trialEngagementBonusGrantedAt: new Date(),
    };
    // Stub Prisma findUnique to return the already-granted user.
    const orig = db.user.findUnique;
    db.user.findUnique = (async () => fakeUser) as typeof db.user.findUnique;
    try {
      const result = await grantEngagementBonusIfEligible(userId);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe("already_granted");
    } finally {
      db.user.findUnique = orig;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run lib/__tests__/trial-engagement.test.ts 2>&1 | tail -10
```
Expected: FAIL — `grantEngagementBonusIfEligible is not a function`.

- [ ] **Step 3: Implement `userHasAnySchedule`, `userHasAnyCompletedTask`, `grantEngagementBonusIfEligible`**

Append to `lib/subscription.ts`:

```ts
import { db } from "@/lib/db";
import { DAY_MS, TRIAL_ENGAGEMENT_BONUS_DAYS } from "@/lib/time";

export async function userHasAnySchedule(userId: string): Promise<boolean> {
  const result = await db.yard.findFirst({
    where: {
      userId,
      OR: [
        { wateringDays: { isEmpty: false } },
        { mowingDays: { isEmpty: false } },
        { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
      ],
    },
    select: { id: true },
  });
  return result != null;
}

export async function userHasAnyCompletedTask(userId: string): Promise<boolean> {
  const result = await db.lawnTask.findFirst({
    where: {
      completedAt: { not: null },
      yardSection: { yard: { userId } },
    },
    select: { id: true },
  });
  return result != null;
}

export type GrantResult =
  | { granted: true; newTrialEndsAt: Date }
  | { granted: false; reason: "already_granted" | "not_trialing" | "not_eligible" | "user_not_found" };

export async function grantEngagementBonusIfEligible(userId: string): Promise<GrantResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      trialEngagementBonusGrantedAt: true,
    },
  });
  if (!user) return { granted: false, reason: "user_not_found" };
  if (user.trialEngagementBonusGrantedAt) return { granted: false, reason: "already_granted" };
  const isTrial = user.planStatus === "trialing" || user.plan === "trial";
  if (!isTrial) return { granted: false, reason: "not_trialing" };

  const [scheduleSet, taskCompleted] = await Promise.all([
    userHasAnySchedule(userId),
    userHasAnyCompletedTask(userId),
  ]);
  if (!scheduleSet || !taskCompleted) return { granted: false, reason: "not_eligible" };

  const newTrialEndsAt = new Date(
    (user.trialEndsAt?.getTime() ?? Date.now()) + TRIAL_ENGAGEMENT_BONUS_DAYS * DAY_MS,
  );
  await db.user.update({
    where: { id: userId },
    data: {
      trialEndsAt: newTrialEndsAt,
      trialEngagementBonusGrantedAt: new Date(),
    },
  });
  return { granted: true, newTrialEndsAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run lib/__tests__/trial-engagement.test.ts 2>&1 | tail -10
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts lib/__tests__/trial-engagement.test.ts
git commit -m "Add engagement signal queries and idempotent bonus grant"
```

---

## Task 5: Wire engagement check into schedule apply endpoints

**Files:**
- Modify: `app/api/sections/[sectionId]/schedule/apply/route.ts`
- Modify: `app/api/sections/[sectionId]/watering/apply/route.ts`
- Modify: `app/api/sections/[sectionId]/mowing/apply/route.ts`

- [ ] **Step 1: Add engagement-check call to combined schedule/apply route**

In `app/api/sections/[sectionId]/schedule/apply/route.ts`, add the import:

```ts
import { grantEngagementBonusIfEligible } from "@/lib/subscription";
```

After the successful database write (after the existing `db.$transaction` or final update block), and before the response is returned, add:

```ts
// Fire-and-forget engagement bonus check. Failure here must not break the
// write path the user is waiting on; log only.
grantEngagementBonusIfEligible(session.user.id).catch((err) => {
  logger.warn("engagement-bonus: grant check failed", {
    userId: session.user.id,
    err: err instanceof Error ? err.message : String(err),
  });
});
```

Verify `logger` is imported from `@/lib/observability/logger` — it should already be (the file uses `withAxiom`). If not, add the import.

- [ ] **Step 2: Repeat for watering/apply and mowing/apply routes**

In `app/api/sections/[sectionId]/watering/apply/route.ts` and `app/api/sections/[sectionId]/mowing/apply/route.ts`, perform the same change: import `grantEngagementBonusIfEligible`, add the same fire-and-forget block after the `db.$transaction` and before the `NextResponse.json(...)` return.

- [ ] **Step 3: Run existing route tests**

Run:
```bash
npx vitest run app/api/sections 2>&1 | tail -30
```
Expected: PASS — existing tests should not regress; engagement call is async fire-and-forget.

- [ ] **Step 4: Commit**

```bash
git add app/api/sections/
git commit -m "Trigger engagement bonus check on schedule apply"
```

---

## Task 6: Wire engagement check into task completion action

**Files:**
- Modify: `app/_actions/tasks.ts`

- [ ] **Step 1: Update `updateTaskStatusAction` to fire the check**

In `app/_actions/tasks.ts`, add the import at the top:

```ts
import { grantEngagementBonusIfEligible } from "@/lib/subscription";
```

After the `db.lawnTask.update(...)` call and before `revalidatePath("/dashboard")`, add:

```ts
if (parsed.data === "completed") {
  grantEngagementBonusIfEligible(session.user.id).catch(() => {
    // Server action — silently ignore engagement check failures.
  });
}
```

- [ ] **Step 2: Smoke test in isolation**

Run:
```bash
npx vitest run app/_actions 2>&1 | tail -10
```
Expected: PASS (or, if no tests exist for tasks.ts, the command should complete without errors).

- [ ] **Step 3: Commit**

```bash
git add app/_actions/tasks.ts
git commit -m "Trigger engagement bonus check on task completion"
```

---

## Task 7: TrialProgressCard component

**Files:**
- Create: `components/dashboard/TrialProgressCard.tsx`
- Create: `components/dashboard/__tests__/TrialProgressCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/__tests__/TrialProgressCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TrialProgressCard } from "../TrialProgressCard";

describe("TrialProgressCard", () => {
  const futureDate = new Date(Date.now() + 14 * 86400 * 1000);

  it("renders neither-done state when no progress", () => {
    render(
      <TrialProgressCard
        scheduleSet={false}
        taskCompleted={false}
        bonusAlreadyGranted={false}
        trialEndsAt={futureDate}
      />
    );
    expect(screen.getByText(/Earn 7 more trial days/i)).toBeInTheDocument();
    expect(screen.getByText(/Set a watering or mowing schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete a task/i)).toBeInTheDocument();
  });

  it("renders schedule-done state with one checkbox checked", () => {
    render(
      <TrialProgressCard
        scheduleSet={true}
        taskCompleted={false}
        bonusAlreadyGranted={false}
        trialEndsAt={futureDate}
      />
    );
    expect(screen.getByText(/Schedule set/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete a task/i)).toBeInTheDocument();
  });

  it("renders celebration state when bonus already granted", () => {
    render(
      <TrialProgressCard
        scheduleSet={true}
        taskCompleted={true}
        bonusAlreadyGranted={true}
        trialEndsAt={futureDate}
      />
    );
    expect(screen.getByText(/You earned 7 more trial days/i)).toBeInTheDocument();
  });

  it("renders nothing when bonus granted more than 24 hours ago", () => {
    const oldGrant = new Date(Date.now() - 25 * 3600 * 1000);
    const { container } = render(
      <TrialProgressCard
        scheduleSet={true}
        taskCompleted={true}
        bonusAlreadyGranted={true}
        bonusGrantedAt={oldGrant}
        trialEndsAt={futureDate}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run components/dashboard/__tests__/TrialProgressCard.test.tsx 2>&1 | tail -10
```
Expected: FAIL — cannot find module `../TrialProgressCard`.

- [ ] **Step 3: Create the component**

Create `components/dashboard/TrialProgressCard.tsx`:

```tsx
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import NotInApp from "@/components/NotInApp";

interface Props {
  scheduleSet: boolean;
  taskCompleted: boolean;
  bonusAlreadyGranted: boolean;
  bonusGrantedAt?: Date | null;
  trialEndsAt: Date | null;
}

const CELEBRATION_WINDOW_MS = 24 * 3600 * 1000;

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function TrialProgressCard({
  scheduleSet,
  taskCompleted,
  bonusAlreadyGranted,
  bonusGrantedAt,
  trialEndsAt,
}: Props) {
  // Hide once the 24h celebration window has passed.
  if (bonusAlreadyGranted && bonusGrantedAt) {
    const ageMs = Date.now() - bonusGrantedAt.getTime();
    if (ageMs > CELEBRATION_WINDOW_MS) return null;
  }

  // Celebration state
  if (bonusAlreadyGranted) {
    return (
      <NotInApp>
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm font-semibold text-green-800">
            🎉 You earned 7 more trial days
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            Trial now ends {formatDate(trialEndsAt)}.
          </p>
        </div>
      </NotInApp>
    );
  }

  const projectedEnd = trialEndsAt
    ? new Date(trialEndsAt.getTime() + 7 * 86400 * 1000)
    : null;

  return (
    <NotInApp>
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-emerald-900">
          🌱 Earn 7 more trial days
        </p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-start gap-2">
            {scheduleSet
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              : <Circle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            <span className={scheduleSet ? "text-emerald-900" : "text-emerald-800"}>
              {scheduleSet
                ? "Schedule set"
                : <>Set a watering or mowing schedule</>}
            </span>
          </li>
          <li className="flex items-start gap-2">
            {taskCompleted
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              : <Circle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            <span className={taskCompleted ? "text-emerald-900" : "text-emerald-800"}>
              {taskCompleted
                ? "Task completed"
                : "Complete a task — mark any task done from your yard tasks list"}
            </span>
          </li>
        </ul>
        {projectedEnd && (
          <p className="text-xs text-emerald-700">
            Complete both to extend your trial to {formatDate(projectedEnd)}.
          </p>
        )}
      </div>
    </NotInApp>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run components/dashboard/__tests__/TrialProgressCard.test.tsx 2>&1 | tail -10
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/TrialProgressCard.tsx components/dashboard/__tests__/TrialProgressCard.test.tsx
git commit -m "Add TrialProgressCard component for trial engagement bonus"
```

---

## Task 8: Render TrialProgressCard on dashboard

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Extend the user fetch to include the trial bonus fields**

In `app/(dashboard)/dashboard/page.tsx`, expand the `db.user.findUnique` select:

```ts
const user = await db.user.findUnique({
  where: { id: session.user.id },
  select: {
    weatherWidgetCollapsed: true,
    plan: true,
    planStatus: true,
    trialEndsAt: true,
    currentPeriodEnd: true,
    pausedUntil: true,
    trialEngagementBonusGrantedAt: true,
  },
});
```

- [ ] **Step 2: Compute engagement signals when on trial**

Below the existing `tasks` computation and before the `return`, add:

```ts
import { computeEngagementStatus, userHasAnySchedule, userHasAnyCompletedTask } from "@/lib/subscription";

// ... existing code ...

const isTrial = user?.planStatus === "trialing" || user?.plan === "trial";
let engagement = null as null | {
  scheduleSet: boolean;
  taskCompleted: boolean;
  bonusAlreadyGranted: boolean;
  bonusGrantedAt: Date | null;
  trialEndsAt: Date | null;
};
if (isTrial && user) {
  const [anyScheduleSet, anyTaskCompleted] = await Promise.all([
    userHasAnySchedule(session.user.id),
    userHasAnyCompletedTask(session.user.id),
  ]);
  const status = computeEngagementStatus(user, { anyScheduleSet, anyTaskCompleted });
  engagement = {
    scheduleSet: status.scheduleSet,
    taskCompleted: status.taskCompleted,
    bonusAlreadyGranted: status.bonusAlreadyGranted,
    bonusGrantedAt: user.trialEngagementBonusGrantedAt,
    trialEndsAt: user.trialEndsAt,
  };
}
```

- [ ] **Step 3: Render the card above the deletion banner**

Add a new import:
```ts
import { TrialProgressCard } from "@/components/dashboard/TrialProgressCard";
```

In the JSX return, immediately above the existing `daysUntilDeletion` block (line 116), add:

```tsx
{engagement && (
  <TrialProgressCard
    scheduleSet={engagement.scheduleSet}
    taskCompleted={engagement.taskCompleted}
    bonusAlreadyGranted={engagement.bonusAlreadyGranted}
    bonusGrantedAt={engagement.bonusGrantedAt}
    trialEndsAt={engagement.trialEndsAt}
  />
)}
```

- [ ] **Step 4: Verify the dashboard renders (smoke)**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "dashboard/page" || echo "no type errors"
```
Expected: "no type errors" — confirms types line up.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx
git commit -m "Render TrialProgressCard on dashboard for trialing users"
```

---

## Task 9: Day-5 schedule nudge (trial-reminders cron extension)

**Files:**
- Modify: `app/api/cron/trial-reminders/route.ts`
- Modify: `lib/email.ts`

- [ ] **Step 1: Add an email builder for the day-5 nudge**

Append to `lib/email.ts`:

```ts
export function buildDay5ScheduleNudgeEmail(opts: {
  userName: string;
  scheduleSetupUrl: string;
}): { subject: string; html: string } {
  const { userName, scheduleSetupUrl } = opts;
  const subject = "Set your schedule to earn 7 more trial days";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Setting your watering and mowing schedule earns you <strong>7 more days of free trial</strong>.
    It also unlocks the reminders that keep your yard on track without you having to think about it.
  </p>
  <p style="margin:24px 0;">
    <a href="${scheduleSetupUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
      Set up my schedule
    </a>
  </p>
  <p style="color:#6b7280;font-size:13px;">
    You will earn the bonus once you also complete one of your recommended tasks.
  </p>
</body>
</html>`;
  return { subject, html };
}
```

The `escapeHtml` helper already exists in this file. Verify it does by searching for `function escapeHtml` — if missing, follow the existing pattern in `buildTrialReminderEmail` (it uses one).

- [ ] **Step 2: Extend `trial-reminders` cron to send day-5 nudges**

In `app/api/cron/trial-reminders/route.ts`, add imports for the new email builder and the engagement check:

```ts
import { resend, buildTrialReminderEmail, buildDay5ScheduleNudgeEmail } from "@/lib/email";
import { userHasAnySchedule } from "@/lib/subscription";
import { TRIAL_DAYS, DAY_MS } from "@/lib/time";
import { sendPushToUser } from "@/lib/push/send";
```

Inside the `try {` block, before the existing `for (const daysLeft of reminderDays)` loop, add a new section for day-5 nudges. Day 5 of the trial means `trialEndsAt - 16 days` (assuming 21-day trial). Use absolute days from signup for correctness — we identify "day 5 of trial" as users whose remaining time is `TRIAL_DAYS - 5 = 16` days:

```ts
// Day-5 nudge: users who have not set any schedule yet.
const day5TargetDaysLeft = TRIAL_DAYS - 5; // 16
const day5Target = addDays(today, day5TargetDaysLeft);
const day5Users = await db.user.findMany({
  where: {
    planStatus: "trialing",
    day5NudgeSentAt: null,
    trialEngagementBonusGrantedAt: null,
    trialEndsAt: { gte: day5Target, lt: addDays(day5Target, 1) },
  },
  select: { id: true, email: true, name: true },
});
await mapWithConcurrency(day5Users, EMAIL_CONCURRENCY, async (user) => {
  if (!user.email) return;
  const hasSchedule = await userHasAnySchedule(user.id);
  if (hasSchedule) return; // condition cleared — nudge not needed.
  const { subject, html } = buildDay5ScheduleNudgeEmail({
    userName: user.name?.split(" ")[0] ?? "there",
    scheduleSetupUrl: `${baseUrl}/dashboard`,
  });
  try {
    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.com>",
      to: user.email,
      subject,
      html,
    });
    sent++;
  } catch (err) {
    failed++;
    logger.error("trial-reminders: day5 email send failed", {
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    await sendPushToUser(user.id, {
      title: "Earn 7 more trial days",
      body: "Set your watering or mowing schedule to unlock the bonus.",
      data: { kind: "trial_day5" },
    });
  } catch {
    /* push failure non-fatal */
  }
  await db.user.update({
    where: { id: user.id },
    data: { day5NudgeSentAt: new Date() },
  });
});
```

- [ ] **Step 3: Smoke-test by running existing cron tests**

Run:
```bash
npx vitest run app/api/cron/trial-reminders 2>&1 | tail -20
```
Expected: PASS (or no test file — informational). Manually exercising the cron requires hitting the route with the cron auth header in dev.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts app/api/cron/trial-reminders/route.ts
git commit -m "Send day-5 push and email nudges to trial users without a schedule"
```

---

## Task 10: Day-10 task-completion nudge (trial-reminders cron extension)

**Files:**
- Modify: `app/api/cron/trial-reminders/route.ts`
- Modify: `lib/email.ts`

- [ ] **Step 1: Add an email builder for the day-10 nudge**

Append to `lib/email.ts`:

```ts
export function buildDay10TaskNudgeEmail(opts: {
  userName: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const { userName, dashboardUrl } = opts;
  const subject = "Complete a task to earn 7 more trial days";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Your schedule is set — nice work. Mark any one of your recommended tasks as done to earn
    <strong>7 more days of free trial</strong>.
  </p>
  <p style="margin:24px 0;">
    <a href="${dashboardUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
      Open my dashboard
    </a>
  </p>
</body>
</html>`;
  return { subject, html };
}
```

- [ ] **Step 2: Add the day-10 send block in `trial-reminders/route.ts`**

Import the new builder:
```ts
import { resend, buildTrialReminderEmail, buildDay5ScheduleNudgeEmail, buildDay10TaskNudgeEmail } from "@/lib/email";
import { userHasAnySchedule, userHasAnyCompletedTask } from "@/lib/subscription";
```

After the day-5 block, add:

```ts
// Day-10 nudge: users with a schedule but no completed task.
const day10TargetDaysLeft = TRIAL_DAYS - 10; // 11
const day10Target = addDays(today, day10TargetDaysLeft);
const day10Users = await db.user.findMany({
  where: {
    planStatus: "trialing",
    day10NudgeSentAt: null,
    trialEngagementBonusGrantedAt: null,
    trialEndsAt: { gte: day10Target, lt: addDays(day10Target, 1) },
  },
  select: { id: true, email: true, name: true },
});
await mapWithConcurrency(day10Users, EMAIL_CONCURRENCY, async (user) => {
  if (!user.email) return;
  const [hasSchedule, hasTask] = await Promise.all([
    userHasAnySchedule(user.id),
    userHasAnyCompletedTask(user.id),
  ]);
  if (!hasSchedule || hasTask) return; // either condition makes the nudge irrelevant.
  const { subject, html } = buildDay10TaskNudgeEmail({
    userName: user.name?.split(" ")[0] ?? "there",
    dashboardUrl: `${baseUrl}/dashboard`,
  });
  try {
    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.com>",
      to: user.email,
      subject,
      html,
    });
    sent++;
  } catch (err) {
    failed++;
    logger.error("trial-reminders: day10 email send failed", {
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    await sendPushToUser(user.id, {
      title: "Almost there",
      body: "Mark one task as done to earn 7 more trial days.",
      data: { kind: "trial_day10" },
    });
  } catch { /* non-fatal */ }
  await db.user.update({
    where: { id: user.id },
    data: { day10NudgeSentAt: new Date() },
  });
});
```

- [ ] **Step 3: Smoke test**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "trial-reminders" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts app/api/cron/trial-reminders/route.ts
git commit -m "Send day-10 push and email nudges for task-completion bonus criteria"
```

---

## Task 11: Day-14 second-analysis prompt (trial-reminders cron extension)

**Files:**
- Modify: `app/api/cron/trial-reminders/route.ts`
- Modify: `lib/email.ts`

- [ ] **Step 1: Add a builder for the second-analysis email**

Append to `lib/email.ts`:

```ts
export function buildSecondAnalysisPromptEmail(opts: {
  userName: string;
  analyzeUrl: string;
}): { subject: string; html: string } {
  const { userName, analyzeUrl } = opts;
  const subject = "Take a progress photo of your yard";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Two weeks in — take a progress photo of your yard to see what has changed since your first analysis.
  </p>
  <p style="margin:24px 0;">
    <a href="${analyzeUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
      Take progress photo
    </a>
  </p>
</body>
</html>`;
  return { subject, html };
}
```

- [ ] **Step 2: Add the day-14 send block**

Import:
```ts
import { ..., buildSecondAnalysisPromptEmail } from "@/lib/email";
```

After the day-10 block, add:

```ts
// Day-14 prompt: nudge a second analysis for the "progress" aha.
const day14TargetDaysLeft = TRIAL_DAYS - 14; // 7
const day14Target = addDays(today, day14TargetDaysLeft);
const day14Users = await db.user.findMany({
  where: {
    planStatus: "trialing",
    day14SecondAnalysisPromptSentAt: null,
    trialEndsAt: { gte: day14Target, lt: addDays(day14Target, 1) },
  },
  select: { id: true, email: true, name: true },
});
await mapWithConcurrency(day14Users, EMAIL_CONCURRENCY, async (user) => {
  if (!user.email) return;
  const { subject, html } = buildSecondAnalysisPromptEmail({
    userName: user.name?.split(" ")[0] ?? "there",
    analyzeUrl: `${baseUrl}/analyze`,
  });
  try {
    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.com>",
      to: user.email,
      subject,
      html,
    });
    sent++;
  } catch (err) {
    failed++;
    logger.error("trial-reminders: day14 email send failed", {
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    await sendPushToUser(user.id, {
      title: "Take a progress photo",
      body: "See what has changed in your yard since your first analysis.",
      data: { kind: "trial_day14" },
    });
  } catch { /* non-fatal */ }
  await db.user.update({
    where: { id: user.id },
    data: { day14SecondAnalysisPromptSentAt: new Date() },
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts app/api/cron/trial-reminders/route.ts
git commit -m "Prompt second analysis on day 14 of trial via push and email"
```

---

## Task 12: Final trial-end push on expiry day

**Files:**
- Modify: `app/api/cron/trial-reminders/route.ts`

- [ ] **Step 1: Add the day-0 push notification**

The existing email cadence covers T-7 and T-1 day emails. Add a push notification on the day of expiry (the day `trialEndsAt` matches `today`). After the day-14 block in `trial-reminders/route.ts`:

```ts
// Day-0 trial-end push notification: catches users on the wall day.
const expiringToday = await db.user.findMany({
  where: {
    planStatus: "trialing",
    trialEndedPushSentAt: null,
    trialEndsAt: { gte: today, lt: addDays(today, 1) },
  },
  select: { id: true },
});
await mapWithConcurrency(expiringToday, EMAIL_CONCURRENCY, async (user) => {
  try {
    await sendPushToUser(user.id, {
      title: "Your free trial ended",
      body: "Upgrade to keep your schedule and reminders running.",
      data: { kind: "trial_ended" },
    });
  } catch { /* non-fatal */ }
  await db.user.update({
    where: { id: user.id },
    data: { trialEndedPushSentAt: new Date() },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/trial-reminders/route.ts
git commit -m "Push trial-end notification on expiry day"
```

---

## Task 13: Schedule reminder cron skips expired users

**Files:**
- Modify: `app/api/cron/daily-tasks/route.ts`

- [ ] **Step 1: Add expired-user filter to the `reminderUsers` query**

In `app/api/cron/daily-tasks/route.ts`, locate the `reminderUsers` query (around line 156). Currently:

```ts
const reminderUsers = await db.user.findMany({
  where: {
    yards: {
      some: {
        OR: [
          { wateringDays: { isEmpty: false } },
          { mowingDays: { isEmpty: false } },
          { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
        ],
      },
    },
  },
  select: { ... },
});
```

Add a filter that excludes effectively-expired users. The cleanest representation in the Prisma `where` clause:

```ts
const reminderUsers = await db.user.findMany({
  where: {
    AND: [
      {
        OR: [
          // Active paid users.
          { planStatus: "active", plan: { not: "trial" } },
          // Trialing users whose trial has not yet ended.
          {
            OR: [{ planStatus: "trialing" }, { plan: "trial" }],
            trialEndsAt: { gt: new Date() },
          },
          // Admin / unlimited.
          { plan: "admin" },
        ],
      },
      {
        yards: {
          some: {
            OR: [
              { wateringDays: { isEmpty: false } },
              { mowingDays: { isEmpty: false } },
              { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
            ],
          },
        },
      },
    ],
  },
  select: { /* unchanged */ },
});
```

- [ ] **Step 2: Run existing cron tests**

Run:
```bash
npx vitest run app/api/cron 2>&1 | tail -20
```
Expected: PASS — existing tests are unaffected; this only narrows the user set.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/daily-tasks/route.ts
git commit -m "Stop sending schedule reminders to expired trial users"
```

---

## Task 14: Account-deletion-warnings cron with emails

**Files:**
- Create: `app/api/cron/account-deletion-warnings/route.ts`
- Modify: `lib/email.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Add the email builders**

Append to `lib/email.ts`:

```ts
export function buildGracePeriodWarningEmail(opts: {
  userName: string;
  daysUntilDeletion: number;
  pricingUrl: string;
}): { subject: string; html: string } {
  const { userName, daysUntilDeletion, pricingUrl } = opts;
  const subject =
    daysUntilDeletion <= 2
      ? `Your yard data deletes in ${daysUntilDeletion} day${daysUntilDeletion === 1 ? "" : "s"}`
      : daysUntilDeletion <= 7
      ? "Last week to save your yard data"
      : `${daysUntilDeletion} days until your yard data is permanently deleted`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Your free trial ended, and your yard data will be permanently deleted in
    <strong>${daysUntilDeletion} day${daysUntilDeletion === 1 ? "" : "s"}</strong>.
    Upgrade now to keep your schedule, analyses, and recommendations.
  </p>
  <p style="margin:24px 0;">
    <a href="${pricingUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
      Upgrade to keep my data
    </a>
  </p>
</body>
</html>`;
  return { subject, html };
}
```

- [ ] **Step 2: Create the cron route**

Create `app/api/cron/account-deletion-warnings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { resend, buildGracePeriodWarningEmail } from "@/lib/email";
import { mapWithConcurrency } from "@/lib/cron/concurrency";
import { sendPushToUser } from "@/lib/push/send";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";
import { DAY_MS } from "@/lib/time";

export const maxDuration = 300;
const EMAIL_CONCURRENCY = 10;

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface Touchpoint {
  daysAfterExpiry: number; // grace days elapsed
  daysUntilDeletion: number; // 30 minus daysAfterExpiry
  flagField:
    | "graceDay14EmailSentAt"
    | "graceDay7EmailSentAt"
    | "graceDay2EmailSentAt";
  pushFlagField: "gracePush7SentAt" | "gracePush1SentAt" | null;
  push: { title: string; body: string } | null;
}

const TOUCHPOINTS: Touchpoint[] = [
  {
    daysAfterExpiry: 16,
    daysUntilDeletion: 14,
    flagField: "graceDay14EmailSentAt",
    pushFlagField: null,
    push: null,
  },
  {
    daysAfterExpiry: 23,
    daysUntilDeletion: 7,
    flagField: "graceDay7EmailSentAt",
    pushFlagField: "gracePush7SentAt",
    push: {
      title: "Last week to keep your Yard Analyzer data",
      body: "Upgrade now to save your schedule and analyses.",
    },
  },
  {
    daysAfterExpiry: 28,
    daysUntilDeletion: 2,
    flagField: "graceDay2EmailSentAt",
    pushFlagField: "gracePush1SentAt",
    push: {
      title: "Your data deletes in 2 days",
      body: "Upgrade to keep your yard records.",
    },
  },
];

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const today = startOfToday();
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const pricingUrl = `${baseUrl}/pricing`;

  let sent = 0;
  let failed = 0;

  try {
    for (const tp of TOUCHPOINTS) {
      // Users whose trial ended `tp.daysAfterExpiry` days ago.
      const expiryDay = addDays(today, -tp.daysAfterExpiry);
      const where: Record<string, unknown> = {
        OR: [
          { planStatus: "trialing", trialEndsAt: { gte: expiryDay, lt: addDays(expiryDay, 1) } },
          { planStatus: "expired", trialEndsAt: { gte: expiryDay, lt: addDays(expiryDay, 1) } },
        ],
        stripeSubscriptionId: null,
        [tp.flagField]: null,
      };
      const users = await db.user.findMany({
        where: where as never,
        select: { id: true, email: true, name: true },
      });

      await mapWithConcurrency(users, EMAIL_CONCURRENCY, async (user) => {
        if (!user.email) return;
        const { subject, html } = buildGracePeriodWarningEmail({
          userName: user.name?.split(" ")[0] ?? "there",
          daysUntilDeletion: tp.daysUntilDeletion,
          pricingUrl,
        });
        try {
          await resend.emails.send({
            from: "Yard Analyzer <noreply@yardanalyzer.com>",
            to: user.email,
            subject,
            html,
          });
          sent++;
        } catch (err) {
          failed++;
          logger.error("account-deletion-warnings: email send failed", {
            daysUntilDeletion: tp.daysUntilDeletion,
            userId: user.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
        if (tp.push && tp.pushFlagField) {
          try {
            await sendPushToUser(user.id, {
              title: tp.push.title,
              body: tp.push.body,
              data: { kind: `grace_${tp.daysUntilDeletion}d` },
            });
          } catch { /* non-fatal */ }
        }
        const updateData: Record<string, Date> = { [tp.flagField]: new Date() };
        if (tp.pushFlagField) updateData[tp.pushFlagField] = new Date();
        await db.user.update({ where: { id: user.id }, data: updateData as never });
      });
    }

    emitCronRun({
      route: "account-deletion-warnings",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
    });
    return NextResponse.json({ ok: true, sent, failed });
  } catch (err) {
    emitCronRun({
      route: "account-deletion-warnings",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err;
  }
});
```

The unused `DAY_MS` import keeps parity with sibling cron files; remove if a linter flags it.

- [ ] **Step 3: Register the cron in `vercel.json`**

Open `vercel.json` and add a new entry inside `crons`:

```json
{ "path": "/api/cron/account-deletion-warnings", "schedule": "20 8 * * *" }
```

This stays clear of the other 08:xx slots already taken.

- [ ] **Step 4: Smoke test**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "account-deletion-warnings" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/account-deletion-warnings/ lib/email.ts vercel.json
git commit -m "Add account-deletion-warnings cron for grace-period emails and push"
```

---

## Task 15: Single-section yard analysis timeline component

**Files:**
- Create: `components/yard/YardAnalysisTimeline.tsx`
- Modify: `app/(dashboard)/yard/[id]/page.tsx`

- [ ] **Step 1: Create the shared timeline component**

Create `components/yard/YardAnalysisTimeline.tsx`. The component renders the latest analysis with a chart and a collapsible list of past analyses — the same content currently inline in `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` lines 256-355.

```tsx
import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Images } from "lucide-react";
import { SectionHealthChart } from "@/components/sections/SectionHealthChart";

export interface AnalysisRow {
  id: string;
  healthScore: number;
  summary: string;
  issues: string[];
  imageUrls: string[];
  createdAt: Date;
}

interface Props {
  analyses: AnalysisRow[];
  photoHistoryHref?: string | null;
  totalPhotoCount?: number;
}

function colorForScore(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

export function YardAnalysisTimeline({ analyses, photoHistoryHref, totalPhotoCount = 0 }: Props) {
  if (analyses.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-center text-sm text-gray-400">
        No analyses yet. Tap Analyze to get started.
      </div>
    );
  }

  const latest = analyses[0]!;
  const chartData = [...analyses].reverse().map((a) => ({
    date: a.createdAt.toISOString(),
    score: a.healthScore,
  }));

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold ${colorForScore(latest.healthScore)}`}>
            {latest.healthScore}
          </span>
          <span className="text-sm text-gray-400">/ 100 health score</span>
          <span className="text-xs text-gray-400 ml-auto">
            {format(latest.createdAt, "MMM d, yyyy")}
          </span>
        </div>
        {chartData.length >= 2 && <SectionHealthChart data={chartData} />}
        {latest.summary && <p className="text-sm text-gray-700">{latest.summary}</p>}
        {latest.issues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {latest.issues.map((issue) => (
              <span
                key={issue}
                className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
              >
                {issue}
              </span>
            ))}
          </div>
        )}
        {latest.imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {latest.imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <Image
                  src={url}
                  alt={`Analysis image ${i + 1}`}
                  width={80}
                  height={80}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
          </div>
        )}
        {photoHistoryHref && totalPhotoCount > 0 && (
          <div className="pt-1">
            <Link
              href={photoHistoryHref}
              className="inline-flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
            >
              <Images className="w-4 h-4" />
              View photo history ({totalPhotoCount})
            </Link>
          </div>
        )}
      </div>

      {analyses.length > 1 && (
        <details className="bg-white border border-gray-200 rounded-xl mb-8">
          <summary className="px-5 py-4 text-sm text-gray-500 cursor-pointer font-medium select-none list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="details-arrow">▶</span>
            {analyses.length - 1} past analysis{analyses.length - 1 > 1 ? "es" : ""}
          </summary>
          <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
            {analyses.slice(1).map((a) => (
              <div key={a.id} className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${colorForScore(a.healthScore)}`}>
                    {a.healthScore}
                  </span>
                  <span className="text-xs text-gray-400">/ 100</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {format(a.createdAt, "MMM d, yyyy")}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{a.summary}</p>
                {a.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.issues.map((issue) => (
                      <span
                        key={issue}
                        className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
```

- [ ] **Step 2: Render the timeline on yard detail when there is exactly one section**

In `app/(dashboard)/yard/[id]/page.tsx`, expand the `findFirst` include to also load analyses for sections, and render the timeline component when `yard.sections.length === 1`:

Update the query (`db.yard.findFirst`):

```ts
include: {
  sections: {
    orderBy: { createdAt: "asc" },
    include: {
      analyses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          healthScore: true,
          summary: true,
          issues: true,
          imageUrls: true,
          createdAt: true,
        },
      },
      tasks: { /* existing */ },
    },
  },
},
```

Add the import:
```ts
import { YardAnalysisTimeline } from "@/components/yard/YardAnalysisTimeline";
```

In the JSX, before the `<YardDetailInteractive />` block, add:

```tsx
{yard.sections.length === 1 && (
  <YardAnalysisTimeline
    analyses={yard.sections[0]!.analyses}
    photoHistoryHref={`/yard/${id}/sections/${yard.sections[0]!.slug}/photos`}
    totalPhotoCount={yard.sections[0]!.analyses.reduce((sum, a) => sum + a.imageUrls.length, 0)}
  />
)}
```

- [ ] **Step 3: Optionally refactor section detail page to use the same component**

This is a follow-up to keep the implementation DRY. In `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`, replace the inline timeline (lines ~255-355) with:

```tsx
<YardAnalysisTimeline
  analyses={section.analyses}
  photoHistoryHref={`/yard/${yardSlug}/sections/${sectionSlug}/photos`}
  totalPhotoCount={totalPhotoCount}
/>
```

If the refactor risks breaking other inline logic (issue ribbons, photo grid alignment), defer it to a separate cleanup PR. The point of this task is that yard-level timeline now exists; sharing the implementation is an optional cleanup.

- [ ] **Step 4: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -iE "yard/\[id\]/page|YardAnalysisTimeline" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 5: Commit**

```bash
git add components/yard/YardAnalysisTimeline.tsx app/\(dashboard\)/yard/
git commit -m "Show analysis timeline on yard detail for single-section yards"
```

---

## Task 16: Locked task previews show task titles

**Files:**
- Modify: `components/dashboard/LockedTaskCard.tsx`
- Modify: `components/dashboard/TaskList.tsx`

- [ ] **Step 1: Update `LockedTaskCard` to accept a title prop**

Replace `components/dashboard/LockedTaskCard.tsx` contents:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { isMobileAppClient } from "@/lib/platform";

interface Props {
  title?: string;
}

export function LockedTaskCard({ title }: Props) {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isMobileAppClient()), []);

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        {title ? (
          <div className="flex gap-3">
            <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-semibold text-gray-900">{title}</div>
              <div className="blur-sm pointer-events-none select-none" aria-hidden>
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-5/6 mt-1" />
                <div className="h-3 bg-gray-100 rounded w-2/3 mt-1" />
              </div>
            </div>
          </div>
        ) : (
          <div className="blur-sm pointer-events-none select-none" aria-hidden>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-5/6" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          {inApp ? (
            <p className="flex items-center gap-1.5 bg-gray-700 text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-sm">
              <Lock className="w-3 h-3" />
              This feature requires the Pro plan.
            </p>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors shadow-sm"
            >
              <Lock className="w-3 h-3" />
              Upgrade to unlock
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Pass hidden task titles from `TaskList` to `LockedTaskCard`**

In `app/(dashboard)/dashboard/page.tsx`, capture the titles of hidden tasks:

```ts
const hiddenTaskTitles = allTasks.slice(limits.maxVisibleTasks === -1 ? 0 : limits.maxVisibleTasks, (limits.maxVisibleTasks === -1 ? 0 : limits.maxVisibleTasks) + 3).map((t) => t.title);
```

Pass it through `DashboardInteractiveSection` → `DashboardTaskSection` → `TaskList`. Each component already takes `hiddenTaskCount`; add a parallel `hiddenTaskTitles?: string[]` prop in each file. In `TaskList.tsx` around line 424, replace:

```tsx
{Array.from({ length: Math.min(hiddenTaskCount!, 3) }).map((_, i) => (
  <LockedTaskCard key={i} />
))}
```

with:

```tsx
{Array.from({ length: Math.min(hiddenTaskCount!, 3) }).map((_, i) => (
  <LockedTaskCard key={i} title={hiddenTaskTitles?.[i]} />
))}
```

- [ ] **Step 3: Smoke test**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -iE "TaskList|LockedTaskCard|DashboardTaskSection|DashboardInteractiveSection" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/LockedTaskCard.tsx components/dashboard/TaskList.tsx components/dashboard/DashboardTaskSection.tsx components/dashboard/DashboardInteractiveSection.tsx app/\(dashboard\)/dashboard/page.tsx
git commit -m "Surface hidden task titles in locked previews"
```

---

## Task 17: Locked "Add Yard" CTA when at plan limit

**Files:**
- Modify: `app/(dashboard)/yard/page.tsx`

- [ ] **Step 1: Compute whether the user can add a yard**

At the top of `app/(dashboard)/yard/page.tsx`, fetch the user with subscription fields and compute capability. The page already fetches yards; extend it:

```ts
import { canCreateYard, getPlanLimits } from "@/lib/subscription";

// In the existing data fetch:
const user = await db.user.findUnique({
  where: { id: session.user.id },
  select: {
    plan: true,
    planStatus: true,
    trialEndsAt: true,
    currentPeriodEnd: true,
    pausedUntil: true,
  },
});

const canAdd = user ? canCreateYard(user, yards.length) : false;
const planLimits = user ? getPlanLimits(user) : null;
const limitCopy = planLimits && planLimits.maxYards > 0
  ? `Track up to ${planLimits.maxYards === 1 ? "1 yard on the free trial" : `${planLimits.maxYards} yards on your current plan`}.`
  : "";
```

- [ ] **Step 2: Replace the unconditional `Add Yard` button with a conditional**

Find the existing block (lines ~61-65):

```tsx
<Link href="/yard/setup">
  <Button className="bg-green-600 hover:bg-green-700">
    <Plus className="w-4 h-4" />Add Yard
  </Button>
</Link>
```

Replace with:

```tsx
{canAdd ? (
  <Link href="/yard/setup">
    <Button className="bg-green-600 hover:bg-green-700">
      <Plus className="w-4 h-4" />Add Yard
    </Button>
  </Link>
) : (
  <Link href="/pricing" title={limitCopy}>
    <Button variant="outline" className="text-gray-500">
      <Lock className="w-4 h-4 mr-1" />Add Yard (upgrade)
    </Button>
  </Link>
)}
```

Add the `Lock` icon import if missing.

- [ ] **Step 3: Optional locked card below the existing yards list**

Below the existing yards list, when `!canAdd`, render a locked card pointing to /pricing:

```tsx
{!canAdd && (
  <Link
    href="/pricing"
    className="block rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500 hover:border-green-400 hover:text-green-700 transition-colors"
  >
    <Lock className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
    {limitCopy} Upgrade to track more.
  </Link>
)}
```

- [ ] **Step 4: Type-check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "yard/page" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/yard/page.tsx
git commit -m "Lock Add Yard CTA and add upsell card when at plan limit"
```

---

## Task 18: Pricing page copy update

**Files:**
- Modify: `app/pricing/page.tsx`

- [ ] **Step 1: Update the free trial card copy**

In `app/pricing/page.tsx`, find the Free Trial card block (around line 121-128) which currently shows:

```tsx
<div className="mt-2">
  <span className="text-3xl font-bold text-gray-900">$0</span>
  <span className="text-gray-400 text-sm"> for 14 days</span>
</div>
<p className="text-xs text-gray-400 font-medium mt-0.5">No credit card required</p>
```

Replace with:

```tsx
<div className="mt-2">
  <span className="text-3xl font-bold text-gray-900">$0</span>
  <span className="text-gray-400 text-sm"> for 21 days</span>
</div>
<p className="text-xs text-gray-400 font-medium mt-0.5">No credit card required</p>
<p className="text-xs text-emerald-700 font-medium mt-1">+7 bonus days when you set your schedule and complete a task</p>
```

- [ ] **Step 2: Commit**

```bash
git add app/pricing/page.tsx
git commit -m "Update pricing page to advertise 21 day trial plus 7 day engagement bonus"
```

---

## Task 19: End-to-end smoke and final type/test sweep

**Files:** none directly — verification only

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npx vitest run 2>&1 | tail -30
```
Expected: all tests pass (excluding any pre-existing failures noted in the codebase).

- [ ] **Step 2: Run the type checker**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -30
```
Expected: no new type errors introduced by this work.

- [ ] **Step 3: Manual UX sanity (dev server)**

Run:
```bash
npm run dev
```

In the browser:
1. Register a new account → confirm landing on dashboard shows the Trial Progress Card with neither step checked.
2. Run an analysis on the default yard → confirm 1 visible task plus locked previews showing real task titles.
3. Set a schedule on the analysis result → confirm the trial progress card reflects "Schedule set".
4. Mark a task complete → confirm the celebration state appears and the trial banner adjusts (trial extended by 7 days).
5. Visit `/yard` while at the yard limit → confirm "Add Yard" CTA renders as the locked variant pointing to `/pricing`.
6. Visit a yard with one section → confirm the analysis timeline renders on the yard detail page.
7. Visit `/pricing` while logged in → confirm "21 days" + bonus copy appears on the free trial card.

- [ ] **Step 4: Commit any cleanup**

If any of the steps above surface a small fix (typo, missing prop), commit it as a follow-up:

```bash
git add -p
git commit -m "Cleanup from trial revamp end-to-end smoke"
```

If no cleanup needed, skip the commit.

---

## Self-Review

**Spec coverage:**
- ✅ 21-day trial → Task 2
- ✅ +7 engagement bonus → Tasks 3, 4, 5, 6
- ✅ TrialProgressCard with three states → Tasks 7, 8
- ✅ Day-5 and day-10 nudges → Tasks 9, 10
- ✅ Day-14 second-analysis prompt → Task 11
- ✅ Trial-end push at expiry → Task 12
- ✅ Wall behavior (reminders stop firing) → Task 13
- ✅ Data loss warnings (T-14, T-7, T-2 emails; T-7, T-1 push) → Task 14
- ✅ Single-section yard timeline → Task 15
- ✅ Locked task previews with titles → Task 16
- ✅ Locked "Add another yard" CTA → Task 17
- ✅ Pricing page copy update → Task 18

**Placeholder scan:** no "TBD" / "TODO" / "implement later" / "similar to". All code blocks are complete.

**Type consistency:**
- `computeEngagementStatus`, `grantEngagementBonusIfEligible`, `userHasAnySchedule`, `userHasAnyCompletedTask` named consistently across tasks 3, 4, 5, 6, 7, 8.
- `EngagementStatus` / `EngagementSignals` types referenced consistently.
- `TrialProgressCard` prop names (`scheduleSet`, `taskCompleted`, `bonusAlreadyGranted`, `bonusGrantedAt`, `trialEndsAt`) match between task 7 (definition) and task 8 (call site).
- Flag column names (`day5NudgeSentAt`, `day10NudgeSentAt`, `day14SecondAnalysisPromptSentAt`, `trialEndedPushSentAt`, `graceDay14EmailSentAt`, `graceDay7EmailSentAt`, `graceDay2EmailSentAt`, `gracePush7SentAt`, `gracePush1SentAt`) match between task 1 (migration) and tasks 9, 10, 11, 12, 14 (cron writes).

**Open implementation questions from the spec** are addressed:
1. Schedule reminder cron skipping expired users → Task 13 explicitly handles it.
2. Per-section override lock UX → already exists in the codebase (verified during planning); not a separate task in this plan, can be polished as a separate UX pass.
3. Idempotency flag storage → resolved as separate named columns (Task 1) rather than a single JSON column, for query simplicity.
