# Monetization & Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe-powered subscription tiers with plan enforcement, trial blurring, seasonal pause, self-service cancellation, and automated data deletion for expired accounts.

**Architecture:** A `lib/subscription.ts` helper derives plan limits from User fields; server components gate content before it reaches the browser; Stripe Checkout handles payments; pause and cancel are self-service from the Settings page; a daily cron job deletes accounts that have been expired or canceled for 30 days.

**Tech Stack:** Stripe (payments), Next.js App Router (server components for gating), Prisma (schema), Vitest (tests), existing Supabase storage (photo deletion on account removal)

---

## Pricing Model

| Plan | Monthly | Annual | Yards | Analyses per section per month | Tasks visible |
|---|---|---|---|---|---|
| Trial (14 days) | free | — | 1 | 1 | first only (rest blurred) |
| Expired (grace 30 days) | — | — | 1 | 0 (blocked) | first only (rest blurred) |
| **Home Basic** | $7.99 | $79 | 1 | 2 | all |
| **Home Plus** | $14.99 | $139 | 3 | 3 | all |
| **Professional** | $24.99 | $229 | 10 | unlimited | all |
| **Professional Plus** | $49.99 | $449 | unlimited | unlimited | all |

**Key behaviors:**
- Trial: 14 days from signup; if not paid, enters 30-day grace period before data deletion
- Trials cannot pause — pause is only available to active paid subscribers
- Paused subscription: billing paused 1–6 months, full plan access retained throughout
- Annual plans are approximately 2 months free compared to monthly billing
- Cancel and pause are both available directly from the Settings page

---

## Security Considerations

Security must be a top priority throughout this implementation. Every task must follow these rules:

**Input validation:** Validate all plan and period parameters against an explicit allowlist before making any Stripe API call. Never trust user-supplied strings for plan names.

**Ownership verification:** Before modifying any subscription (pause, cancel, portal), verify the Stripe subscription ID stored in the database matches the authenticated user. Never accept a subscription ID from request parameters.

**Webhook verification:** Always verify the Stripe-Signature header using `stripe.webhooks.constructEvent`. Reject any request that fails signature verification with a 400. Never process webhook data before verifying the signature.

**Idempotent webhook processing:** Webhook events can be delivered more than once. Use `event.id` or check the current DB state before applying changes to avoid double-processing.

**Server-side gating only:** Plan enforcement (task limits, yard limits, analysis limits) must happen exclusively in server code. Never gate features in client-only code — a determined user can bypass it.

**No sensitive data in client responses:** Never return `stripeCustomerId`, `stripeSubscriptionId`, or `stripeSecretKey` to the browser. Return only what the UI needs (plan name, status, period end date).

**Rate limit checkout:** The checkout endpoint creates Stripe customers and sessions. Without rate limiting, a user could spam it to create many Stripe objects. Check that the user does not already have an active subscription before creating a new checkout session.

---

## File Map

**New files:**
- `lib/subscription.ts` — plan limits, effective plan calculation, all gating helpers
- `lib/__tests__/subscription.test.ts` — unit tests for subscription lib
- `lib/stripe.ts` — Stripe client singleton and price map
- `app/api/stripe/checkout/route.ts` — create Stripe Checkout session
- `app/api/stripe/webhook/route.ts` — handle Stripe subscription lifecycle events
- `app/api/stripe/portal/route.ts` — redirect to Stripe Customer Portal
- `app/api/stripe/pause/route.ts` — pause and resume subscription (POST = pause, DELETE = resume)
- `app/api/stripe/cancel/route.ts` — cancel subscription at period end (POST)
- `app/api/stripe/change-plan/route.ts` — upgrade or downgrade to a different plan with immediate proration
- `app/pricing/page.tsx` — public pricing page
- `components/settings/BillingSection.tsx` — billing UI (plan status, upgrade/downgrade, pause, cancel)
- `components/dashboard/LockedTaskCard.tsx` — blurred placeholder for gated tasks
- `prisma/migrations/20260610000000_add_subscription_fields/migration.sql`

**Modified files:**
- `prisma/schema.prisma` — add 7 subscription fields to User model
- `app/api/auth/register/route.ts` — set trialEndsAt on new user
- `app/api/analyze/route.ts` — analysis rate limit check
- `app/api/yard/route.ts` — yard creation limit check
- `app/(dashboard)/yard/[id]/page.tsx` — gate tasks server-side, show expiry banner
- `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` — gate tasks server-side, show analysis usage status
- `app/(dashboard)/dashboard/page.tsx` — gate tasks, add trial/expiry banner
- `app/(dashboard)/settings/page.tsx` — add BillingSection
- `components/dashboard/TaskList.tsx` — accept `hiddenTaskCount` prop, render LockedTaskCards
- `app/api/cron/daily/route.ts` — add expired-account deletion step
- `app/page.tsx` — add Pricing link to homepage nav

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

-- Backfill trialEndsAt for existing users based on their signup date
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
  canPause,
  getVisibleTasksArgs,
  getDaysUntilDeletion,
  PLAN_LABELS,
} from "../subscription";

const makeUser = (overrides: object) => ({
  plan: "trial",
  planStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
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
    const limits = getPlanLimits(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }));
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(0);
    expect(limits.canRunAnalysis).toBe(false);
    expect(limits.maxVisibleTasks).toBe(1);
  });

  it("returns home_basic limits for active home_basic subscriber", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_basic", planStatus: "active", trialEndsAt: null }));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(2);
    expect(limits.maxVisibleTasks).toBe(-1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns home_plus limits for home_plus plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_plus", planStatus: "active" }));
    expect(limits.maxYards).toBe(3);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(3);
  });

  it("returns 10 yards and unlimited analyses for professional plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "professional", planStatus: "active" }));
    expect(limits.maxYards).toBe(10);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(-1);
  });

  it("returns unlimited yards for professional_plus plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "professional_plus", planStatus: "active" }));
    expect(limits.maxYards).toBe(-1);
  });

  it("returns full plan access when paused", () => {
    const limits = getPlanLimits(makeUser({
      plan: "home_basic",
      planStatus: "paused",
      pausedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }));
    expect(limits.maxYards).toBe(1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when planStatus is canceled", () => {
    const limits = getPlanLimits(makeUser({ planStatus: "canceled" }));
    expect(limits.canRunAnalysis).toBe(false);
  });
});

