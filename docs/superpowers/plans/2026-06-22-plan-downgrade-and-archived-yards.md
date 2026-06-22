# Plan Downgrade and Archived Yards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plan downgrades safe and reversible: soft-archive yards over the new plan's limit, require a typed-confirmation picker modal, auto-restore on upgrade, allow permanent delete with another typed confirmation, and block any user who has ever paid from re-entering the trial.

**Architecture:** Four concerns: (1) `Yard.archivedAt` schema for soft-archive; (2) helpers that gate plan eligibility on `stripeCustomerId` and compute active-yard counts; (3) `change-plan` and new `/api/yards/archived/{delete,restore-from-archive}` endpoints; (4) UI changes on `/pricing` and `BillingSection.tsx` for the downgrade picker + delete modals + URL-driven auto-open.

**Tech Stack:** Next.js 16 App Router, Prisma 5 + PostgreSQL (Supabase), Stripe SDK, Vitest, Tailwind CSS, React.

**Design spec:** `docs/superpowers/specs/2026-06-22-plan-downgrade-and-archived-yards-design.md`

---

## File Structure

**Created:**
- `prisma/migrations/<timestamp>_archive_yards/migration.sql`
- `app/api/yards/archived/delete/route.ts`
- `app/api/yards/archived/restore/route.ts`
- `components/settings/DowngradeModal.tsx`
- `components/settings/DeleteArchivedModal.tsx`
- `lib/__tests__/plan-eligibility.test.ts`
- `app/api/stripe/change-plan/__tests__/route.test.ts`
- `app/api/yards/archived/delete/__tests__/route.test.ts`

**Modified:**
- `prisma/schema.prisma`
- `lib/subscription.ts`
- `app/api/stripe/change-plan/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/yard/page.tsx`
- `app/(dashboard)/analyze/page.tsx`
- `app/api/yard/route.ts`
- `app/api/cron/daily-tasks/route.ts`
- `app/pricing/page.tsx`
- `components/settings/BillingSection.tsx`
- `app/(dashboard)/settings/page.tsx`

---

## Task 1: DB migration for Yard.archivedAt

**Files:**
- Create: `prisma/migrations/20260622140000_archive_yards/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `archivedAt` field and index to `Yard` model**

In `prisma/schema.prisma`, locate the `Yard` model. Add `archivedAt DateTime?` after `mowingTime`. Add `@@index([userId, archivedAt])` near the existing model-level annotations (alongside any existing `@@index`).

Final shape of the additions (in order, after `mowingTime String?`):

```prisma
  archivedAt DateTime?
```

And alongside the existing model-level annotations:

```prisma
  @@index([userId, archivedAt])
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260622140000_archive_yards/migration.sql`:

```sql
ALTER TABLE "Yard" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Yard_userId_archivedAt_idx" ON "Yard"("userId", "archivedAt");
```

The `Yard` table already has RLS enabled via the codebase-wide 2026-06-16 lockdown; adding a column needs no further RLS work.

- [ ] **Step 3: Regenerate the Prisma client**

Local has no `DIRECT_URL`. Use the workaround:

```bash
DIRECT_URL=postgresql://x:y@localhost:5432/x npx prisma generate
```

Do NOT run `npx prisma migrate dev`. The SQL file is what runs in production.

- [ ] **Step 4: Verify the generated client**

Run:
```bash
grep -A2 "archivedAt" node_modules/.prisma/client/index.d.ts | head -10
```
Expected: shows `archivedAt: Date | null` on the `Yard` type.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add archivedAt to Yard for soft-archive on plan downgrade"
```

---

## Task 2: Plan eligibility and active-yard count helpers

