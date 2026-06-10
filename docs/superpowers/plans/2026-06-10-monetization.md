# Monetization & Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe-powered subscription tiers with plan enforcement, trial blurring, seasonal pause, and automated data deletion for expired accounts.

**Architecture:** A `lib/subscription.ts` helper derives plan limits from User fields; server components gate content before it reaches the browser; Stripe Checkout and Customer Portal handle all payment UI; a daily cron job deletes accounts that have been expired/canceled for 30 days.

**Tech Stack:** Stripe (payments), Next.js App Router (server components for gating), Prisma (schema), Vitest (tests), existing Supabase storage (photo deletion on account removal)

---

## Pricing Model

| Plan | Monthly | Annual | Yards | Analyses/section/mo | Tasks visible |
|---|---|---|---|---|---|
| Trial (14 days) | free | — | 1 | 1 | first only (rest blurred) |
| Expired (grace 30d) | — | — | 1 | 0 (blocked) | first only (rest blurred) |
| **Starter** | $7.99 | $79 | 1 | 2 | all |
| **Home** | $14.99 | $139 | 3 | 3 | all |
| **Pro** | $24.99 | $229 | 10 | unlimited | all |
| **Professional** | $49.99 | $449 | unlimited | unlimited | all |

**Key behaviors:**
- Trial → 14 days from signup; if not paid, enters 30-day grace (data deleted after grace ends)
- Paused subscription: billing paused 1–6 months, full plan access retained
- Annual plans = ~2 months free vs monthly

---

## File Map

**New files:**
- `lib/subscription.ts` — plan limits, effective plan calculation, all gating helpers
- `lib/__tests__/subscription.test.ts` — unit tests for subscription lib
- `lib/stripe.ts` — Stripe client singleton
- `app/api/stripe/checkout/route.ts` — create Stripe Checkout session
- `app/api/stripe/webhook/route.ts` — handle Stripe subscription events
- `app/api/stripe/portal/route.ts` — redirect to Stripe Customer Portal
- `app/api/stripe/pause/route.ts` — pause/resume subscription
- `app/pricing/page.tsx` — public pricing page
- `components/settings/BillingSection.tsx` — billing UI (plan status, upgrade, pause)
- `components/dashboard/LockedTaskCard.tsx` — blurred placeholder for gated tasks
- `prisma/migrations/20260610000000_add_subscription_fields/migration.sql`

**Modified files:**
- `prisma/schema.prisma` — add 7 fields to User model
- `app/api/auth/register/route.ts` — set trialEndsAt on new user
- `app/api/analyze/route.ts` — analysis rate limit check
- `app/api/yard/route.ts` — yard creation limit check
- `app/(dashboard)/yard/[id]/page.tsx` — gate tasks server-side
- `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` — gate tasks server-side
- `app/(dashboard)/dashboard/page.tsx` — gate tasks + add trial banner
- `app/(dashboard)/settings/page.tsx` — add BillingSection
- `components/dashboard/TaskList.tsx` — accept `hiddenTaskCount` prop, render LockedTaskCards
- `app/api/cron/daily/route.ts` — add expired-account deletion step

---

## Task 1: Schema migration — add subscription fields to User

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260610000000_add_subscription_fields/migration.sql`
- Modify: `app/api/auth/register/route.ts`

- [ ] **Step 1: Add fields to schema**

In `prisma/schema.prisma`, add these 7 fields to the `User` model directly after the `createdAt` field:

```prisma
  plan                 String    @default("trial")
  planStatus           String    @default("trialing")
  trialEndsAt          DateTime?
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?   @unique
  currentPeriodEnd     DateTime?
  pausedUntil          DateTime?
```

- [ ] **Step 2: Create migration file**

Create `prisma/migrations/20260610000000_add_subscription_fields/migration.sql`:

```sql
ALTER TABLE "User" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "User" ADD COLUMN "planStatus" TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pausedUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- Backfill trialEndsAt for existing users based on their createdAt
UPDATE "User" SET "trialEndsAt" = "createdAt" + INTERVAL '14 days' WHERE "trialEndsAt" IS NULL;
```

- [ ] **Step 3: Apply migration and regenerate client**

```bash
npx prisma migrate deploy
npx prisma generate
```

Expected: migration applied, no errors.

- [ ] **Step 4: Set trialEndsAt on new user registration**

In `app/api/auth/register/route.ts`, update the `db.user.create` call:

```typescript
  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260610000000_add_subscription_fields/migration.sql app/api/auth/register/route.ts