describe("canRunAnalysis", () => {
  it("allows when under monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_basic", planStatus: "active" }), 1)).toBe(true);
  });

  it("blocks when at monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_basic", planStatus: "active" }), 2)).toBe(false);
  });

  it("always allows when limit is -1 (unlimited)", () => {
    expect(canRunAnalysis(makeUser({ plan: "professional", planStatus: "active" }), 100)).toBe(true);
  });

  it("blocks when expired", () => {
    expect(canRunAnalysis(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }), 0)).toBe(false);
  });
});

describe("canCreateYard", () => {
  it("allows when under limit", () => {
    expect(canCreateYard(makeUser({ plan: "home_plus", planStatus: "active" }), 2)).toBe(true);
  });

  it("blocks when at limit", () => {
    expect(canCreateYard(makeUser({ plan: "home_plus", planStatus: "active" }), 3)).toBe(false);
  });

  it("allows unlimited yards for professional_plus", () => {
    expect(canCreateYard(makeUser({ plan: "professional_plus", planStatus: "active" }), 999)).toBe(true);
  });
});

describe("canPause", () => {
  it("allows pause for active paid subscriber", () => {
    expect(canPause(makeUser({ plan: "home_basic", planStatus: "active" }))).toBe(true);
  });

  it("blocks pause for trial user", () => {
    expect(canPause(makeUser({ plan: "trial", planStatus: "trialing" }))).toBe(false);
  });

  it("blocks pause for expired user", () => {
    expect(canPause(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }))).toBe(false);
  });

  it("blocks pause when already paused", () => {
    expect(canPause(makeUser({ plan: "home_basic", planStatus: "paused" }))).toBe(false);
  });
});

describe("getVisibleTasksArgs", () => {
  it("returns {take: 1} for trial user", () => {
    const args = getVisibleTasksArgs(makeUser({}));
    expect(args.take).toBe(1);
  });

  it("returns {} for paid user (no limit)", () => {
    const args = getVisibleTasksArgs(makeUser({ plan: "home_basic", planStatus: "active" }));
    expect(args.take).toBeUndefined();
  });
});