**Files:**
- Modify: `lib/subscription.ts`
- Create: `lib/__tests__/plan-eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/plan-eligibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasEverPaid, eligiblePlansForUser } from "@/lib/subscription";

describe("hasEverPaid", () => {
  it("returns false when stripeCustomerId is null", () => {
    expect(hasEverPaid({ stripeCustomerId: null })).toBe(false);
  });

  it("returns false when stripeCustomerId is undefined", () => {
    expect(hasEverPaid({})).toBe(false);
  });

  it("returns true when stripeCustomerId is set", () => {
    expect(hasEverPaid({ stripeCustomerId: "cus_123" })).toBe(true);
  });
});

describe("eligiblePlansForUser", () => {
  it("includes trial for never-paid users", () => {
    expect(eligiblePlansForUser({ stripeCustomerId: null })).toContain("trial");
  });

  it("excludes trial for ever-paid users", () => {
    expect(eligiblePlansForUser({ stripeCustomerId: "cus_123" })).not.toContain("trial");
  });

  it("always includes the three paid plans", () => {
    const paid = eligiblePlansForUser({ stripeCustomerId: "cus_123" });
    expect(paid).toEqual(expect.arrayContaining(["home_basic", "home_plus", "professional"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run lib/__tests__/plan-eligibility.test.ts 2>&1 | tail -10
```
Expected: FAIL — cannot import `hasEverPaid` or `eligiblePlansForUser`.

- [ ] **Step 3: Add the helpers to `lib/subscription.ts`**

Append to `lib/subscription.ts` (after `computeEngagementStatus` and friends):

```ts
export function hasEverPaid(user: { stripeCustomerId?: string | null }): boolean {
  return user.stripeCustomerId != null;
}

export function eligiblePlansForUser(user: { stripeCustomerId?: string | null }): Plan[] {
  const paidPlans: Plan[] = ["home_basic", "home_plus", "professional"];
  return hasEverPaid(user) ? paidPlans : ["trial", ...paidPlans];
}

export async function getActiveYardCount(userId: string): Promise<number> {
  return db.yard.count({ where: { userId, archivedAt: null } });
}
```

`db` is already imported in this file from earlier work. If not, add `import { db } from "@/lib/db";`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run lib/__tests__/plan-eligibility.test.ts 2>&1 | tail -10
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts lib/__tests__/plan-eligibility.test.ts
git commit -m "Add hasEverPaid, eligiblePlansForUser, and getActiveYardCount helpers"
```

---

## Task 3: Audit existing yard queries to filter archived yards

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/yard/page.tsx`
- Modify: `app/(dashboard)/analyze/page.tsx`
- Modify: `app/api/yard/route.ts`
- Modify: `app/api/cron/daily-tasks/route.ts`

These files currently query yards by `userId` without filtering archived ones. Add `archivedAt: null` to each.

- [ ] **Step 1: `app/(dashboard)/dashboard/page.tsx` — add filter**

In the existing `db.yard.findMany({ where: { userId: session.user.id }, ... })` call, change the where clause to:

```ts
where: { userId: session.user.id, archivedAt: null },
```

- [ ] **Step 2: `app/(dashboard)/yard/page.tsx` — add filter**

Same change to the existing `db.yard.findMany`.

- [ ] **Step 3: `app/(dashboard)/analyze/page.tsx` — add filter**

Same change to the existing `db.yard.findMany`.

- [ ] **Step 4: `app/api/yard/route.ts` — active count for canCreateYard**

Find the existing yard-count query used by `canCreateYard`. Replace it with the new active-count helper. Add the import at the top:

```ts
import { canCreateYard, getActiveYardCount } from "@/lib/subscription";
```

Replace the existing count line (likely `const count = await db.yard.count({ where: { userId: session.user.id } });`) with:

```ts
const count = await getActiveYardCount(session.user.id);
```

- [ ] **Step 5: `app/api/cron/daily-tasks/route.ts` — skip archived yards in reminders**

The existing `reminderUsers` query has a `yards: { some: { ... schedule fields ... } }` clause. Add `archivedAt: null` to each `some` filter so archived yards do not trigger the user being included. Also add it inside the `where: { ... }` of the nested `yards: { where: { ... } }` that limits the included yards.

Edit the `where.AND[1]` block (the yards filter) so its inner `OR` entries each get `archivedAt: null`:

```ts
yards: {
  some: {
    archivedAt: null,
    OR: [
      { wateringDays: { isEmpty: false } },
      { mowingDays: { isEmpty: false } },
      { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
    ],
  },
},
```

And in the user's `yards: { where: { ... } }` (the inner include filter that picks which yards to attach to the result), add `archivedAt: null`:

```ts
yards: {
  where: {
    archivedAt: null,
    OR: [
      { wateringDays: { isEmpty: false } },
      { mowingDays: { isEmpty: false } },
      { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
    ],
  },
  select: { /* unchanged */ },
},
```