git commit -m "feat: add subscription fields to User schema"
```

---

## Task 2: Subscription helper lib (with tests)

**Files:**
- Create: `lib/subscription.ts`
- Create: `lib/__tests__/subscription.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `lib/__tests__/subscription.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getPlanLimits,
  canRunAnalysis,
  canCreateYard,
  getVisibleTasksArgs,
  getDaysUntilDeletion,
  PLAN_LABELS,
} from "../subscription";

const makeUser = (overrides: object) => ({
  plan: "trial",
  planStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
  currentPeriodEnd: null,
  pausedUntil: null,
  ...overrides,
});

describe("getPlanLimits", () => {
  it("returns trial limits for an active trial user", () => {
    const limits = getPlanLimits(makeUser({}));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(1);
    expect(limits.maxVisibleTasks).toBe(1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when trial has passed", () => {
    const limits = getPlanLimits(makeUser({
      trialEndsAt: new Date(Date.now() - 1000),
    }));
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(0);
    expect(limits.canRunAnalysis).toBe(false);
    expect(limits.maxVisibleTasks).toBe(1);
  });

  it("returns starter limits for active starter subscriber", () => {
    const limits = getPlanLimits(makeUser({
      plan: "starter",
      planStatus: "active",
      trialEndsAt: null,
    }));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(2);
    expect(limits.maxVisibleTasks).toBe(-1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns home limits for home plan", () => {
    const limits = getPlanLimits(makeUser({
      plan: "home",
      planStatus: "active",
    }));
    expect(limits.maxYards).toBe(3);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(3);
  });

  it("returns unlimited for pro plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "pro", planStatus: "active" }));
    expect(limits.maxYards).toBe(10);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(-1);
  });

  it("returns unlimited yards for professional plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "professional", planStatus: "active" }));
    expect(limits.maxYards).toBe(-1);
  });

  it("returns full plan access when paused", () => {
    const limits = getPlanLimits(makeUser({
      plan: "starter",
      planStatus: "paused",
      pausedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }));
    expect(limits.maxYards).toBe(1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when canceled", () => {
    const limits = getPlanLimits(makeUser({ planStatus: "canceled" }));
    expect(limits.canRunAnalysis).toBe(false);
  });
});

describe("canRunAnalysis", () => {
  it("allows when under monthly limit", () => {
    expect(canRunAnalysis(
      makeUser({ plan: "starter", planStatus: "active" }),
      1
    )).toBe(true);
  });

  it("blocks when at monthly limit", () => {
    expect(canRunAnalysis(
      makeUser({ plan: "starter", planStatus: "active" }),
      2
    )).toBe(false);
  });

  it("always allows when limit is -1", () => {
    expect(canRunAnalysis(
      makeUser({ plan: "pro", planStatus: "active" }),
      100
    )).toBe(true);
  });

  it("blocks when expired", () => {
    expect(canRunAnalysis(
      makeUser({ trialEndsAt: new Date(Date.now() - 1000) }),
      0
    )).toBe(false);
  });
});

describe("canCreateYard", () => {
  it("allows when under limit", () => {
    expect(canCreateYard(makeUser({ plan: "home", planStatus: "active" }), 2)).toBe(true);
  });

  it("blocks when at limit", () => {
    expect(canCreateYard(makeUser({ plan: "home", planStatus: "active" }), 3)).toBe(false);
  });

  it("allows unlimited yards for professional", () => {
    expect(canCreateYard(makeUser({ plan: "professional", planStatus: "active" }), 999)).toBe(true);
  });
});

describe("getVisibleTasksArgs", () => {
  it("returns {take: 1} for trial user", () => {
    const args = getVisibleTasksArgs(makeUser({}));
    expect(args.take).toBe(1);
  });

  it("returns {} for paid user (no limit)", () => {
    const args = getVisibleTasksArgs(makeUser({ plan: "starter", planStatus: "active" }));
    expect(args.take).toBeUndefined();
  });
});

describe("getDaysUntilDeletion", () => {
  it("returns null for active paid users", () => {
    expect(getDaysUntilDeletion(makeUser({ plan: "starter", planStatus: "active" }))).toBeNull();
  });

  it("returns positive number during grace period", () => {
    const expired = makeUser({ trialEndsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
    const days = getDaysUntilDeletion(expired);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("returns 0 or negative when deletion is overdue", () => {
    const longExpired = makeUser({
      trialEndsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    });
    const days = getDaysUntilDeletion(longExpired);
    expect(days).toBeLessThanOrEqual(0);
  });
});

describe("PLAN_LABELS", () => {
  it("has labels for all plans", () => {
    expect(PLAN_LABELS.trial).toBe("Free Trial");
    expect(PLAN_LABELS.starter).toBe("Starter");
    expect(PLAN_LABELS.home).toBe("Home");
    expect(PLAN_LABELS.pro).toBe("Pro");
    expect(PLAN_LABELS.professional).toBe("Professional");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/subscription.test.ts
```

Expected: FAIL — "Cannot find module '../subscription'"

- [ ] **Step 3: Implement the subscription lib**

Create `lib/subscription.ts`:

```typescript
export type Plan = "trial" | "starter" | "home" | "pro" | "professional";
export type PlanStatus = "trialing" | "active" | "paused" | "expired" | "canceled";

export interface PlanLimits {
  maxYards: number;                      // -1 = unlimited
  maxAnalysesPerSectionPerMonth: number; // -1 = unlimited, 0 = blocked
  maxVisibleTasks: number;               // -1 = unlimited, 1 = first only
  canRunAnalysis: boolean;
}

export type SubscriptionUser = {
  plan: string;
  planStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd?: Date | null;
  pausedUntil?: Date | null;
};

const LIMITS: Record<string, PlanLimits> = {
  trial:        { maxYards: 1, maxAnalysesPerSectionPerMonth: 1,  maxVisibleTasks: 1,  canRunAnalysis: true },
  expired:      { maxYards: 1, maxAnalysesPerSectionPerMonth: 0,  maxVisibleTasks: 1,  canRunAnalysis: false },
  starter:      { maxYards: 1, maxAnalysesPerSectionPerMonth: 2,  maxVisibleTasks: -1, canRunAnalysis: true },
  home:         { maxYards: 3, maxAnalysesPerSectionPerMonth: 3,  maxVisibleTasks: -1, canRunAnalysis: true },
  pro:          { maxYards: 10, maxAnalysesPerSectionPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true },
  professional: { maxYards: -1, maxAnalysesPerSectionPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true },
};

export const PLAN_LABELS: Record<string, string> = {
  trial: "Free Trial",
  starter: "Starter",
  home: "Home",
  pro: "Pro",
  professional: "Professional",
};

function isEffectivelyExpired(user: SubscriptionUser): boolean {
  if (user.planStatus === "expired" || user.planStatus === "canceled") return true;
  if (
    (user.planStatus === "trialing" || user.plan === "trial") &&
    user.trialEndsAt &&
    user.trialEndsAt <= new Date()
  ) return true;
  return false;
}

export function getPlanLimits(user: SubscriptionUser): PlanLimits {
  if (isEffectivelyExpired(user)) return LIMITS.expired;
  if (user.planStatus === "trialing" || user.plan === "trial") return LIMITS.trial;
  // paused users retain their paid plan limits
  return LIMITS[user.plan] ?? LIMITS.trial;
}

export function canRunAnalysis(user: SubscriptionUser, currentMonthCount: number): boolean {
  const limits = getPlanLimits(user);
  if (!limits.canRunAnalysis) return false;
  if (limits.maxAnalysesPerSectionPerMonth === -1) return true;
  return currentMonthCount < limits.maxAnalysesPerSectionPerMonth;
}

export function canCreateYard(user: SubscriptionUser, currentYardCount: number): boolean {
  const limits = getPlanLimits(user);
  if (limits.maxYards === -1) return true;
  return currentYardCount < limits.maxYards;
}

/** Returns Prisma `take` argument for task queries. Undefined = no limit. */
export function getVisibleTasksArgs(user: SubscriptionUser): { take?: number } {
  const limits = getPlanLimits(user);
  if (limits.maxVisibleTasks === -1) return {};
  return { take: limits.maxVisibleTasks };
}

/**
 * Returns days remaining until account data is deleted.
 * Null = not in deletion window (active paid user).
 * 0 or negative = deletion is overdue.
 */
export function getDaysUntilDeletion(user: SubscriptionUser): number | null {
  if (!isEffectivelyExpired(user)) return null;
  // Grace period: 30 days after expiry
  const expiryDate = user.trialEndsAt ?? user.currentPeriodEnd ?? new Date(0);
  const deleteAt = new Date(expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((deleteAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/subscription.test.ts
```

Expected: all 20 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts lib/__tests__/subscription.test.ts
git commit -m "feat: add subscription helper lib with plan limits and gating"
```

---

## Task 3: Gate task visibility server-side + blurred UI

**Files:**
- Create: `components/dashboard/LockedTaskCard.tsx`
- Modify: `components/dashboard/TaskList.tsx` (add `hiddenTaskCount` prop)
- Modify: `app/(dashboard)/yard/[id]/page.tsx`
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create the blurred placeholder card**

Create `components/dashboard/LockedTaskCard.tsx`:

```typescript
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