describe("getDaysUntilDeletion", () => {
  it("returns null for active paid users", () => {
    expect(getDaysUntilDeletion(makeUser({ plan: "home_basic", planStatus: "active" }))).toBeNull();
  });

  it("returns positive number during grace period", () => {
    const expired = makeUser({ trialEndsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
    const days = getDaysUntilDeletion(expired);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("returns 0 or negative when deletion is overdue", () => {
    const longExpired = makeUser({ trialEndsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) });
    const days = getDaysUntilDeletion(longExpired);
    expect(days).toBeLessThanOrEqual(0);
  });
});

describe("PLAN_LABELS", () => {
  it("has correct display labels for all plans", () => {
    expect(PLAN_LABELS.trial).toBe("Free Trial");
    expect(PLAN_LABELS.home_basic).toBe("Home Basic");
    expect(PLAN_LABELS.home_plus).toBe("Home Plus");
    expect(PLAN_LABELS.professional).toBe("Professional");
    expect(PLAN_LABELS.professional_plus).toBe("Professional Plus");
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
export type Plan = "trial" | "home_basic" | "home_plus" | "professional" | "professional_plus";
export type PlanStatus = "trialing" | "active" | "paused" | "expired" | "canceled";

export interface PlanLimits {
  maxYards: number;                       // -1 = unlimited
  maxAnalysesPerSectionPerMonth: number;  // -1 = unlimited, 0 = blocked
  maxVisibleTasks: number;                // -1 = unlimited, 1 = first task only
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
  trial:             { maxYards: 1,  maxAnalysesPerSectionPerMonth: 1,  maxVisibleTasks: 1,  canRunAnalysis: true  },
  expired:           { maxYards: 1,  maxAnalysesPerSectionPerMonth: 0,  maxVisibleTasks: 1,  canRunAnalysis: false },
  home_basic:        { maxYards: 1,  maxAnalysesPerSectionPerMonth: 2,  maxVisibleTasks: -1, canRunAnalysis: true  },
  home_plus:         { maxYards: 3,  maxAnalysesPerSectionPerMonth: 3,  maxVisibleTasks: -1, canRunAnalysis: true  },
  professional:      { maxYards: 10, maxAnalysesPerSectionPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true  },
  professional_plus: { maxYards: -1, maxAnalysesPerSectionPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true  },
};

export const PLAN_LABELS: Record<string, string> = {
  trial:             "Free Trial",
  home_basic:        "Home Basic",
  home_plus:         "Home Plus",
  professional:      "Professional",
  professional_plus: "Professional Plus",
};

/** Returns true if the user's trial or subscription has effectively expired. */
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
  // Paused users retain their paid plan limits — they paused billing, not access
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

/** Pause is only available for active paid subscribers — not trial, expired, or already paused. */
export function canPause(user: SubscriptionUser): boolean {
  if (user.planStatus !== "active") return false;
  if (user.plan === "trial") return false;
  return true;
}

/** Returns the Prisma `take` argument for task queries. Undefined means no limit. */
export function getVisibleTasksArgs(user: SubscriptionUser): { take?: number } {
  const limits = getPlanLimits(user);
  if (limits.maxVisibleTasks === -1) return {};
  return { take: limits.maxVisibleTasks };
}

/**
 * Returns days remaining before account data is deleted.
 * Returns null for active paid users (not in deletion window).
 * Returns 0 or a negative number when deletion is overdue.
 */
export function getDaysUntilDeletion(user: SubscriptionUser): number | null {
  if (!isEffectivelyExpired(user)) return null;
  const expiryDate = user.trialEndsAt ?? user.currentPeriodEnd ?? new Date(0);
  const deleteAt = new Date(expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((deleteAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/subscription.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts lib/__tests__/subscription.test.ts
git commit -m "feat: add subscription helper lib with plan limits, gating, and pause guard"
```

---

## Task 3: Gate task visibility server-side and add blurred UI

**Files:**
- Create: `components/dashboard/LockedTaskCard.tsx`
- Modify: `components/dashboard/TaskList.tsx`
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
        {/* Blurred fake content skeleton — aria-hidden so screen readers skip it */}
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
        {/* Upgrade overlay */}
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

- [ ] **Step 2: Add `hiddenTaskCount` prop to TaskList**

In `components/dashboard/TaskList.tsx`:

1. Add import at top of file:
```typescript
import { LockedTaskCard } from "./LockedTaskCard";
```

2. Find the exported component's props interface and add:
```typescript
  hiddenTaskCount?: number;
```

3. Add `Lock` to the lucide-react imports if not already present.

4. In the component JSX, after all existing task group rendering (after the completed tasks section), add:
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

5. If `YardTasksSection` is a separate exported function in the same file, add `hiddenTaskCount?: number` to its props and pass it through to the inner `TaskList` call.

- [ ] **Step 3: Gate tasks in yard detail page**

In `app/(dashboard)/yard/[id]/page.tsx`, replace the existing `user` query (which only selects `weatherWidgetCollapsed`) with one that also fetches subscription fields:

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

Add the import at the top of the file:
```typescript
import { getPlanLimits, getDaysUntilDeletion } from "@/lib/subscription";
```

After fetching `yard`, compute task gating:

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

In the JSX, after the weather widget and before sections, add an expiry banner:

```tsx
      {daysUntilDeletion !== null && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
          daysUntilDeletion <= 7
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}>
          {daysUntilDeletion > 0
            ? <>Your free trial has ended. <strong>Your data will be deleted in {daysUntilDeletion} day{daysUntilDeletion !== 1 ? "s" : ""}</strong> unless you <a href="/pricing" className="underline font-semibold">upgrade your plan</a>.</>
            : <>Your free trial has ended and your data is scheduled for deletion. <a href="/pricing" className="underline font-semibold">Upgrade now</a> to keep your data.</>
          }
        </div>
      )}
```

Pass `visibleTasks` (not `allTasks`) and `hiddenTaskCount` to `<YardTasksSection>`.

- [ ] **Step 4: Gate tasks in section detail page**

In `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`, after fetching the section, add:

```typescript
  import { getPlanLimits } from "@/lib/subscription";

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

- [ ] **Step 5: Gate tasks on dashboard**

In `app/(dashboard)/dashboard/page.tsx`, update the `user` select to include subscription fields:

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

  const subUser = user ?? { plan: "trial", planStatus: "trialing", trialEndsAt: null, currentPeriodEnd: null, pausedUntil: null };
  const limits = getPlanLimits(subUser);
  const daysUntilDeletion = getDaysUntilDeletion(subUser);

  const visibleTasks = limits.maxVisibleTasks === -1
    ? tasks
    : tasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = tasks.length - visibleTasks.length;
```

Pass `visibleTasks`, `hiddenTaskCount`, and `daysUntilDeletion` to `<DashboardInteractiveSection>`. Update `DashboardInteractiveSection`'s props interface and thread these values down to `TaskList`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/LockedTaskCard.tsx components/dashboard/TaskList.tsx app/\(dashboard\)/yard/\[id\]/page.tsx app/\(dashboard\)/yard/\[id\]/sections/\[sectionId\]/page.tsx app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: gate task visibility by plan with blurred locked cards for trial users"
```

---

## Task 4: Analysis rate limiting

**Files:**
- Modify: `app/api/analyze/route.ts`
- Modify: `app/(dashboard)/analyze/page.tsx`

- [ ] **Step 1: Add plan check to analyze API**

In `app/api/analyze/route.ts`, add this import at the top:

```typescript
import { canRunAnalysis, getPlanLimits } from "@/lib/subscription";
```

Inside the `POST` handler, after verifying the session and before fetching `section`, add:

```typescript
  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });

  // Count analyses for this section in the current calendar month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyCount = await db.lawnAnalysis.count({
    where: { yardSectionId: sectionId, createdAt: { gte: startOfMonth } },
  });

  if (!canRunAnalysis(subUser, monthlyCount)) {
    const limits = getPlanLimits(subUser);
    const message = limits.canRunAnalysis
      ? `You have used all ${limits.maxAnalysesPerSectionPerMonth} analyses for this section this month. Your limit resets on the 1st of next month.`
      : "Upgrade your plan to analyze your lawn with AI.";
    return NextResponse.json({ error: "analysis_limit_reached", message }, { status: 403 });
  }
```

- [ ] **Step 2: Show the error in the analyze page UI**

In `app/(dashboard)/analyze/page.tsx`, update the error handler in `handleUploaded`:

```typescript
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "analysis_limit_reached") {
          setAnalysisError(data.message ?? "Analysis limit reached. Upgrade your plan to analyze more.");
        } else {
          setAnalysisError("Analysis failed. Please try again.");
        }
        return;
      }
```

Update the error display in the JSX:

```tsx
          {analysisError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 mt-4 flex items-start justify-between gap-3">
              <span>{analysisError}</span>
              {analysisError.includes("limit") && (
                <a href="/pricing" className="shrink-0 underline font-semibold hover:text-red-800">
                  View plans
                </a>
              )}
            </div>
          )}
```

- [ ] **Step 3: Show analysis usage on the section detail page**

In `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`, add the user subscription query alongside the existing section query:

```typescript
import { canRunAnalysis, getPlanLimits, PLAN_LABELS } from "@/lib/subscription";
```

After the session check, fetch user subscription fields:

```typescript
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyAnalysisCount = await db.lawnAnalysis.count({
    where: { yardSectionId: sectionId, createdAt: { gte: startOfMonth } },
  });

  const limits = getPlanLimits(user);
  const analysisLimitReached = !canRunAnalysis(user, monthlyAnalysisCount);
  const analysisLimitText =
    limits.maxAnalysesPerSectionPerMonth === -1
      ? null
      : `${monthlyAnalysisCount} of ${limits.maxAnalysesPerSectionPerMonth} analyses used this month`;
```

In the JSX, above the Analyze button (the Camera icon button linking to the analyze page), insert:

```tsx
        {analysisLimitReached ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-3">
            <span>
              You have used all your analyses for this month.{" "}
              <strong>Limit resets on the 1st of next month.</strong>
            </span>
            <Link
              href="/pricing"
              className="shrink-0 text-green-700 font-semibold underline hover:text-green-900"
            >
              Upgrade for more
            </Link>
          </div>
        ) : analysisLimitText ? (
          <p className="text-xs text-gray-400">{analysisLimitText}</p>
        ) : null}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze/route.ts app/\(dashboard\)/analyze/page.tsx app/\(dashboard\)/yard/\[id\]/sections/\[sectionId\]/page.tsx
git commit -m "feat: enforce monthly analysis limits per plan with upgrade prompt"
```

---

## Task 5: Yard creation limit

**Files:**
- Modify: `app/api/yard/route.ts`

- [ ] **Step 1: Add yard limit check to POST handler**

In `app/api/yard/route.ts`, add this import at the top:

```typescript
import { canCreateYard, getPlanLimits } from "@/lib/subscription";
```

Inside the `POST` handler, after parsing the body and before creating the yard:

```typescript
  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });
  const yardCount = await db.yard.count({ where: { userId: session.user.id } });

  if (!canCreateYard(subUser, yardCount)) {
    const limits = getPlanLimits(subUser);
    const max = limits.maxYards;
    return NextResponse.json(
      {
        error: "yard_limit_reached",
        message: `Your plan allows up to ${max} yard${max !== 1 ? "s" : ""}. Upgrade to Home Plus or higher to add more yards.`,
      },
      { status: 403 }
    );
  }
```

- [ ] **Step 2: Handle the error in yard setup form**

Find the component that calls `POST /api/yard` (in `app/(dashboard)/yard/setup/` or a form component). Update the error handling:

```typescript
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "yard_limit_reached") {
          setError(data.message);
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

## Task 6: Stripe SDK setup

**Files:**
- Modify: `package.json` (install stripe)
- Create: `lib/stripe.ts`

- [ ] **Step 1: Install Stripe**

```bash
npm install stripe
```

Expected: stripe added to `dependencies`.

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

// All valid plan keys. Used to validate user input — never trust raw request params.
export const VALID_PLANS = ["home_basic", "home_plus", "professional", "professional_plus"] as const;
export type StripePlan = typeof VALID_PLANS[number];

export const VALID_PERIODS = ["monthly", "annual"] as const;
export type StripePeriod = typeof VALID_PERIODS[number];

export const STRIPE_PRICES: Record<StripePlan, Record<StripePeriod, string>> = {
  home_basic:        { monthly: process.env.STRIPE_PRICE_HOME_BASIC_MONTHLY ?? "",  annual: process.env.STRIPE_PRICE_HOME_BASIC_ANNUAL ?? "" },
  home_plus:         { monthly: process.env.STRIPE_PRICE_HOME_PLUS_MONTHLY ?? "",   annual: process.env.STRIPE_PRICE_HOME_PLUS_ANNUAL ?? "" },
  professional:      { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",         annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "" },
  professional_plus: { monthly: process.env.STRIPE_PRICE_PRO_PLUS_MONTHLY ?? "",    annual: process.env.STRIPE_PRICE_PRO_PLUS_ANNUAL ?? "" },
};

/** Derive plan name from a Stripe price ID. Returns null if the price is unrecognized. */
export function planFromPriceId(priceId: string): StripePlan | null {
  for (const [plan, prices] of Object.entries(STRIPE_PRICES) as [StripePlan, Record<string, string>][]) {
    if (prices.monthly === priceId || prices.annual === priceId) return plan;
  }
  return null;
}

/** Type guard: ensure a string is a valid plan key. */
export function isValidPlan(value: unknown): value is StripePlan {
  return VALID_PLANS.includes(value as StripePlan);
}

/** Type guard: ensure a string is a valid billing period. */
export function isValidPeriod(value: unknown): value is StripePeriod {
  return VALID_PERIODS.includes(value as StripePeriod);
}
```

- [ ] **Step 3: Set up Stripe products (manual — do once in Stripe dashboard)**

In the Stripe dashboard, create four products with monthly and annual prices:

| Product name | Monthly price | Annual price | Metadata |
|---|---|---|---|
| Yard Analyzer Home Basic | $7.99 | $79.00 | `plan = home_basic` |
| Yard Analyzer Home Plus | $14.99 | $139.00 | `plan = home_plus` |
| Yard Analyzer Professional | $24.99 | $229.00 | `plan = professional` |
| Yard Analyzer Professional Plus | $49.99 | $449.00 | `plan = professional_plus` |

After creating each price, copy its ID (starts with `price_`) into the environment variables below.

**Add to `.env` (local) and Vercel environment variables:**

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_HOME_BASIC_MONTHLY=price_xxx
STRIPE_PRICE_HOME_BASIC_ANNUAL=price_xxx
STRIPE_PRICE_HOME_PLUS_MONTHLY=price_xxx
STRIPE_PRICE_HOME_PLUS_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
STRIPE_PRICE_PRO_PLUS_MONTHLY=price_xxx
STRIPE_PRICE_PRO_PLUS_ANNUAL=price_xxx
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe.ts package.json package-lock.json
git commit -m "feat: add Stripe client lib with validated plan/period type guards"
```

---

## Task 7: Stripe Checkout and Portal redirect APIs

**Files:**
- Create: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/portal/route.ts`

**Security requirements for this task:**
- Validate `plan` and `period` params against allowlists before using them — never pass raw user input to Stripe
- Prevent users with active subscriptions from creating a second checkout session
- Verify Stripe customer ownership by looking up `stripeCustomerId` from the authenticated session, never from request params

- [ ] **Step 1: Create the checkout endpoint**

Create `app/api/stripe/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const planParam = searchParams.get("plan");
  const periodParam = searchParams.get("period") ?? "monthly";

  // Validate inputs against explicit allowlists — never trust raw user input
  if (!isValidPlan(planParam) || !isValidPeriod(periodParam)) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[planParam][periodParam];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured" }, { status: 500 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, stripeSubscriptionId: true, name: true, email: true },
  });

  // Prevent creating a checkout session if the user already has an active subscription
  if (user.stripeSubscriptionId) {
    return NextResponse.redirect(new URL("/settings", req.url));
  }

  // Create or retrieve Stripe customer — always use our DB record, never a param
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
      metadata: { userId: session.user.id, plan: planParam },
    },
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.redirect(checkoutSession.url);
}
```

- [ ] **Step 2: Create the Customer Portal redirect**

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

  // Fetch stripeCustomerId from our DB — never accept it from request params
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

**Security requirements:**
- Verify the Stripe-Signature header before reading any event data — reject immediately if verification fails
- Use `planFromPriceId` from `lib/stripe.ts`; if the price is unrecognized, log and skip rather than corrupting the user's plan
- Look up the user by `stripeCustomerId` stored in our DB, not by any ID from webhook payload
- Handle duplicate delivery: if the user's `stripeSubscriptionId` already matches and the plan/status are unchanged, skip the update

- [ ] **Step 1: Create the webhook handler**

Create `app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";

async function updateUserFromSubscription(sub: Stripe.Subscription) {
  // Look up user by our stored customerId — never trust payload userId directly
  const user = await db.user.findUnique({
    where: { stripeCustomerId: sub.customer as string },
    select: { id: true, plan: true, planStatus: true },
  });
  if (!user) return; // Customer exists in Stripe but not in our DB; skip

  const priceId = sub.items.data[0]?.price.id ?? "";
  const plan = planFromPriceId(priceId);
  if (!plan) {
    console.warn(`Webhook: unrecognized priceId ${priceId} for customer ${sub.customer}`);
    return;
  }

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

  // Skip update if nothing changed (idempotency guard)
  if (user.plan === plan && user.planStatus === planStatus && !sub.pause_collection) {
    return;
  }

  await db.user.update({
    where: { id: user.id },
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

  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        if (checkoutSession.mode === "subscription" && checkoutSession.subscription) {
          const sub = await stripe.subscriptions.retrieve(checkoutSession.subscription as string);
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
  } catch (err) {
    console.error(`Webhook processing failed for event ${event.type}:`, err);
    // Return 200 to prevent Stripe from retrying events we've already partially processed
    return NextResponse.json({ received: true, error: "Processing error" });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Register the webhook in Stripe dashboard**

In Stripe dashboard → Developers → Webhooks:
- Add endpoint: `https://yourdomain.com/api/stripe/webhook`
- Listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`
- Copy the webhook signing secret into the `STRIPE_WEBHOOK_SECRET` environment variable

For local testing, run in a separate terminal:
```bash
npx stripe listen --forward-to localhost:3000/api/stripe/webhook
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: add Stripe webhook handler with signature verification and idempotency guard"
```

---

## Task 9: Pricing page

**Files:**
- Create: `app/pricing/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the pricing page**

Create `app/pricing/page.tsx`:

```typescript
import Link from "next/link";
import Image from "next/image";
import { CheckCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pricing – Yard Analyzer" };

const PLANS = [
  {
    name: "Home Basic",
    key: "home_basic",
    monthly: 7.99,
    annual: 79,
    highlight: false,
    yards: "1 yard",
    analyses: "2 analyses per section per month",
    features: [
      "All AI task recommendations",
      "Schedule reminders by email",
      "5-day weather integration",
      "Seasonal billing pause",
    ],
  },
  {
    name: "Home Plus",
    key: "home_plus",
    monthly: 14.99,
    annual: 139,
    highlight: true,
    yards: "Up to 3 yards",
    analyses: "3 analyses per section per month",
    features: [
      "Everything in Home Basic",
      "Multi-yard dashboard",
      "Per-section watering and mowing schedules",
    ],
  },
  {
    name: "Professional",
    key: "professional",
    monthly: 24.99,
    annual: 229,
    highlight: false,
    yards: "Up to 10 yards",
    analyses: "Unlimited analyses",
    features: [
      "Everything in Home Plus",
      "Unlimited photo analyses",
      "Ideal for rental owners and HOAs",
    ],
  },
  {
    name: "Professional Plus",
    key: "professional_plus",
    monthly: 49.99,
    annual: 449,
    highlight: false,
    yards: "Unlimited yards",
    analyses: "Unlimited analyses",
    features: [
      "Everything in Professional",
      "Unlimited yards",
      "Ideal for landscapers and property managers",
    ],
  },
];

export default function PricingPage() {
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
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Most popular
                </div>
              )}
              <div className="mb-4">
                <p className="font-semibold text-gray-900 text-lg">{plan.name}</p>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">${plan.monthly}</span>
                  <span className="text-gray-400 text-sm"> per month</span>
                </div>
                <p className="text-xs text-green-600 font-medium mt-0.5">
                  ${plan.annual} per year — save 2 months
                </p>
              </div>

              <ul className="space-y-2 mb-6 flex-1 text-sm text-gray-600">
                <li className="font-semibold text-gray-900">{plan.yards}</li>
                <li className="font-medium text-gray-700">{plan.analyses}</li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
                  <Button
                    className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    Start free trial
                  </Button>
                </Link>
                <Link href={`/api/stripe/checkout?plan=${plan.key}&period=annual`}>
                  <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500">
                    or pay annually and save
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-gray-400 space-y-1">
          <p>All plans include a 14-day free trial. No credit card required to start.</p>
          <p>Cancel or pause anytime from your settings. Your data is retained for 30 days after cancellation.</p>
          <p className="mt-2">Questions? <a href="mailto:contact@yardanalyzer.com" className="underline text-green-600">contact@yardanalyzer.com</a></p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Add Pricing link to homepage nav**

In `app/page.tsx`, add a Pricing link to the nav:

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

## Task 10: Billing section in settings (pause and cancel)

**Files:**
- Create: `components/settings/BillingSection.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

Both pause and cancel must be prominent, clear, and require a single confirmation step. No hunting for a "manage" link that takes you offsite.

- [ ] **Step 1: Create BillingSection component**

Create `components/settings/BillingSection.tsx`:

```typescript
"use client";

import Link from "next/link";
import { CreditCard, PauseCircle, PlayCircle, XCircle, ExternalLink } from "lucide-react";
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
  canPauseSubscription: boolean;
}

type Dialog = "pause" | "cancel" | null;

export function BillingSection({
  plan,
  planStatus,
  planLabel,
  daysUntilDeletion,
  currentPeriodEnd,
  pausedUntil,
  hasStripeSubscription,
  trialDaysLeft,
  canPauseSubscription,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [pauseMonths, setPauseMonths] = useState(3);
  const [dialog, setDialog] = useState<Dialog>(null);

  const isPaused = planStatus === "paused";
  const isTrial = planStatus === "trialing" || plan === "trial";
  const isExpired = daysUntilDeletion !== null;

  async function handlePause() {
    setBusy(true);
    await fetch("/api/stripe/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: pauseMonths }),
    });
    setBusy(false);
    setDialog(null);
    window.location.reload();
  }

  async function handleResume() {
    setBusy(true);
    await fetch("/api/stripe/pause", { method: "DELETE" });
    setBusy(false);
    window.location.reload();
  }

  async function handleCancel() {
    setBusy(true);
    await fetch("/api/stripe/cancel", { method: "POST" });
    setBusy(false);
    setDialog(null);
    window.location.reload();
  }

  return (
    <div className="space-y-5">
      {/* Current plan status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900 text-base">{planLabel}</p>
          {isTrial && trialDaysLeft !== null && trialDaysLeft > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining in your free trial
            </p>
          )}
          {isPaused && pausedUntil && (
            <p className="text-sm text-amber-600 mt-0.5">
              Billing paused until {new Date(pausedUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {!isTrial && !isPaused && currentPeriodEnd && (
            <p className="text-sm text-gray-500 mt-0.5">
              Renews {new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {isExpired && (
            <p className="text-sm text-red-600 font-medium mt-0.5">
              {daysUntilDeletion! > 0
                ? `Your data will be deleted in ${daysUntilDeletion} day${daysUntilDeletion !== 1 ? "s" : ""} — upgrade to keep it`
                : "Your data is scheduled for deletion — upgrade now"}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {hasStripeSubscription ? (
            <a href="/api/stripe/portal">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Manage billing
              </Button>
            </a>
          ) : (
            <Link href="/pricing">
              <Button size="sm" className="bg-green-600 hover:bg-green-700">Upgrade plan</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Pause and Cancel — only for active paid subscribers */}
      {hasStripeSubscription && !isTrial && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Subscription options</p>

          {/* Pause */}
          {isPaused ? (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-amber-800">Billing is paused</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Resumes {pausedUntil ? new Date(pausedUntil).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "automatically"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={handleResume}
                disabled={busy}
              >
                <PlayCircle className="w-4 h-4" />
                {busy ? "Resuming…" : "Resume now"}
              </Button>
            </div>
          ) : canPauseSubscription && dialog !== "cancel" ? (
            dialog === "pause" ? (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-3">
                <p className="text-sm font-medium text-gray-800">Pause billing for winter — how long?</p>
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
                      {m} month{m !== 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Your plan and all data are preserved. Billing resumes automatically.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handlePause}
                    disabled={busy}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {busy ? "Pausing…" : `Pause for ${pauseMonths} month${pauseMonths !== 1 ? "s" : ""}`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setDialog("pause")}
                className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 font-medium"
              >
                <PauseCircle className="w-4 h-4" />
                Pause billing for winter
              </button>
            )
          ) : null}

          {/* Cancel */}
          {dialog === "cancel" ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-red-800">Cancel your subscription?</p>
              <p className="text-xs text-red-600">
                You keep full access until{" "}
                {currentPeriodEnd
                  ? new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                  : "the end of your billing period"}
                . After that, your data is retained for 30 days before deletion.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  {busy ? "Canceling…" : "Yes, cancel my subscription"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                  Keep my plan
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDialog("cancel")}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              <XCircle className="w-4 h-4" />
              Cancel subscription
            </button>
          )}
        </div>
      )}

      {/* Trial upgrade prompt */}
      {isTrial && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500 mb-2">
            Unlock unlimited recommendations, multiple yards, and more.
          </p>
          <Link href="/pricing">
            <Button className="bg-green-600 hover:bg-green-700 w-full">See all plans</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire BillingSection into settings page**

In `app/(dashboard)/settings/page.tsx`, replace the existing `user` select with one that includes subscription fields:

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

Add imports:

```typescript
import { BillingSection } from "@/components/settings/BillingSection";
import { CreditCard } from "lucide-react";
import { getDaysUntilDeletion, PLAN_LABELS, canPause } from "@/lib/subscription";
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
  const canPauseSubscription = canPause(subUser);
```

Add the billing card as the first card in the settings page (before notifications):

```tsx
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
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
            canPauseSubscription={canPauseSubscription}
          />
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add components/settings/BillingSection.tsx app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add billing section to settings with plan status, pause, and cancel"
```

---

## Task 11: Seasonal pause API

**Files:**
- Create: `app/api/stripe/pause/route.ts`

**Security requirements:**
- Verify the user is authenticated before any action
- Look up the subscription ID from our DB — never accept it from the request body
- Enforce the `canPause` rule: reject trial users, already-paused users

- [ ] **Step 1: Create the pause and resume endpoint**

Create `app/api/stripe/pause/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { canPause } from "@/lib/subscription";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const months = Number(body.months);
  if (!Number.isInteger(months) || months < 1 || months > 6) {
    return NextResponse.json({ error: "months must be an integer between 1 and 6" }, { status: 400 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      stripeSubscriptionId: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      pausedUntil: true,
    },
  });

  // Enforce: trials cannot pause, already-paused cannot pause again
  if (!canPause(user)) {
    return NextResponse.json(
      { error: "Pause is not available for your current plan or status" },
      { status: 403 }
    );
  }

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
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

export async function DELETE(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
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
git commit -m "feat: add subscription pause and resume API with trial guard"
```

---

## Task 12: Cancel subscription API

**Files:**
- Create: `app/api/stripe/cancel/route.ts`

**Security requirements:**
- Authenticated users only
- Use the subscription ID from our DB, not from the request
- Use `cancel_at_period_end: true` so the user retains access until the billing period ends (not an immediate cut-off)

- [ ] **Step 1: Create the cancel endpoint**

Create `app/api/stripe/cancel/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Always fetch the subscription ID from our DB — never from request params
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true, planStatus: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  if (user.planStatus === "canceled") {
    return NextResponse.json({ error: "Subscription is already canceled" }, { status: 400 });
  }

  // cancel_at_period_end: true means access continues until the current period ends,
  // then Stripe fires customer.subscription.deleted which sets planStatus = "canceled"
  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/stripe/cancel/route.ts
git commit -m "feat: add subscription cancellation endpoint using cancel_at_period_end"
```

---

## Task 13: Automated account data deletion cron job

**Files:**
- Modify: `app/api/cron/daily/route.ts`

The cron job already runs daily. We extend it with a deletion step that removes accounts that have been in an expired or canceled state for more than 30 days.

- [ ] **Step 1: Add the deletion step at the end of the cron handler**

In `app/api/cron/daily/route.ts`, inside the `GET` handler after all existing processing, add:

```typescript
  // === Expired account data deletion ===
  // Runs last so it cannot interfere with earlier processing in the same run
  const deletionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const usersToDelete = await db.user.findMany({
    where: {
      OR: [
        // Trial expired 30 or more days ago and user never subscribed
        {
          planStatus: { in: ["trialing", "expired"] },
          trialEndsAt: { lt: deletionCutoff },
          stripeSubscriptionId: null,
        },
        // Paid subscription canceled and billing period ended 30 or more days ago
        {
          planStatus: "canceled",
          currentPeriodEnd: { lt: deletionCutoff },
        },
      ],
    },
    select: { id: true, email: true },
    take: 50, // process at most 50 per run to avoid cron timeouts
  });

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let deletedCount = 0;
  for (const user of usersToDelete) {
    try {
      // Collect all photo URLs from this user's analyses before deleting records
      const analyses = await db.lawnAnalysis.findMany({
        where: { yardSection: { yard: { userId: user.id } } },
        select: { imageUrls: true },
      });
      const allUrls = analyses.flatMap((a) => a.imageUrls);

      if (allUrls.length > 0) {
        // Extract storage paths from full Supabase URLs
        // URL format: https://xxx.supabase.co/storage/v1/object/public/lawn-photos/path/to/file.jpg
        const paths = allUrls
          .map((url) => {
            const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
            return match ? match[1] : null;
          })
          .filter((p): p is string => p !== null);

        if (paths.length > 0) {
          await supabase.storage.from("lawn-photos").remove(paths);
        }
      }

      // Delete user record — all related records cascade automatically
      await db.user.delete({ where: { id: user.id } });
      deletedCount++;
      console.log(`Deleted expired account: ${user.email}`);
    } catch (err) {
      console.error(`Failed to delete user ${user.id}:`, err);
    }
  }
```

Update the final `return` statement in the cron handler to include `deletedCount`:

```typescript
  return NextResponse.json({ processed: userMap.size, deletedAccounts: deletedCount });
```

Add `SUPABASE_SERVICE_ROLE_KEY` to `.env` (local) and Vercel environment variables. This is the service role key from Supabase project settings → API.

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/daily/route.ts
git commit -m "feat: auto-delete expired accounts after 30-day grace period in daily cron"
```

---

## Task 14: Plan upgrade and downgrade from settings

**Files:**
- Create: `app/api/stripe/change-plan/route.ts`
- Modify: `components/settings/BillingSection.tsx`

Subscribers must be able to switch between any two paid plans directly from the Settings page without leaving the app. Stripe automatically prorates billing for mid-cycle changes — the user is charged or credited the difference immediately.

**Security requirements:**
- Validate `plan` and `period` against allowlists before any Stripe call
- Fetch subscription ID from DB — never from the request body
- Block the request if the user does not have an active Stripe subscription

- [ ] **Step 1: Create the change-plan API**

Create `app/api/stripe/change-plan/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { plan, period } = body;

  // Validate inputs against explicit allowlists — never pass raw user input to Stripe
  if (!isValidPlan(plan) || !isValidPeriod(period)) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[plan][period];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured" }, { status: 500 });
  }

  // Always look up the subscription ID from our DB — never trust request params
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true, plan: true, planStatus: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  if (user.planStatus === "canceled") {
    return NextResponse.json({ error: "Subscription is canceled" }, { status: 400 });
  }

  // Retrieve the current subscription to get the subscription item ID
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    return NextResponse.json({ error: "Subscription item not found" }, { status: 500 });
  }

  // Update the subscription price. proration_behavior "always_invoice" creates an
  // immediate invoice for the prorated difference so the user is charged/credited right away.
  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "always_invoice",
  });

  // Optimistic DB update — the webhook will also update this, but we update immediately
  // so the UI reflects the change before the next webhook fires.
  await db.user.update({
    where: { id: session.user.id },
    data: { plan },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Add change-plan UI to BillingSection**

In `components/settings/BillingSection.tsx`, update the `Props` interface to add:

```typescript
  currentPlan: string;
  currentPeriod: "monthly" | "annual";
```

Add a `CHANGE_PLANS` constant inside the file (not exported):

```typescript
const CHANGE_PLANS = [
  { key: "home_basic",        label: "Home Basic",        monthly: 7.99,  annual: 79  },
  { key: "home_plus",         label: "Home Plus",         monthly: 14.99, annual: 139 },
  { key: "professional",      label: "Professional",      monthly: 24.99, annual: 229 },
  { key: "professional_plus", label: "Professional Plus", monthly: 49.99, annual: 449 },
] as const;
```

Add state for the change plan flow:

```typescript
  const [changePlanKey, setChangePlanKey] = useState<string | null>(null);
  const [changePeriod, setChangePeriod] = useState<"monthly" | "annual">(currentPeriod);
```

Add a `handleChangePlan` function:

```typescript
  async function handleChangePlan() {
    if (!changePlanKey) return;
    setBusy(true);
    await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: changePlanKey, period: changePeriod }),
    });
    setBusy(false);
    setChangePlanKey(null);
    window.location.reload();
  }
```

In the JSX, inside the `{hasStripeSubscription && !isTrial && (` block, add a "Change plan" section above the Pause and Cancel section:

```tsx
          {/* Change plan */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Change plan</p>

            {changePlanKey ? (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-3">
                <p className="text-sm font-medium text-gray-800">
                  Switch to {CHANGE_PLANS.find((p) => p.key === changePlanKey)?.label}?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChangePeriod("monthly")}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      changePeriod === "monthly"
                        ? "border-green-600 bg-green-50 text-green-700 font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setChangePeriod("annual")}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      changePeriod === "annual"
                        ? "border-green-600 bg-green-50 text-green-700 font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Annual (save 2 months)
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Your billing will be adjusted immediately. You will be charged or credited the prorated difference for the remaining time in your billing period.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleChangePlan}
                    disabled={busy || changePlanKey === currentPlan}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {busy ? "Switching…" : "Confirm switch"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setChangePlanKey(null)}>
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {CHANGE_PLANS.map((p) => {
                  const isCurrent = p.key === currentPlan;
                  return (
                    <div
                      key={p.key}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        isCurrent ? "bg-green-50 border border-green-200" : "hover:bg-gray-50"
                      }`}
                    >
                      <div>
                        <span className={`text-sm font-medium ${isCurrent ? "text-green-800" : "text-gray-700"}`}>
                          {p.label}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">${p.monthly} per month</span>
                      </div>
                      {isCurrent ? (
                        <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      ) : (
                        <button
                          onClick={() => setChangePlanKey(p.key)}
                          className="text-xs font-medium text-green-700 hover:text-green-900 underline"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
```

- [ ] **Step 4: Wire the new props into settings page**

In `app/(dashboard)/settings/page.tsx`, compute the current period from subscription data. Add after the existing `canPauseSubscription` computation:

```typescript
  // Determine billing period from the price metadata. If no subscription yet, default to monthly.
  // The subscription period is inferred from the price ID by checking STRIPE_PRICES.
  const { STRIPE_PRICES } = await import("@/lib/stripe");
  let currentPeriod: "monthly" | "annual" = "monthly";
  if (user.stripeSubscriptionId) {
    // Fetch the active price ID from Stripe to determine the billing period
    const { stripe } = await import("@/lib/stripe");
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const activePriceId = sub.items.data[0]?.price.id ?? "";
    for (const periods of Object.values(STRIPE_PRICES)) {
      if (periods.annual === activePriceId) { currentPeriod = "annual"; break; }
    }
  }
```

Pass the new props to `BillingSection`:

```tsx
          <BillingSection
            plan={user.plan}
            planStatus={user.planStatus}
            planLabel={PLAN_LABELS[user.plan] ?? user.plan}
            daysUntilDeletion={daysUntilDeletion}
            currentPeriodEnd={user.currentPeriodEnd?.toISOString() ?? null}
            pausedUntil={user.pausedUntil?.toISOString() ?? null}
            hasStripeSubscription={!!user.stripeSubscriptionId}
            trialDaysLeft={trialDaysLeft}
            canPauseSubscription={canPauseSubscription}
            currentPlan={user.plan}
            currentPeriod={currentPeriod}
          />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/stripe/change-plan/route.ts components/settings/BillingSection.tsx app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add plan upgrade and downgrade from settings with prorated billing"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Trials cannot pause | Task 2 (`canPause` returns false for trial), Task 11 (API enforces it), Task 10 (UI hides button) |
| Plan names: Home Basic, Home Plus, Professional, Professional Plus | Tasks 2, 6, 9, 10 |
| No abbreviations | All tasks — full phrases used throughout |
| Security top concern | Security section in header; Tasks 7, 8, 11, 12 each have security requirements |
| Cancel easy, in settings | Task 12 (cancel API), Task 10 (cancel button in BillingSection) |
| Pause easy, in settings | Task 11 (pause API), Task 10 (pause button in BillingSection) |
| Standard account = 1 yard | Task 2 (`home_basic` maxYards = 1) |
| Multiple tiers including professional | Pricing model table, Tasks 2, 6, 9 |
| Setup payments with Stripe | Tasks 6, 7, 8 |
| Analyze rate limiting | Task 4 |
| Analysis limit messaging with upgrade link | Task 4 (API error + analyze page UI + section detail page banner) |
| Trial: first task visible, rest blurred | Task 3 |
| Non-paying customer 30-day data retention | Task 13 (deletion cron) |
| Seasonal billing pause | Task 11 (pause API), Task 10 (BillingSection) |
| Upgrade and downgrade from settings | Task 14 (change-plan API + BillingSection UI) |
| Prorated billing on plan change | Task 14 (Stripe `proration_behavior: "always_invoice"`) |

**Placeholder scan:** None found — all steps contain concrete code.

**Type consistency:** `SubscriptionUser` type defined in `lib/subscription.ts` and used consistently in all callers. `StripePlan` type from `lib/stripe.ts` matches the plan keys in `lib/subscription.ts`. `canPause` exported from `lib/subscription.ts` and imported in both the API (Task 11) and settings page (Task 10).