- [ ] **Step 6: Type check + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -iE "dashboard/page|yard/page|analyze/page|yard/route|daily-tasks" || echo "no type errors"
npx vitest run app/api/cron lib/__tests__/reminder-scheduler.test.ts 2>&1 | tail -10
```
Expected: "no type errors", existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx app/\(dashboard\)/yard/page.tsx app/\(dashboard\)/analyze/page.tsx app/api/yard/route.ts app/api/cron/daily-tasks/route.ts
git commit -m "Filter archived yards from dashboard, yard list, analyze, and reminder cron"
```

---

## Task 4: change-plan endpoint validates downgrade and rejects trial

**Files:**
- Modify: `app/api/stripe/change-plan/route.ts`
- Create: `app/api/stripe/change-plan/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/stripe/change-plan/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripe: {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ items: { data: [{ id: "si_1" }] } }),
        update: vi.fn().mockResolvedValue({ id: "sub_1" }),
      },
    },
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    yard: {
      count: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { POST } from "../route";
import { db } from "@/lib/db";

function jsonRequest(body: unknown) {
  return new Request("http://test.local/api/stripe/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("change-plan route", () => {
  it("rejects plan=trial", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    const res = await POST(jsonRequest({ plan: "trial", period: "monthly" }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects downgrade when active yard count exceeds new limit without archiveYardIds", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "professional",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("archive_required");
    expect(body.requiredCount).toBe(2);
  });

  it("rejects downgrade with wrong archiveYardIds length", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "professional",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    const res = await POST(jsonRequest({
      plan: "home_plus",
      period: "monthly",
      archiveYardIds: ["y1"],
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("archive_count_mismatch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run app/api/stripe/change-plan 2>&1 | tail -20
```
Expected: FAIL — current route does not implement these checks.

- [ ] **Step 3: Update `change-plan` route**

Replace `/Users/cory/Projects/yard-analyzer/app/api/stripe/change-plan/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICES, isValidPlan, isValidPeriod } from "@/lib/stripe";
import { getPlanLimits, getActiveYardCount } from "@/lib/subscription";
import { withAxiom, logger } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { plan, period, archiveYardIds } = body as {
    plan?: string;
    period?: string;
    archiveYardIds?: string[];
  };

  if (plan === "trial") {
    return NextResponse.json({ error: "Cannot switch to trial" }, { status: 400 });
  }

  if (!isValidPlan(plan) || !isValidPeriod(period)) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[plan][period];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured" }, { status: 500 });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeSubscriptionId: true, plan: true, planStatus: true, stripeCustomerId: true },
  });

  if (!user.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  if (user.planStatus === "canceled") {
    return NextResponse.json({ error: "Subscription is canceled" }, { status: 400 });
  }

  // Downgrade gating
  const newLimits = getPlanLimits({
    plan,
    planStatus: user.planStatus,
    trialEndsAt: null,
  });
  const activeCount = await getActiveYardCount(session.user.id);
  const overLimit = activeCount > newLimits.maxYards && newLimits.maxYards > 0;
  const requiredCount = Math.max(0, activeCount - newLimits.maxYards);

  if (overLimit && (!archiveYardIds || archiveYardIds.length === 0)) {
    return NextResponse.json(
      { error: "Need to archive yards first", code: "archive_required", requiredCount },
      { status: 400 },
    );
  }

  if (overLimit && archiveYardIds && archiveYardIds.length !== requiredCount) {
    return NextResponse.json(
      { error: "Wrong number of yards to archive", code: "archive_count_mismatch", requiredCount },
      { status: 400 },
    );
  }

  if (overLimit && archiveYardIds) {
    const ownedActive = await db.yard.findMany({
      where: { id: { in: archiveYardIds }, userId: session.user.id, archivedAt: null },
      select: { id: true },
    });
    if (ownedActive.length !== archiveYardIds.length) {
      return NextResponse.json(
        { error: "One or more yards are invalid or already archived", code: "archive_invalid_ids" },
        { status: 400 },
      );
    }
  }

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    return NextResponse.json({ error: "Subscription item not found" }, { status: 500 });
  }

  try {
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    logger.error("change-plan: stripe update failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Couldn't process the plan change. Check your payment method and try again." }, { status: 402 });
  }

  await db.$transaction([
    ...(overLimit && archiveYardIds
      ? [
          db.yard.updateMany({
            where: { id: { in: archiveYardIds }, userId: session.user.id },
            data: { archivedAt: new Date() },
          }),
        ]
      : []),
    db.user.update({ where: { id: session.user.id }, data: { plan } }),
  ]);

  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run app/api/stripe/change-plan 2>&1 | tail -20
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/change-plan/
git commit -m "Validate downgrade yard count and reject trial in change-plan"
```