export function LockedTaskCard() {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        {/* Blurred fake content */}
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
        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors shadow-sm"
          >
            <Lock className="w-3 h-3" />
            Upgrade to unlock
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add `hiddenTaskCount` to TaskList**

In `components/dashboard/TaskList.tsx`, find the component's prop interface and export signature. The component currently accepts `tasks` and `sections` props. Find the top-level exported component (search for `export function` or `export default function`) and add the prop.

The component interface is near the top of the file. Add `hiddenTaskCount?: number` to the props interface of the main exported `TaskList` (or `YardTasksSection`) component — whichever is the one rendered from pages. Check the import name used in pages; it's `YardTasksSection` on the yard detail page and `TaskList` on the section page.

First read the TaskList file carefully to find the exported component names, then make the following changes:

In `components/dashboard/TaskList.tsx`:

1. Add import at top:
```typescript
import { LockedTaskCard } from "./LockedTaskCard";
```

2. Find the `TaskListProps` or inline props of the exported `TaskList` component and add:
```typescript
  hiddenTaskCount?: number;
```

3. In the JSX of `TaskList`, after the last rendered task group (after the completed section), add:
```typescript
      {(hiddenTaskCount ?? 0) > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            {hiddenTaskCount} more recommendation{hiddenTaskCount !== 1 ? "s" : ""} — upgrade to see them
          </p>
          {Array.from({ length: Math.min(hiddenTaskCount!, 3) }).map((_, i) => (
            <LockedTaskCard key={i} />
          ))}
        </div>
      )}
```

Also add `Lock` to the lucide-react imports at the top if not already there.

Find `YardTasksSection` (if it exists as a separate export in the same file) and add `hiddenTaskCount?: number` to its props too, passing it through to `TaskList`.

- [ ] **Step 3: Gate tasks in yard detail page**

In `app/(dashboard)/yard/[id]/page.tsx`, after the session check but before the yard query, fetch the user's subscription state:

```typescript
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      weatherWidgetCollapsed: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pausedUntil: true,
    },
  });
```

(Replace the existing `user` query which only selects `weatherWidgetCollapsed`.)

Then import and use the subscription helper:

```typescript
import { getPlanLimits, getDaysUntilDeletion } from "@/lib/subscription";
```

After fetching `yard`, compute the task gate:

```typescript
  const limits = getPlanLimits(user);
  const daysUntilDeletion = getDaysUntilDeletion(user);
  
  const allTasks = yard.sections.flatMap((s) =>
    s.tasks.map((t) => ({
      ...t,
      scheduledStart: t.scheduledStart?.toISOString() ?? null,
      scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
      yardSection: { id: s.id, name: s.name, areaType: s.areaType, yard: { name: yard.name } },
    }))
  );

  const visibleTasks = limits.maxVisibleTasks === -1
    ? allTasks
    : allTasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = allTasks.length - visibleTasks.length;
```

In the JSX, update `<YardTasksSection>` to pass `hiddenTaskCount`:
```tsx
<YardTasksSection sections={sections} tasks={visibleTasks} hiddenTaskCount={hiddenTaskCount} />
```

Add a trial/expiry banner just before the sections list (after the weather widget):
```tsx
      {daysUntilDeletion !== null && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
          daysUntilDeletion <= 7
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}>
          {daysUntilDeletion > 0
            ? <>Your free trial has ended. <strong>Your data will be deleted in {daysUntilDeletion} day{daysUntilDeletion !== 1 ? "s" : ""}</strong> unless you <a href="/pricing" className="underline font-semibold">upgrade</a>.</>
            : <>Your free trial has ended and your data is scheduled for deletion. <a href="/pricing" className="underline font-semibold">Upgrade now</a> to keep your data.</>
          }
        </div>
      )}
```

- [ ] **Step 4: Gate tasks in section detail page**

In `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`, similarly fetch subscription fields and apply task gate. After fetching `section`, add:

```typescript
  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });
  const limits = getPlanLimits(subUser);
  
  const allTasks = section.tasks.map((t) => ({
    ...t,
    scheduledStart: t.scheduledStart?.toISOString() ?? null,
    scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
  }));
  const visibleTasks = limits.maxVisibleTasks === -1
    ? allTasks
    : allTasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = allTasks.length - visibleTasks.length;
```

Pass `visibleTasks` and `hiddenTaskCount` to `<TaskList>`.

Import `getPlanLimits` from `@/lib/subscription`.

- [ ] **Step 5: Gate tasks on dashboard**

In `app/(dashboard)/dashboard/page.tsx`, add subscription fields to the `user` query:

```typescript
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      weatherWidgetCollapsed: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pausedUntil: true,
    },
  });
```

After building `tasks`, apply the gate:

```typescript
  import { getPlanLimits, getDaysUntilDeletion } from "@/lib/subscription";
  
  const limits = getPlanLimits(user ?? { plan: "trial", planStatus: "trialing", trialEndsAt: null });
  const daysUntilDeletion = getDaysUntilDeletion(user ?? { plan: "trial", planStatus: "trialing", trialEndsAt: null, currentPeriodEnd: null });
  
  const visibleTasks = limits.maxVisibleTasks === -1
    ? tasks
    : tasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = tasks.length - visibleTasks.length;
```

Pass `visibleTasks` and `hiddenTaskCount` to `<DashboardInteractiveSection>`. You'll need to thread `hiddenTaskCount` through `DashboardInteractiveSection` props down to `TaskList` — check `components/dashboard/DashboardInteractiveSection.tsx` for the interface and add the prop there too.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/LockedTaskCard.tsx components/dashboard/TaskList.tsx app/\(dashboard\)/yard/\[id\]/page.tsx app/\(dashboard\)/yard/\[id\]/sections/\[sectionId\]/page.tsx app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: gate task visibility by plan — blurred locked cards for trial/expired users"
```

---

## Task 4: Analysis rate limiting

**Files:**
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Add plan check to analyze API**

In `app/api/analyze/route.ts`, after fetching `session` and before fetching `section`, add:

```typescript
  import { canRunAnalysis } from "@/lib/subscription";

  // Fetch user subscription state
  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });

  // Count analyses for this section this calendar month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyCount = await db.lawnAnalysis.count({
    where: { yardSectionId: sectionId, createdAt: { gte: startOfMonth } },
  });

  if (!canRunAnalysis(subUser, monthlyCount)) {
    const { getPlanLimits } = await import("@/lib/subscription");
    const limits = getPlanLimits(subUser);
    const message = limits.canRunAnalysis
      ? `You've used all ${limits.maxAnalysesPerSectionPerMonth} analyses for this section this month. Your limit resets on the 1st.`
      : "Upgrade your plan to analyze your lawn.";
    return NextResponse.json({ error: "analysis_limit_reached", message }, { status: 403 });
  }
```

Note: move the `import { canRunAnalysis } from "@/lib/subscription"` to the top of the file, not inside the handler.

- [ ] **Step 2: Show the error in the analyze page UI**

In `app/(dashboard)/analyze/page.tsx`, the `handleUploaded` function checks `if (!res.ok)` and sets `analysisError`. Update it to parse the JSON error:

```typescript
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "analysis_limit_reached") {
          setAnalysisError(data.message ?? "Analysis limit reached. Upgrade to analyze more.");
        } else {
          setAnalysisError("Analysis failed. Please try again.");
        }
        return;
      }
```

Also add an upgrade link in the error display below the `analysisError` check:

```tsx
          {analysisError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 mt-4">
              {analysisError}
              {analysisError.includes("limit") && (
                <a href="/pricing" className="ml-2 underline font-semibold">View plans →</a>
              )}
            </div>
          )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze/route.ts app/\(dashboard\)/analyze/page.tsx
git commit -m "feat: enforce analysis rate limits per plan"
```

---

## Task 5: Yard creation limit

**Files:**
- Modify: `app/api/yard/route.ts`

- [ ] **Step 1: Add yard limit check to POST handler**

In `app/api/yard/route.ts`, update the `POST` handler. After parsing the body and before creating the yard, add:

```typescript
  import { canCreateYard } from "@/lib/subscription";

  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });
  const yardCount = await db.yard.count({ where: { userId: session.user.id } });

  if (!canCreateYard(subUser, yardCount)) {
    const { getPlanLimits } = await import("@/lib/subscription");
    const limits = getPlanLimits(subUser);
    return NextResponse.json(
      {
        error: "yard_limit_reached",
        message: `Your plan allows up to ${limits.maxYards} yard${limits.maxYards !== 1 ? "s" : ""}. Upgrade to add more.`,
      },
      { status: 403 }
    );
  }
```

Move the imports to the top of the file.

- [ ] **Step 2: Handle the error in the yard setup form**

Find `app/(dashboard)/yard/setup/page.tsx` or the form component that calls `POST /api/yard`. Look for the fetch call and update the error handling to check for `yard_limit_reached`:

```typescript
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "yard_limit_reached") {
          setError(data.message + " View plans at /pricing");
        } else {
          setError("Failed to create yard. Please try again.");
        }
        return;
      }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/yard/route.ts
git commit -m "feat: enforce yard creation limits per plan"
```

---

## Task 6: Stripe SDK setup and lib

**Files:**
- Modify: `package.json` (install stripe)
- Create: `lib/stripe.ts`
- Create: `.env.local` additions (documented, not committed)

- [ ] **Step 1: Install Stripe**

```bash
npm install stripe
```

Expected: stripe added to `dependencies` in package.json.

- [ ] **Step 2: Create Stripe lib**

Create `lib/stripe.ts`:

```typescript
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export const STRIPE_PRICES: Record<string, Record<string, string>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL  ?? "",
  },
  home: {
    monthly: process.env.STRIPE_PRICE_HOME_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_HOME_ANNUAL  ?? "",
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_PRO_ANNUAL  ?? "",
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL  ?? "",
  },
};

export function planFromPriceId(priceId: string): string {
  for (const [plan, prices] of Object.entries(STRIPE_PRICES)) {
    if (prices.monthly === priceId || prices.annual === priceId) return plan;
  }
  return "starter";
}
```

- [ ] **Step 3: Set up Stripe products (manual step — do once in Stripe dashboard)**

In the Stripe dashboard (https://dashboard.stripe.com), create the following products and prices, then copy the price IDs into environment variables:

**Products to create:**
- "Yard Analyzer Starter" → monthly $7.99, annual $79.00
- "Yard Analyzer Home" → monthly $14.99, annual $139.00
- "Yard Analyzer Pro" → monthly $24.99, annual $229.00
- "Yard Analyzer Professional" → monthly $49.99, annual $449.00

For each product, add metadata: `plan = starter` (or home, pro, professional).

**Add to `.env` (local) and Vercel environment variables:**
```
STRIPE_SECRET_KEY=sk_live_xxx          # or sk_test_xxx for dev
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER_MONTHLY=price_xxx
STRIPE_PRICE_STARTER_ANNUAL=price_xxx
STRIPE_PRICE_HOME_MONTHLY=price_xxx
STRIPE_PRICE_HOME_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_xxx
STRIPE_PRICE_PROFESSIONAL_ANNUAL=price_xxx
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (Stripe types are included in the stripe package).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe.ts package.json package-lock.json
git commit -m "feat: add Stripe client lib and price map"
```

---

## Task 7: Stripe Checkout session API

**Files:**
- Create: `app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Create the checkout endpoint**

Create `app/api/stripe/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const plan = searchParams.get("plan");
  const period = searchParams.get("period") ?? "monthly";

  if (!plan || !STRIPE_PRICES[plan]?.[period]) {
    return NextResponse.json({ error: "Invalid plan or period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[plan][period];

  // Create or retrieve Stripe customer
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true, name: true },
  });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      name: user.name ?? undefined,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await db.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/settings?billing=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
    subscription_data: {
      metadata: { userId: session.user.id, plan },
    },
  });

  return NextResponse.redirect(checkoutSession.url!);
}
```

- [ ] **Step 2: Create Stripe Customer Portal redirect**

Create `app/api/stripe/portal/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user.stripeCustomerId) {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.NEXTAUTH_URL}/settings`,
  });

  return NextResponse.redirect(portalSession.url);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/checkout/route.ts app/api/stripe/portal/route.ts