---

## Task 5: Delete-archived endpoint

**Files:**
- Create: `app/api/yards/archived/delete/route.ts`
- Create: `app/api/yards/archived/delete/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/yards/archived/delete/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    lawnAnalysis: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    yard: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: () => ({ remove: vi.fn().mockResolvedValue({ data: [], error: null }) }) },
  }),
}));

import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://test.local/api/yards/archived/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("yards/archived/delete route", () => {
  it("rejects wrong confirmation text", async () => {
    const res = await POST(jsonRequest({ confirmation: "delete" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("confirmation_required");
  });

  it("returns deleted count when confirmation is correct", async () => {
    const res = await POST(jsonRequest({ confirmation: "DELETE" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run app/api/yards/archived/delete 2>&1 | tail -10
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the route**

Create `app/api/yards/archived/delete/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (body?.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm", code: "confirmation_required" },
      { status: 400 },
    );
  }

  const analyses = await db.lawnAnalysis.findMany({
    where: { yardSection: { yard: { userId: session.user.id, archivedAt: { not: null } } } },
    select: { imageUrls: true },
  });
  const allUrls = analyses.flatMap((a) => a.imageUrls);

  if (allUrls.length > 0) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const paths = allUrls
      .map((url) => {
        const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
        return match ? match[1] : null;
      })
      .filter((p): p is string => p !== null);
    if (paths.length > 0) {
      const { error } = await supabase.storage.from("lawn-photos").remove(paths);
      if (error) {
        logger.warn("yards/archived/delete: supabase remove failed", {
          userId: session.user.id,
          err: error.message,
        });
      }
    }
  }

  const result = await db.yard.deleteMany({
    where: { userId: session.user.id, archivedAt: { not: null } },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run app/api/yards/archived/delete 2>&1 | tail -10
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/yards/archived/
git commit -m "Add yards/archived/delete endpoint with typed confirmation"
```

---

## Task 6: Restore-from-archive endpoint (fallback for failed auto-restore)

**Files:**
- Create: `app/api/yards/archived/restore/route.ts`

This route is a fallback the UI can call if the webhook-driven auto-restore fails. It applies the same most-recent-first logic.

- [ ] **Step 1: Create the route**

Create `app/api/yards/archived/restore/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlanLimits, getActiveYardCount } from "@/lib/subscription";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async (_req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true },
  });

  const limits = getPlanLimits(user);
  if (limits.maxYards <= 0) {
    return NextResponse.json({ ok: true, restored: 0 });
  }

  const activeCount = await getActiveYardCount(session.user.id);
  const restoreCount = Math.max(0, limits.maxYards === -1 ? Number.MAX_SAFE_INTEGER : limits.maxYards - activeCount);
  if (restoreCount === 0) {
    return NextResponse.json({ ok: true, restored: 0 });
  }

  const archived = await db.yard.findMany({
    where: { userId: session.user.id, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    take: restoreCount === Number.MAX_SAFE_INTEGER ? undefined : restoreCount,
    select: { id: true },
  });
  if (archived.length === 0) {
    return NextResponse.json({ ok: true, restored: 0 });
  }

  const result = await db.yard.updateMany({
    where: { id: { in: archived.map((y) => y.id) } },
    data: { archivedAt: null },
  });

  return NextResponse.json({ ok: true, restored: result.count });
});
```

- [ ] **Step 2: Type check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "yards/archived/restore" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 3: Commit**

```bash
git add app/api/yards/archived/restore/route.ts
git commit -m "Add yards/archived/restore endpoint as upgrade fallback"
```

---

## Task 7: Stripe webhook auto-restores on plan upgrade

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Extend `updateUserFromSubscription` to auto-restore on upgrade**

In `app/api/stripe/webhook/route.ts`, update the imports:

```ts
import { getPlanLimits } from "@/lib/subscription";
```

Inside `updateUserFromSubscription`, just before the function returns (after the `db.user.update`), add the auto-restore block:

```ts
  // Auto-restore most recently archived yards if the new plan increases the limit.
  const newLimits = getPlanLimits({ plan, planStatus, trialEndsAt: null });
  if (newLimits.maxYards !== -1 && newLimits.maxYards > 0) {
    const activeCount = await db.yard.count({
      where: { userId: user.id, archivedAt: null },
    });
    const restoreCount = newLimits.maxYards - activeCount;
    if (restoreCount > 0) {
      const archived = await db.yard.findMany({
        where: { userId: user.id, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: restoreCount,
        select: { id: true },
      });
      if (archived.length > 0) {
        await db.yard.updateMany({
          where: { id: { in: archived.map((y) => y.id) } },
          data: { archivedAt: null },
        });
      }
    }
  }
```

- [ ] **Step 2: Type check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "stripe/webhook" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "Auto-restore most recently archived yards on subscription upgrade"
```

---

## Task 8: Pricing page hides trial for paying users and offers downgrades

**Files:**
- Modify: `app/pricing/page.tsx`

- [ ] **Step 1: Add `hasEverPaid` gating and downgrade detection**

At the top of the file, expand the user fetch:

```ts
const user = session?.user?.id ? await db.user.findUnique({
  where: { id: session.user.id },
  select: { plan: true, planStatus: true, stripeCustomerId: true },
}) : null;
const currentPlan = user?.plan ?? null;
const planStatus = user?.planStatus ?? null;
const hasEverPaid = !!user?.stripeCustomerId;
```

(Some of these are already computed; do not duplicate. Replace the existing per-piece queries with a single `findUnique` that selects the three fields.)

- [ ] **Step 2: Hide the Free Trial card for ever-paid users**

Change the Free Trial card wrapper. It currently renders inside `{!isActivePaid && ( ... )}`. Replace that with `{!isActivePaid && !hasEverPaid && ( ... )}`.

- [ ] **Step 3: Replace `Subscribe monthly`/`Switch to monthly` with tier-aware CTA**

Inside the `PLANS.map((plan) => ...)` block, compute tier ordering. Add this helper above the return:

```tsx
const TIER_RANK: Record<string, number> = { trial: 0, home_basic: 1, home_plus: 2, professional: 3 };
const currentRank = currentPlan ? TIER_RANK[currentPlan] ?? -1 : -1;
```

Inside the per-card render block, replace the existing "Subscribe monthly" / "Switch to monthly" button branch with this tier-direction logic (keep the "Current plan" branch unchanged):

```tsx
{currentPlan === plan.key ? (
  <div className="w-full text-center text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg py-2">
    Current plan
  </div>
) : isActivePaid && TIER_RANK[plan.key] < currentRank ? (
  <Link href={`/settings/billing?action=downgrade&to=${plan.key}`}>
    <Button className="w-full" variant="outline">
      Downgrade to {plan.name}
    </Button>
  </Link>
) : isActivePaid ? (
  <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
    <Button className="w-full" variant="outline">
      Switch to monthly
    </Button>
  </Link>
) : isLoggedIn ? (
  <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
    <Button
      className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
      variant={plan.highlight ? "default" : "outline"}
    >
      Subscribe monthly
    </Button>
  </Link>
) : (
  <Link href={`/register`}>
    <Button
      className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
      variant={plan.highlight ? "default" : "outline"}
    >
      Subscribe monthly
    </Button>
  </Link>
)}
```

Then update the annual button just below (which currently renders for non-current plans) to also be downgrade-aware. Wrap the existing `{currentPlan !== plan.key && ( <Link ...annual...> )}` block. When the card is a lower tier for an active paid user, the annual link should also route to `/settings/billing?action=downgrade&to=${plan.key}` (same destination; we ignore annual for downgrade since the modal handles plan + period together at switch time).

Replace the existing annual block with:

```tsx
{currentPlan !== plan.key && (
  isActivePaid && TIER_RANK[plan.key] < currentRank ? null : (
    <Link href={isLoggedIn
      ? `/api/stripe/checkout?plan=${plan.key}&period=annual`
      : `/register`
    }>
      <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500">
        {isActivePaid ? "Switch to annual and save" : "or pay annually and save"}
      </Button>
    </Link>
  )
)}
```

(For downgrades, we suppress the annual option here since the downgrade modal will handle period together with the tier change.)

- [ ] **Step 4: Type check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "pricing/page" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 5: Commit**

```bash
git add app/pricing/page.tsx
git commit -m "Hide trial card for paying users and route downgrades to settings"
```

---

## Task 9: DowngradeModal component

**Files:**
- Create: `components/settings/DowngradeModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `components/settings/DowngradeModal.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Yard {
  id: string;
  name: string;
}

interface Props {
  targetPlan: string;
  targetPlanLabel: string;
  newMaxYards: number;
  yards: Yard[];
  currentPeriod: "monthly" | "annual";
  onClose: () => void;
  onSuccess: () => void;
}

export function DowngradeModal({
  targetPlan,
  targetPlanLabel,
  newMaxYards,
  yards,
  currentPeriod,
  onClose,
  onSuccess,
}: Props) {
  const [selectedKeep, setSelectedKeep] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archiveCount = yards.length - newMaxYards;
  const isValid = selectedKeep.size === newMaxYards && confirmation === "DOWNGRADE";

  function toggle(yardId: string) {
    setSelectedKeep((prev) => {
      const next = new Set(prev);
      if (next.has(yardId)) next.delete(yardId);
      else if (next.size < newMaxYards) next.add(yardId);
      return next;
    });
  }

  async function submit() {
    if (!isValid) return;
    setBusy(true);
    setError(null);
    const archiveYardIds = yards.filter((y) => !selectedKeep.has(y.id)).map((y) => y.id);
    const res = await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: targetPlan, period: currentPeriod, archiveYardIds }),
    });
    if (res.ok) {
      onSuccess();
      return;
    }
    setBusy(false);
    if (res.status === 402) {
      setError("Couldn't process the plan change. Check your payment method and try again.");
    } else {
      setError("Something went wrong. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Downgrading to {targetPlanLabel}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          You&apos;ll have {newMaxYards} yard{newMaxYards === 1 ? "" : "s"}. The {archiveCount} yard{archiveCount === 1 ? "" : "s"} you don&apos;t pick will be archived.
        </p>

        <p className="text-sm font-medium text-gray-900 mb-2">
          Pick {newMaxYards} yard{newMaxYards === 1 ? "" : "s"} to keep ({selectedKeep.size} of {newMaxYards} selected)
        </p>
        <ul className="space-y-2 mb-4">
          {yards.map((y) => {
            const checked = selectedKeep.has(y.id);
            const disabled = !checked && selectedKeep.size >= newMaxYards;
            return (
              <li key={y.id}>
                <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${checked ? "border-green-500 bg-green-50" : disabled ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-200"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || busy}
                    onChange={() => toggle(y.id)}
                  />
                  <span className="text-sm text-gray-900">{y.name}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          Archived yards stop sending reminders and don&apos;t count toward your plan. Your data is kept and restored if you upgrade. Your card will be credited for unused time on your current plan.
        </div>

        <label className="block text-sm font-medium text-gray-900 mb-1">
          Type DOWNGRADE to confirm
        </label>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
          placeholder="DOWNGRADE"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
        />

        {error && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isValid || busy} className="bg-red-600 hover:bg-red-700 text-white">
            {busy ? "Processing..." : "Downgrade"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "DowngradeModal" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 3: Commit**

```bash
git add components/settings/DowngradeModal.tsx
git commit -m "Add DowngradeModal with yard picker and typed DOWNGRADE confirmation"
```

---

## Task 10: DeleteArchivedModal component

**Files:**
- Create: `components/settings/DeleteArchivedModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `components/settings/DeleteArchivedModal.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  archivedCount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteArchivedModal({ archivedCount, onClose, onSuccess }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = confirmation === "DELETE";

  async function submit() {
    if (!isValid) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/yards/archived/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    if (res.ok) {
      onSuccess();
      return;
    }
    setBusy(false);
    setError("Something went wrong. Try again.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Delete archived yards
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          This permanently deletes all {archivedCount} archived yard{archivedCount === 1 ? "" : "s"}, their analyses, tasks, and photos. This cannot be undone.
        </p>

        <label className="block text-sm font-medium text-gray-900 mb-1">
          Type DELETE to confirm
        </label>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
          placeholder="DELETE"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
        />

        {error && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isValid || busy} className="bg-red-600 hover:bg-red-700 text-white">
            {busy ? "Deleting..." : "Delete permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "DeleteArchivedModal" || echo "no type errors"
```
Expected: "no type errors".

- [ ] **Step 3: Commit**

```bash
git add components/settings/DeleteArchivedModal.tsx
git commit -m "Add DeleteArchivedModal with typed DELETE confirmation"
```

---

## Task 11: BillingSection integration — modal wiring, archived row, URL action

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `components/settings/BillingSection.tsx`

- [ ] **Step 1: Server page — fetch yards and archived count**

In `app/(dashboard)/settings/page.tsx`, extend the existing user fetch to also load the user's active yards and archived count. Add inside the existing data-fetch block:

```ts
const yards = await db.yard.findMany({
  where: { userId: session.user.id, archivedAt: null },
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true },
});

const archivedCount = await db.yard.count({
  where: { userId: session.user.id, archivedAt: { not: null } },
});
```

Pass both as props to `<BillingSection ... yards={yards} archivedCount={archivedCount} />`.

- [ ] **Step 2: BillingSection props and state**

In `components/settings/BillingSection.tsx`, expand the `Props` interface to add:

```ts
yards: { id: string; name: string }[];
archivedCount: number;
```

Add to the component body (alongside existing `useState` declarations):

```tsx
const [downgradeTarget, setDowngradeTarget] = useState<string | null>(null);
const [showDeleteArchived, setShowDeleteArchived] = useState(false);
```

Add imports at the top:

```tsx
import { DowngradeModal } from "@/components/settings/DowngradeModal";
import { DeleteArchivedModal } from "@/components/settings/DeleteArchivedModal";
import { getPlanLimits, PLAN_LABELS } from "@/lib/subscription";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
```

- [ ] **Step 3: BillingSection — read `?action=downgrade&to=<plan>` and open modal**

Inside the component body, after the `useState` declarations, add:

```tsx
const searchParams = useSearchParams();
useEffect(() => {
  const action = searchParams.get("action");
  const target = searchParams.get("to");
  if (action === "downgrade" && target) {
    setDowngradeTarget(target);
  }
}, [searchParams]);
```

- [ ] **Step 4: BillingSection — replace `handleChangePlan` direction handling**

Modify the existing `handleChangePlan` so that for a downgrade (target plan's `maxYards` < current plan's `maxYards`), it opens the modal instead of immediately calling change-plan. Replace `handleChangePlan` with:

```tsx
async function handleChangePlan() {
  if (!changePlanKey) return;
  const targetLimits = getPlanLimits({ plan: changePlanKey, planStatus, trialEndsAt: null });
  const currentLimits = getPlanLimits({ plan, planStatus, trialEndsAt: null });
  if (
    targetLimits.maxYards > 0 &&
    currentLimits.maxYards > 0 &&
    targetLimits.maxYards < currentLimits.maxYards
  ) {
    setDowngradeTarget(changePlanKey);
    setChangePlanKey(null);
    return;
  }

  setBusy(true);
  setActionError(null);
  const res = await fetch("/api/stripe/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: changePlanKey, period: changePeriod }),
  });
  setBusy(false);
  if (!res.ok) {
    setActionError("Failed to change plan. Please try again.");
    return;
  }
  setChangePlanKey(null);
  window.location.reload();
}
```

- [ ] **Step 5: BillingSection — render the archived-yards row**

Find the closing tag of the "Current plan" block. After it (and before the "Payment method" block), add:

```tsx
{archivedCount > 0 && (
  <div className="border-t border-gray-100 pt-4">
    <p className="text-sm text-gray-700">
      <span className="font-semibold">{archivedCount} yard{archivedCount === 1 ? "" : "s"} archived</span> from a previous plan.{" "}
      <span className="text-gray-500">Upgrade to restore, or </span>
      <button
        type="button"
        className="text-red-700 underline hover:text-red-800"
        onClick={() => setShowDeleteArchived(true)}
      >
        delete permanently
      </button>
      .
    </p>
  </div>
)}
```

- [ ] **Step 6: BillingSection — render the modals**

At the end of the component's JSX (just before the closing `</div>` of the wrapper), add:

```tsx
{downgradeTarget && (
  <DowngradeModal
    targetPlan={downgradeTarget}
    targetPlanLabel={PLAN_LABELS[downgradeTarget] ?? downgradeTarget}
    newMaxYards={getPlanLimits({ plan: downgradeTarget, planStatus, trialEndsAt: null }).maxYards}
    yards={yards}
    currentPeriod={changePeriod}
    onClose={() => setDowngradeTarget(null)}
    onSuccess={() => {
      setDowngradeTarget(null);
      window.location.reload();
    }}
  />
)}
{showDeleteArchived && (
  <DeleteArchivedModal
    archivedCount={archivedCount}
    onClose={() => setShowDeleteArchived(false)}
    onSuccess={() => {
      setShowDeleteArchived(false);
      window.location.reload();
    }}
  />
)}
```

- [ ] **Step 7: Type check and tests**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -iE "BillingSection|settings/page" || echo "no type errors"
npx vitest run 2>&1 | tail -10
```
Expected: "no type errors", all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add app/\(dashboard\)/settings/page.tsx components/settings/BillingSection.tsx
git commit -m "Wire downgrade and delete-archived modals into BillingSection"
```

---

## Task 12: End-to-end smoke and final sweep

**Files:** none directly — verification only

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npx vitest run 2>&1 | tail -30
```
Expected: all tests pass.

- [ ] **Step 2: Run the type checker**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -30
```
Expected: no new type errors.

- [ ] **Step 3: Manual UX sanity (dev server)**

Run:
```bash
npm run dev
```

In the browser, as a logged-in user with multiple yards:

1. Visit `/pricing` while on Pro with 5 yards. The Free Trial card should not appear. Lower-tier cards should show "Downgrade to Home Plus" / "Downgrade to Home Basic".
2. Click a downgrade CTA. You should be routed to `/settings/billing?action=downgrade&to=home_plus` and the downgrade modal should open automatically.
3. The modal should require picking exactly 3 yards and typing "DOWNGRADE" to enable submit. Submit succeeds; page reloads; you're on Home Plus and `archivedCount = 2` shows on the billing section.
4. Visit `/pricing` again. Upgrade back to Pro. After the webhook fires (or after `change-plan` succeeds in-place), the 2 archived yards should auto-restore — `archivedCount = 0`.
5. Downgrade to Basic, then click "delete permanently" on the archived row. Modal should require typing "DELETE" to submit. After submit, archived row disappears.
6. From a canceled / expired test account, visit `/pricing`. Free Trial card should NOT appear (because `stripeCustomerId` is set).

- [ ] **Step 4: Commit any cleanup**

If any sanity step surfaces a typo or missing prop, commit it. If not, skip the commit.

---

## Self-Review

**Spec coverage:**
- ✅ `Yard.archivedAt` schema + index → Task 1
- ✅ `hasEverPaid`, `eligiblePlansForUser`, `getActiveYardCount` helpers → Task 2
- ✅ Audit of yard queries (dashboard, yard list, analyze, yard API, daily-tasks cron) → Task 3
- ✅ `change-plan` rejects trial, validates downgrade picker, transactional update → Task 4
- ✅ `yards/archived/delete` with typed DELETE confirmation → Task 5
- ✅ `yards/archived/restore` fallback → Task 6
- ✅ Stripe webhook auto-restore most recent archived → Task 7
- ✅ Pricing page hides trial for ever-paid; downgrade CTAs route to settings → Task 8
- ✅ `DowngradeModal` with yard picker + DOWNGRADE typed confirmation → Task 9
- ✅ `DeleteArchivedModal` with DELETE typed confirmation → Task 10
- ✅ BillingSection integration (modal wiring, archived row, URL action handling) → Task 11
- ✅ End-to-end smoke → Task 12

**Placeholder scan:** no "TBD" / "TODO" / "implement later". All code blocks are complete.

**Type consistency:**
- `hasEverPaid`, `eligiblePlansForUser`, `getActiveYardCount` named consistently across tasks 2, 4, 6, 7.
- `archiveYardIds` body field referenced in tasks 4 (route) and 9 (modal).
- `archivedAt` column name matches between tasks 1, 3, 4, 5, 6, 7, 11.
- Modal prop names (`targetPlan`, `targetPlanLabel`, `newMaxYards`, `yards`, `currentPeriod`, `onClose`, `onSuccess`) defined in task 9 and called in task 11.
- `DeleteArchivedModal` props (`archivedCount`, `onClose`, `onSuccess`) defined in task 10 and called in task 11.
- API error codes (`archive_required`, `archive_count_mismatch`, `archive_invalid_ids`, `confirmation_required`) match between tasks 4 / 5 and the modal error-handling expectations.