git commit -m "feat: add Stripe checkout and customer portal redirect endpoints"
```

---

## Task 8: Stripe webhook handler

**Files:**
- Create: `app/api/stripe/webhook/route.ts`

The webhook handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`.

- [ ] **Step 1: Create the webhook handler**

Create `app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";

export const config = { api: { bodyParser: false } };

async function updateUserFromSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  if (!userId) return;

  const priceId = sub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId);

  let planStatus: string;
  switch (sub.status) {
    case "trialing": planStatus = "trialing"; break;
    case "active":   planStatus = "active";   break;
    case "paused":   planStatus = "paused";   break;
    case "canceled": planStatus = "canceled"; break;
    default:         planStatus = "expired";
  }

  const pausedUntil = sub.pause_collection?.resumes_at
    ? new Date(sub.pause_collection.resumes_at * 1000)
    : null;

  await db.user.update({
    where: { id: userId },
    data: {
      plan,
      planStatus,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      pausedUntil,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await updateUserFromSubscription(sub);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await updateUserFromSubscription(sub);
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        await updateUserFromSubscription(sub);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Register webhook in Stripe dashboard**

In Stripe dashboard → Developers → Webhooks:
- Add endpoint: `https://yourdomain.com/api/stripe/webhook`
- Listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`
- Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` env var

For local testing: `npx stripe listen --forward-to localhost:3000/api/stripe/webhook`

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: add Stripe webhook handler for subscription lifecycle events"
```

---

## Task 9: Pricing page

**Files:**
- Create: `app/pricing/page.tsx`

- [ ] **Step 1: Create the pricing page**

Create `app/pricing/page.tsx`:

```typescript
import Link from "next/link";
import Image from "next/image";
import { CheckCircle, X } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pricing – Yard Analyzer" };

const PLANS = [
  {
    name: "Starter",
    key: "starter",
    monthly: 7.99,
    annual: 79,
    highlight: false,
    yards: "1 yard",
    analyses: "2 analyses/section/mo",
    features: ["All task recommendations", "Schedule reminders", "Weather integration", "Seasonal pause"],
  },
  {
    name: "Home",
    key: "home",
    monthly: 14.99,
    annual: 139,
    highlight: true,
    yards: "Up to 3 yards",
    analyses: "3 analyses/section/mo",
    features: ["Everything in Starter", "Multi-yard dashboard", "Per-section schedules"],
  },
  {
    name: "Pro",
    key: "pro",
    monthly: 24.99,
    annual: 229,
    highlight: false,
    yards: "Up to 10 yards",
    analyses: "Unlimited analyses",
    features: ["Everything in Home", "Unlimited photo analyses", "Ideal for rental owners & HOAs"],
  },
  {
    name: "Professional",
    key: "professional",
    monthly: 49.99,
    annual: 449,
    highlight: false,
    yards: "Unlimited yards",
    analyses: "Unlimited analyses",
    features: ["Everything in Pro", "Unlimited yards", "Ideal for landscapers & property managers"],
  },
];

export default function PricingPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href="/" className="flex items-center gap-1">
          <Image src="/gnome-buddy.png" alt="Yard Analyzer" width={28} height={28} className="rounded-full scale-x-[-1]" />
          <span className="text-lg font-bold text-green-700">Yard Analyzer</span>
        </Link>
        <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
      </nav>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500">Start free for 14 days. No credit card required.</p>
        </div>

        {/* Billing toggle — client component handles state; for SSR, render both and use CSS */}
        <div className="mb-8 flex justify-center">
          <PricingToggle />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? "border-green-500 ring-2 ring-green-500 relative"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <div className="mb-4">
                <p className="font-semibold text-gray-900 text-lg">{plan.name}</p>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">${plan.monthly}</span>
                  <span className="text-gray-400 text-sm">/mo</span>
                </div>
                <p className="text-xs text-green-600 font-medium mt-0.5">${plan.annual}/yr — 2 months free</p>
              </div>

              <ul className="space-y-2 mb-6 flex-1 text-sm text-gray-600">
                <li className="font-medium text-gray-900">{plan.yards}</li>
                <li className="font-medium text-gray-900">{plan.analyses}</li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
                <Button
                  className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
                  variant={plan.highlight ? "default" : "outline"}
                >
                  Get started
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-gray-400">
          <p>All plans include a 14-day free trial. Cancel anytime. Pause billing for winter.</p>
          <p className="mt-1">Questions? <a href="mailto:contact@yardanalyzer.com" className="underline text-green-600">contact@yardanalyzer.com</a></p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
```

Also create `components/pricing/PricingToggle.tsx` as a client component for the monthly/annual toggle. For now, the toggle can just link to `/pricing?period=monthly` vs `/pricing?period=annual`; the plan links will include `&period=monthly` or `&period=annual`. A full client-side toggle is a nice-to-have — implement the links approach first.

For the initial version, remove `PricingToggle` from the page and instead just show monthly pricing with the annual note. Add this TODO as a future enhancement.

Simplify: remove the `<PricingToggle />` line and the `searchParams` prop. Just show monthly prices with the annual savings note below each price.

- [ ] **Step 2: Add pricing link to homepage nav**

In `app/page.tsx`, add a "Pricing" link to the nav:

```tsx
        <div className="flex gap-2">
          <Link href="/pricing"><Button variant="ghost">Pricing</Button></Link>
          <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
          <Link href="/register"><Button className="bg-green-600 hover:bg-green-700">Get started free</Button></Link>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add app/pricing/page.tsx app/page.tsx
git commit -m "feat: add pricing page with all plan tiers and Stripe checkout links"
```

---

## Task 10: Billing section in settings

**Files:**
- Create: `components/settings/BillingSection.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create BillingSection component**

Create `components/settings/BillingSection.tsx`:

```typescript
"use client";

import Link from "next/link";
import { CreditCard, PauseCircle, PlayCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Props {
  plan: string;
  planStatus: string;
  planLabel: string;
  daysUntilDeletion: number | null;
  currentPeriodEnd: string | null;
  pausedUntil: string | null;
  hasStripeSubscription: boolean;
  trialDaysLeft: number | null;
}

export function BillingSection({
  plan,
  planStatus,
  planLabel,
  daysUntilDeletion,
  currentPeriodEnd,
  pausedUntil,
  hasStripeSubscription,
  trialDaysLeft,
}: Props) {
  const [pausing, setPausing] = useState(false);
  const [pauseMonths, setPauseMonths] = useState(3);
  const [showPauseDialog, setShowPauseDialog] = useState(false);

  async function handlePause() {
    setPausing(true);
    await fetch("/api/stripe/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: pauseMonths }),
    });
    setPausing(false);
    window.location.reload();
  }

  async function handleResume() {
    setPausing(true);
    await fetch("/api/stripe/pause", {
      method: "DELETE",
    });
    setPausing(false);
    window.location.reload();
  }

  const isPaused = planStatus === "paused";
  const isExpired = daysUntilDeletion !== null;
  const isTrial = planStatus === "trialing" || plan === "trial";

  return (
    <div className="space-y-4">
      {/* Current plan */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-gray-900">{planLabel}</p>
          {isTrial && trialDaysLeft !== null && trialDaysLeft > 0 && (
            <p className="text-sm text-gray-500">{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left in free trial</p>
          )}
          {isPaused && pausedUntil && (
            <p className="text-sm text-amber-600">Paused until {new Date(pausedUntil).toLocaleDateString()}</p>
          )}
          {!isTrial && !isPaused && currentPeriodEnd && (
            <p className="text-sm text-gray-500">Renews {new Date(currentPeriodEnd).toLocaleDateString()}</p>
          )}
          {isExpired && (
            <p className="text-sm text-red-600 font-medium">
              {daysUntilDeletion! > 0
                ? `Data deleted in ${daysUntilDeletion} day${daysUntilDeletion !== 1 ? "s" : ""} — upgrade to keep it`
                : "Data scheduled for deletion — upgrade now"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasStripeSubscription ? (
            <a href="/api/stripe/portal">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Manage
              </Button>
            </a>
          ) : (
            <Link href="/pricing">
              <Button size="sm" className="bg-green-600 hover:bg-green-700">Upgrade</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Seasonal pause — only for active paid subscriptions */}
      {hasStripeSubscription && !isTrial && (
        <div className="pt-3 border-t border-gray-100">
          {isPaused ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleResume}
              disabled={pausing}
            >
              <PlayCircle className="w-4 h-4" />
              {pausing ? "Resuming…" : "Resume subscription"}
            </Button>
          ) : (
            <>
              {showPauseDialog ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Pause billing for winter — how long?</p>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5, 6].map((m) => (
                      <button
                        key={m}
                        onClick={() => setPauseMonths(m)}
                        className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                          pauseMonths === m
                            ? "border-green-600 bg-green-50 text-green-700 font-medium"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {m} mo
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handlePause} disabled={pausing} className="bg-amber-600 hover:bg-amber-700">
                      {pausing ? "Pausing…" : `Pause for ${pauseMonths} month${pauseMonths !== 1 ? "s" : ""}`}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowPauseDialog(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                  onClick={() => setShowPauseDialog(true)}
                >
                  <PauseCircle className="w-4 h-4" />
                  Pause for winter
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire BillingSection into settings page**

In `app/(dashboard)/settings/page.tsx`, add subscription fields to the user query:

```typescript
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      notificationsEnabled: true,
      notifyDaysAhead: true,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: true,
      passwordHash: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pausedUntil: true,
      stripeSubscriptionId: true,
    },
  });
```

Import the necessary functions and component:

```typescript
import { BillingSection } from "@/components/settings/BillingSection";
import { CreditCard } from "lucide-react";
import { getPlanLimits, getDaysUntilDeletion, PLAN_LABELS } from "@/lib/subscription";
```

Compute derived values before the return:

```typescript
  const subUser = {
    plan: user.plan,
    planStatus: user.planStatus,
    trialEndsAt: user.trialEndsAt,
    currentPeriodEnd: user.currentPeriodEnd,
    pausedUntil: user.pausedUntil,
  };
  const daysUntilDeletion = getDaysUntilDeletion(subUser);
  const trialDaysLeft = user.trialEndsAt
    ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
```

Add the billing card to the settings JSX (before the notifications card):

```tsx
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Plan & Billing</h2>
          </div>
          <BillingSection
            plan={user.plan}
            planStatus={user.planStatus}
            planLabel={PLAN_LABELS[user.plan] ?? user.plan}
            daysUntilDeletion={daysUntilDeletion}
            currentPeriodEnd={user.currentPeriodEnd?.toISOString() ?? null}
            pausedUntil={user.pausedUntil?.toISOString() ?? null}
            hasStripeSubscription={!!user.stripeSubscriptionId}
            trialDaysLeft={trialDaysLeft}
          />
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add components/settings/BillingSection.tsx app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add billing section to settings with plan status, upgrade CTA, and pause"
```

---

## Task 11: Seasonal pause API

**Files:**
- Create: `app/api/stripe/pause/route.ts`

- [ ] **Step 1: Create pause/resume endpoint**

Create `app/api/stripe/pause/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { months } = await req.json();
  if (!months || months < 1 || months > 6) {
    return NextResponse.json({ error: "months must be 1–6" }, { status: 400 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  const resumesAt = new Date();
  resumesAt.setMonth(resumesAt.getMonth() + months);

  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    pause_collection: {
      behavior: "keep_as_draft",
      resumes_at: Math.floor(resumesAt.getTime() / 1000),
    },
  });

  await db.user.update({
    where: { id: session.user.id },
    data: { planStatus: "paused", pausedUntil: resumesAt },
  });

  return NextResponse.json({ ok: true, resumesAt: resumesAt.toISOString() });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    pause_collection: "",
  });

  await db.user.update({
    where: { id: session.user.id },
    data: { planStatus: "active", pausedUntil: null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/stripe/pause/route.ts
git commit -m "feat: add subscription pause/resume API endpoint"
```

---

## Task 12: Automated account data deletion cron job

**Files:**
- Modify: `app/api/cron/daily/route.ts`

The cron job runs daily. We extend it to delete accounts that have been in expired/canceled state for more than 30 days.

- [ ] **Step 1: Read the existing cron to find where to add deletion**

The cron is in `app/api/cron/daily/route.ts`. It fetches yards, processes tasks, sends emails. We'll add a deletion step at the end, after all other processing.

- [ ] **Step 2: Add the deletion step**

At the bottom of the `GET` handler, after the existing processing, add:

```typescript
  // === Expired account data deletion ===
  // Delete users who have been in expired/canceled state for > 30 days
  const deletionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const usersToDelete = await db.user.findMany({
    where: {
      OR: [
        // Trial expired 30+ days ago and never subscribed
        {
          planStatus: { in: ["trialing", "expired"] },
          trialEndsAt: { lt: deletionCutoff },
          stripeSubscriptionId: null,
        },
        // Canceled subscription, period ended 30+ days ago
        {
          planStatus: "canceled",
          currentPeriodEnd: { lt: deletionCutoff },
        },
      ],
    },
    select: { id: true, email: true },
    take: 50, // process max 50 per day to avoid timeouts
  });

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const user of usersToDelete) {
    try {
      // Find all photo URLs for this user's analyses
      const analyses = await db.lawnAnalysis.findMany({
        where: { yardSection: { yard: { userId: user.id } } },
        select: { imageUrls: true },
      });
      const allUrls = analyses.flatMap((a) => a.imageUrls);

      // Delete photos from Supabase storage
      if (allUrls.length > 0) {
        const paths = allUrls.map((url) => {
          // URL format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
          const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
          return match ? match[1] : null;
        }).filter(Boolean) as string[];

        if (paths.length > 0) {
          await supabase.storage.from("lawn-photos").remove(paths);
        }
      }

      // Delete user record — cascade removes yards, sections, analyses, tasks
      await db.user.delete({ where: { id: user.id } });
      console.log(`Deleted expired account: ${user.email}`);
    } catch (err) {
      console.error(`Failed to delete user ${user.id}:`, err);
    }
  }

  const deletedCount = usersToDelete.length;
```

Also add `deletedCount` to the response JSON at the end of the cron handler:
```typescript
  return NextResponse.json({ processed: userMap.size, deletedAccounts: deletedCount });
```

You'll need `SUPABASE_SERVICE_ROLE_KEY` in env vars (the service role key from Supabase project settings → API → service_role). Add it to `.env` and Vercel environment variables.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/daily/route.ts
git commit -m "feat: auto-delete expired accounts after 30-day grace period in daily cron"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Determine payment model | Plan header + Task 9 (pricing page) |
| Add pause feature for winter | Task 11 (pause API) + Task 10 (BillingSection UI) |
| Standard account = 1 yard | Task 2 (subscription lib: maxYards=1 for starter) |
| Multiple tier SKUs | Plan header + Task 9 |
| Pro/professional unlimited tiers | Plan header: Pro=10, Professional=unlimited |
| Setup payments (Stripe) | Tasks 6, 7, 8 |
| Analyze rate limiting | Task 4 |
| Trial: first task + blurred rest | Task 3 |
| Non-paying customer 30-day period | Task 12 (deletion cron) |
| Stripe webhook to sync subscription state | Task 8 |
| Seasonal pause billing | Task 11 |

**No placeholders found** — all steps contain concrete code.

**Type consistency:** `SubscriptionUser` type used consistently in `getPlanLimits`, `canRunAnalysis`, `canCreateYard`, `getVisibleTasksArgs`, `getDaysUntilDeletion`. All callers pass `{ plan, planStatus, trialEndsAt, currentPeriodEnd, pausedUntil }`.
