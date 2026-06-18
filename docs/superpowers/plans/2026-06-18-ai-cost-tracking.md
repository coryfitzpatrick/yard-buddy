# AI Cost Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record one `AiUsageEvent` row per Claude API call, attributed to the user who triggered it, then email a monthly per-user margin report on the 1st of each month.

**Architecture:** A `callClaude(params, ctx)` wrapper in `lib/ai/usage.ts` replaces every `client.messages.create(...)` call site. The wrapper does the API call, then fire-and-forget writes one row with token counts, computed USD cost, and `feature` tag. A monthly Vercel cron route reads the previous month's rows, groups by user, joins subscription plan revenue, and sends an HTML email via Resend.

**Tech Stack:** Next.js App Router server actions/routes, Prisma + Postgres, Anthropic SDK, Resend, Vercel Cron, Vitest.

**Spec:** [`docs/superpowers/specs/2026-06-18-ai-cost-tracking-design.md`](../specs/2026-06-18-ai-cost-tracking-design.md)

---

## File Plan

**Create:**
- `lib/ai/prices.ts` — per-model price map + `computeCostUsd()` pure function.
- `lib/ai/usage.ts` — `callClaude()` wrapper + `recordUsage()` fire-and-forget DB writer.
- `lib/ai/__tests__/prices.test.ts`, `lib/ai/__tests__/usage.test.ts`.
- `lib/cost-report.ts` — `buildCostReport()` pure-ish function returning a typed report + plan revenue map.
- `lib/__tests__/cost-report.test.ts`, `lib/__tests__/cost-report-email.test.ts`.
- `app/api/cron/monthly-cost-report/route.ts` — cron route handler.
- `prisma/migrations/<timestamp>_add_ai_usage_event/migration.sql` — generated.

**Modify:**
- `prisma/schema.prisma` — add `AiUsageEvent` model + inverse relation on `User`.
- `lib/email.ts` — add `buildCostReportEmail()`.
- `lib/claude.ts` — swap each `client.messages.create()` for `callClaude()`; add `ctx: AiCallCtx` param to internal functions (`analyzeImages`, `analyzeImagesBase64`, `runCritique`, `runRevise`, recommendations, watering generators).
- `app/api/analyze/route.ts`, `app/api/identify-grass/route.ts`, `app/api/recommendations/route.ts` — thread `session.user.id` into the call.
- `lib/cron/overdue-assessor.ts` — accept `userId` from the per-user loop and pass it through.
- `vercel.json` — add the monthly schedule.

---

## Task 1: Add `AiUsageEvent` Prisma model + run migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_ai_usage_event/migration.sql` (Prisma-generated)

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append to the end of the file (after the last model):

```prisma
model AiUsageEvent {
  id                     String   @id @default(cuid())
  userId                 String?
  feature                String
  model                  String
  inputTokens            Int      @default(0)
  outputTokens           Int      @default(0)
  cacheReadTokens        Int      @default(0)
  cacheCreationTokens    Int      @default(0)
  costUsd                Decimal  @db.Decimal(10, 6)
  success                Boolean  @default(true)
  errorCode              String?
  createdAt              DateTime @default(now())
  user                   User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([createdAt])
}
```

Also add the inverse relation on the existing `User` model. Find the `model User { ... }` block and add this line in the relations section (alongside `yards`, `passwordResets`, etc.):

```prisma
  aiUsageEvents        AiUsageEvent[]
```

- [ ] **Step 2: Generate the migration**

```bash
npx prisma migrate dev --name add_ai_usage_event
```

Expected: a new `prisma/migrations/<timestamp>_add_ai_usage_event/migration.sql` file is created and applied to the local DB. Prisma client regenerates.

- [ ] **Step 3: Verify Prisma client types**

```bash
npx tsc --noEmit
```

Expected: no errors. `db.aiUsageEvent` should be auto-available.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add AiUsageEvent table for per-call cost tracking"
```

---

## Task 2: Price table + `computeCostUsd()` with TDD

**Files:**
- Create: `lib/ai/prices.ts`
- Test: `lib/ai/__tests__/prices.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/ai/__tests__/prices.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { computeCostUsd, AI_PRICES_USD_PER_MTOK } from "@/lib/ai/prices";

afterEach(() => vi.restoreAllMocks());

describe("computeCostUsd", () => {
  it("returns 0 for empty usage", () => {
    expect(computeCostUsd("claude-sonnet-4-6", {})).toBe(0);
  });

  it("prices Sonnet input + output tokens", () => {
    // 1M input @ $3 + 1M output @ $15 = $18
    expect(
      computeCostUsd("claude-sonnet-4-6", { input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    ).toBeCloseTo(18, 6);
  });

  it("prices Sonnet cache reads at the discounted rate", () => {
    // 1M cache reads @ $0.30 = $0.30
    expect(
      computeCostUsd("claude-sonnet-4-6", { cache_read_input_tokens: 1_000_000 }),
    ).toBeCloseTo(0.30, 6);
  });

  it("prices Sonnet cache creation at the premium rate", () => {
    // 1M cache creation @ $3.75 = $3.75
    expect(
      computeCostUsd("claude-sonnet-4-6", { cache_creation_input_tokens: 1_000_000 }),
    ).toBeCloseTo(3.75, 6);
  });

  it("prices Haiku separately", () => {
    // 1M input @ $1 + 1M output @ $5 = $6
    expect(
      computeCostUsd("claude-haiku-4-5-20251001", {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeCloseTo(6, 6);
  });

  it("falls back to Sonnet pricing for unknown models and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cost = computeCostUsd("claude-future-99", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18, 6); // priced as Sonnet
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/unknown model.*claude-future-99/i);
  });

  it("AI_PRICES_USD_PER_MTOK includes both models", () => {
    expect(AI_PRICES_USD_PER_MTOK["claude-sonnet-4-6"]).toBeDefined();
    expect(AI_PRICES_USD_PER_MTOK["claude-haiku-4-5-20251001"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- prices.test
```

Expected: FAIL — module `@/lib/ai/prices` not found.

- [ ] **Step 3: Implement `lib/ai/prices.ts`**

```ts
// USD per 1M tokens. Update when Anthropic changes prices.
export const AI_PRICES_USD_PER_MTOK: Record<string, {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}> = {
  "claude-sonnet-4-6":         { input: 3, output: 15, cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-haiku-4-5-20251001": { input: 1, output:  5, cacheRead: 0.10, cacheCreation: 1.25 },
};

const FALLBACK_MODEL = "claude-sonnet-4-6";

export interface AiUsageInput {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function computeCostUsd(model: string, usage: AiUsageInput): number {
  let prices = AI_PRICES_USD_PER_MTOK[model];
  if (!prices) {
    console.warn(`computeCostUsd: unknown model "${model}" - pricing as ${FALLBACK_MODEL}`);
    prices = AI_PRICES_USD_PER_MTOK[FALLBACK_MODEL];
  }
  return (
    (usage.input_tokens                ?? 0) * prices.input +
    (usage.output_tokens               ?? 0) * prices.output +
    (usage.cache_read_input_tokens     ?? 0) * prices.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * prices.cacheCreation
  ) / 1_000_000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- prices.test
```

Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prices.ts lib/ai/__tests__/prices.test.ts
git commit -m "Add per-model Claude price table and computeCostUsd"
```

---

## Task 3: `callClaude()` wrapper + `recordUsage()` with TDD

**Files:**
- Create: `lib/ai/usage.ts`
- Test: `lib/ai/__tests__/usage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/ai/__tests__/usage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();
const mockUsageCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

vi.mock("@/lib/db", () => ({
  db: { aiUsageEvent: { create: mockUsageCreate } },
}));

const { callClaude } = await import("@/lib/ai/usage");

beforeEach(() => {
  mockCreate.mockReset();
  mockUsageCreate.mockReset();
  mockUsageCreate.mockResolvedValue({ id: "row1" });
});
afterEach(() => vi.restoreAllMocks());

describe("callClaude success path", () => {
  it("returns the Anthropic response unchanged", async () => {
    const response = {
      id: "msg_1",
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    mockCreate.mockResolvedValueOnce(response);
    const result = await callClaude({ model: "claude-sonnet-4-6", max_tokens: 100, messages: [] }, {
      userId: "user_1",
      feature: "analyze",
    });
    expect(result).toBe(response);
  });

  it("writes a row with computed cost and success=true", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_1",
      model: "claude-sonnet-4-6",
      content: [],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    await callClaude({ model: "claude-sonnet-4-6", max_tokens: 100, messages: [] }, {
      userId: "user_1",
      feature: "analyze",
    });
    // recordUsage is fire-and-forget. Flush microtasks.
    await new Promise((r) => setImmediate(r));
    expect(mockUsageCreate).toHaveBeenCalledOnce();
    const data = mockUsageCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: "user_1",
      feature: "analyze",
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      success: true,
    });
    // costUsd = $18, stored as a string or Decimal-ish - just check ~equal
    expect(Number(data.costUsd)).toBeCloseTo(18, 4);
  });

  it("accepts a null userId (e.g., unauthenticated paths)", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_1",
      model: "claude-sonnet-4-6",
      content: [],
      usage: {},
    });
    await callClaude({ model: "claude-sonnet-4-6", max_tokens: 1, messages: [] }, {
      userId: null,
      feature: "analyze",
    });
    await new Promise((r) => setImmediate(r));
    expect(mockUsageCreate.mock.calls[0][0].data.userId).toBeNull();
  });
});

describe("callClaude error path", () => {
  it("writes success=false and re-throws", async () => {
    const err = Object.assign(new Error("boom"), { status: 500 });
    mockCreate.mockRejectedValueOnce(err);
    await expect(
      callClaude({ model: "claude-sonnet-4-6", max_tokens: 1, messages: [] }, {
        userId: "user_1",
        feature: "analyze",
      }),
    ).rejects.toThrow("boom");
    await new Promise((r) => setImmediate(r));
    expect(mockUsageCreate).toHaveBeenCalledOnce();
    const data = mockUsageCreate.mock.calls[0][0].data;
    expect(data.success).toBe(false);
    expect(data.errorCode).toBe("500");
    expect(data.inputTokens).toBe(0);
    expect(data.outputTokens).toBe(0);
  });

  it("captures the Anthropic error type when present", async () => {
    const err = Object.assign(new Error("rate limited"), {
      status: 429,
      error: { type: "rate_limit_error" },
    });
    mockCreate.mockRejectedValueOnce(err);
    await expect(
      callClaude({ model: "claude-sonnet-4-6", max_tokens: 1, messages: [] }, {
        userId: "user_1",
        feature: "analyze",
      }),
    ).rejects.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(mockUsageCreate.mock.calls[0][0].data.errorCode).toBe("rate_limit_error");
  });
});

describe("recordUsage robustness", () => {
  it("does not bubble DB errors to the caller", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_1",
      model: "claude-sonnet-4-6",
      content: [],
      usage: {},
    });
    mockUsageCreate.mockRejectedValueOnce(new Error("DB exploded"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      callClaude({ model: "claude-sonnet-4-6", max_tokens: 1, messages: [] }, {
        userId: "user_1",
        feature: "analyze",
      }),
    ).resolves.toBeDefined();
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- usage.test
```

Expected: FAIL — module `@/lib/ai/usage` not found.

- [ ] **Step 3: Implement `lib/ai/usage.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { computeCostUsd, type AiUsageInput } from "./prices";

export type AiFeature =
  | "analyze"
  | "identify-grass"
  | "recommendations"
  | "watering"
  | "critique"
  | "overdue-assessor";

export interface AiCallCtx {
  userId: string | null;
  feature: AiFeature;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(
  params: Anthropic.MessageCreateParams,
  ctx: AiCallCtx,
): Promise<Anthropic.Message> {
  try {
    const response = await client.messages.create(params) as Anthropic.Message;
    void recordUsage({
      ...ctx,
      model: response.model,
      usage: response.usage as AiUsageInput,
      success: true,
    });
    return response;
  } catch (err) {
    void recordUsage({
      ...ctx,
      model: typeof params.model === "string" ? params.model : "unknown",
      usage: null,
      success: false,
      errorCode: extractErrorCode(err),
    });
    throw err;
  }
}

interface RecordArgs extends AiCallCtx {
  model: string;
  usage: AiUsageInput | null;
  success: boolean;
  errorCode?: string;
}

async function recordUsage(args: RecordArgs): Promise<void> {
  try {
    const usage = args.usage ?? {};
    const costUsd = args.success ? computeCostUsd(args.model, usage) : 0;
    await db.aiUsageEvent.create({
      data: {
        userId: args.userId,
        feature: args.feature,
        model: args.model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        costUsd,
        success: args.success,
        errorCode: args.errorCode ?? null,
      },
    });
  } catch (err) {
    console.warn("recordUsage: failed to write AiUsageEvent", err);
  }
}

function extractErrorCode(err: unknown): string {
  if (typeof err !== "object" || err === null) return "unknown";
  const e = err as { status?: number; error?: { type?: string } };
  if (e.error?.type) return e.error.type;
  if (typeof e.status === "number") return String(e.status);
  return "unknown";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- usage.test
```

Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/usage.ts lib/ai/__tests__/usage.test.ts
git commit -m "Add callClaude wrapper that records per-call cost rows"
```

---

## Task 4: Convert the `analyze` call site (smoke test)

This is the largest conversion because `analyzeImages` calls the critique + revise helpers. We do this one end-to-end first so any signature issues surface here, not across seven call sites.

**Files:**
- Modify: `lib/claude.ts` — convert `analyzeImages`, `analyzeImagesBase64`, the critique helper (line ~339), the revise helper (line ~620).
- Modify: `app/api/analyze/route.ts` — thread `session.user.id` into the `analyzeImages` call.

- [ ] **Step 1: Add the import to `lib/claude.ts`**

At the top, alongside the other imports:

```ts
import { callClaude, type AiCallCtx } from "@/lib/ai/usage";
```

- [ ] **Step 2: Thread `ctx` through `analyzeImages` and `analyzeImagesBase64`**

Find the signature of `analyzeImages` (around line 360) and `analyzeImagesBase64` (around line 390). Add `ctx: AiCallCtx` as the last parameter.

Replace the two `client.messages.create(...)` calls (lines ~367 and ~397) with `callClaude(...)` passing `ctx`. Example for `analyzeImages`:

```ts
// BEFORE:
const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  // ...
});

// AFTER:
const message = await callClaude({
  model: "claude-sonnet-4-6",
  // ...
}, ctx);
```

- [ ] **Step 3: Convert the critique helper (line ~339)**

Find the critique helper function (`runCritique` or similar — contains `model: CRITIQUE_MODEL`). Add `ctx: AiCallCtx` to its signature. Replace `client.messages.create` with `callClaude`, but override the feature tag:

```ts
const message = await callClaude({
  model: CRITIQUE_MODEL,
  // ...
}, { ...ctx, feature: "critique" });
```

- [ ] **Step 4: Convert the revise helper (line ~620)**

Same pattern as the critique helper. Replace `client.messages.create` with `callClaude({...}, { ...ctx, feature: "critique" })`.

- [ ] **Step 5: Update `analyzeImages`/`analyzeImagesBase64` internal callers to pass `ctx` to critique + revise**

Find where `runCritique(...)` and `runRevise(...)` are called inside `analyzeImages*`. Pass `ctx` as the new last argument.

- [ ] **Step 6: Thread userId in `app/api/analyze/route.ts`**

Find the call to `analyzeImages(...)` or `analyzeImagesBase64(...)` in the route. Append the ctx:

```ts
const result = await analyzeImages(photos, context, { userId: session.user.id, feature: "analyze" });
```

- [ ] **Step 7: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Verify the full test suite still passes**

```bash
npm test
```

Expected: PASS — same count as before plus the new prices+usage tests.

- [ ] **Step 9: Commit**

```bash
git add lib/claude.ts app/api/analyze/route.ts
git commit -m "Route analyze + critique + revise calls through callClaude"
```

---

## Task 5: Convert the `identify-grass` route

**Files:**
- Modify: `app/api/identify-grass/route.ts`

- [ ] **Step 1: Add the import**

```ts
import { callClaude } from "@/lib/ai/usage";
```

- [ ] **Step 2: Replace `client.messages.create` with `callClaude`**

Find the `client.messages.create({...})` call (around line 32). Replace with:

```ts
const message = await callClaude({
  model: "claude-sonnet-4-6",
  // ...same params...
}, { userId: session.user.id, feature: "identify-grass" });
```

If the route still has its own `new Anthropic(...)` client construction, remove it — the wrapper owns the client now.

- [ ] **Step 3: Verify typecheck + tests**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/identify-grass/route.ts
git commit -m "Route identify-grass through callClaude"
```

---

## Task 6: Convert the `recommendations` call site

**Files:**
- Modify: `lib/claude.ts` (the function around line 501)
- Modify: `app/api/recommendations/route.ts`

- [ ] **Step 1: Add `ctx: AiCallCtx` to the recommendations generator's signature in `lib/claude.ts`**

Find the function containing `client.messages.create({ model: "claude-sonnet-4-6", ... })` near line 501 (e.g., `generateRecommendations`). Add `ctx: AiCallCtx` as the last parameter.

Replace the `client.messages.create` call with `callClaude({...}, ctx)`.

- [ ] **Step 2: Thread userId in `app/api/recommendations/route.ts`**

Find the call to the recommendations generator. Append the ctx:

```ts
const result = await generateRecommendations(/* existing args */, {
  userId: session.user.id,
  feature: "recommendations",
});
```

- [ ] **Step 3: Verify typecheck + tests**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/claude.ts app/api/recommendations/route.ts
git commit -m "Route recommendations through callClaude"
```

---

## Task 7: Convert the `watering` call sites

There are two watering calls in `lib/claude.ts`: a Sonnet one (~line 585) and a Haiku one (`generateWateringRecommendation`, ~line 666). Both get the `watering` tag.

**Files:**
- Modify: `lib/claude.ts`

- [ ] **Step 1: Identify both watering functions in `lib/claude.ts`**

```bash
sed -n '570,610p;655,690p' lib/claude.ts
```

Note the names of `export async function ...` declarations around lines 585 and 666. The Haiku one is `generateWateringRecommendation`; the Sonnet one (around 585) name will be visible in this output. Call them `<sonnetWateringFn>` and `<haikuWateringFn>` for the rest of this task.

- [ ] **Step 2: Add `ctx: AiCallCtx` to both functions' signatures**

For each of the two functions, add `ctx: AiCallCtx` as the last parameter.

- [ ] **Step 3: Replace both `client.messages.create` calls with `callClaude(..., ctx)`**

- [ ] **Step 4: Thread userId from callers**

```bash
grep -rn "<sonnetWateringFn>\|<haikuWateringFn>" --include="*.ts" app/ lib/ \
  | grep -v "lib/claude.ts" | grep -v "__tests__"
```

For each caller, append `{ userId: session.user.id, feature: "watering" }` as the new last argument.

- [ ] **Step 5: Verify typecheck + tests**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/claude.ts app/api/ lib/
git commit -m "Route watering calls through callClaude"
```

---

## Task 8: Convert the `overdue-assessor` cron call

**Files:**
- Modify: `lib/cron/overdue-assessor.ts`

- [ ] **Step 1: Inspect the function shape**

```bash
sed -n '1,50p' lib/cron/overdue-assessor.ts
```

Identify (a) the function that calls `client.messages.create` and (b) the per-user loop that triggers it. The cron loops `for user of users` and assesses that user's tasks; the userId is already available at the call site.

- [ ] **Step 2: Replace `client.messages.create` with `callClaude`**

```ts
import { callClaude } from "@/lib/ai/usage";

// inside the per-user assessment:
const message = await callClaude({
  model: "claude-sonnet-4-6",
  // ...
}, { userId: user.id, feature: "overdue-assessor" });
```

If the function that wraps this call is called from outside the per-user loop, add `userId: string` to its signature so the loop can pass it down.

- [ ] **Step 3: Remove any leftover `new Anthropic(...)` in this file**

The wrapper owns the client.

- [ ] **Step 4: Verify typecheck + tests**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 5: Confirm no `client.messages.create` calls remain anywhere**

```bash
grep -rn "client\.messages\.create\|\.messages\.create" --include="*.ts" lib/ app/ \
  | grep -v "node_modules\|__tests__\|/lib/ai/usage.ts"
```

Expected: zero matches outside `lib/ai/usage.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/cron/overdue-assessor.ts
git commit -m "Route overdue-assessor cron through callClaude"
```

---

## Task 9: `buildCostReport()` pure core with TDD

**Files:**
- Create: `lib/cost-report.ts`
- Test: `lib/__tests__/cost-report.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/cost-report.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGroupBy = vi.fn();
const mockUserFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    aiUsageEvent: { groupBy: mockGroupBy },
    user: { findMany: mockUserFindMany },
  },
}));

const { buildCostReport, PLAN_MONTHLY_REVENUE_USD } = await import("@/lib/cost-report");

beforeEach(() => {
  mockGroupBy.mockReset();
  mockUserFindMany.mockReset();
});

describe("buildCostReport", () => {
  it("groups by userId, joins email/plan, computes margin per row", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { userId: "u1", _sum: { costUsd: "14.2100" }, _count: { _all: 127 } },
      { userId: "u2", _sum: { costUsd: "2.8900" }, _count: { _all: 48 } },
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "u1", email: "alice@example.com", plan: "home_plus" },
      { id: "u2", email: "bob@example.com", plan: "home_basic" },
    ]);

    const report = await buildCostReport("2026-05");

    expect(report.month).toBe("2026-05");
    expect(report.rows).toHaveLength(2);

    // Sorted worst margin first: u1 home_plus ($9.99) - $14.21 = -$4.22
    expect(report.rows[0]).toMatchObject({
      userId: "u1",
      email: "alice@example.com",
      plan: "home_plus",
      calls: 127,
    });
    expect(report.rows[0].costUsd).toBeCloseTo(14.21, 2);
    expect(report.rows[0].marginUsd).toBeCloseTo(PLAN_MONTHLY_REVENUE_USD.home_plus - 14.21, 2);

    expect(report.rows[1].userId).toBe("u2");
  });

  it("returns 0% margin when revenue is 0 (trial / admin / unknown plan)", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { userId: "u1", _sum: { costUsd: "5.00" }, _count: { _all: 10 } },
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "u1", email: "trial@example.com", plan: "trial" },
    ]);
    const report = await buildCostReport("2026-05");
    expect(report.rows[0].revenueUsd).toBe(0);
    expect(report.rows[0].marginPct).toBe(0);
  });

  it("totals up cost, revenue, net, and underwater users", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { userId: "u1", _sum: { costUsd: "20.00" }, _count: { _all: 100 } }, // home_plus $9.99 -> -$10.01
      { userId: "u2", _sum: { costUsd: "1.00" },  _count: { _all: 5 } },   // home_basic $4.99 -> +$3.99
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "u1", email: "a@x.com", plan: "home_plus" },
      { id: "u2", email: "b@x.com", plan: "home_basic" },
    ]);
    const report = await buildCostReport("2026-05");
    expect(report.totals.costUsd).toBeCloseTo(21, 2);
    expect(report.totals.revenueUsd).toBeCloseTo(
      PLAN_MONTHLY_REVENUE_USD.home_plus + PLAN_MONTHLY_REVENUE_USD.home_basic,
      2,
    );
    expect(report.totals.usersUnderwater).toBe(1);
  });

  it("handles months with zero events", async () => {
    mockGroupBy.mockResolvedValueOnce([]);
    mockUserFindMany.mockResolvedValueOnce([]);
    const report = await buildCostReport("2026-05");
    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({
      costUsd: 0,
      revenueUsd: 0,
      netUsd: 0,
      usersUnderwater: 0,
    });
  });

  it("queries the right date range for a given month string", async () => {
    mockGroupBy.mockResolvedValueOnce([]);
    mockUserFindMany.mockResolvedValueOnce([]);
    await buildCostReport("2026-05");
    const where = mockGroupBy.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date(Date.UTC(2026, 4, 1)));
    expect(where.createdAt.lt).toEqual(new Date(Date.UTC(2026, 5, 1)));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- cost-report.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/cost-report.ts`**

```ts
import { db } from "@/lib/db";

export const PLAN_MONTHLY_REVENUE_USD: Record<string, number> = {
  trial:        0,
  admin:        0,
  expired:      0,
  home_basic:   4.99,
  home_plus:    9.99,
  professional: 19.99,
};

export interface UserCostRow {
  userId: string;
  email: string;
  plan: string;
  calls: number;
  costUsd: number;
  revenueUsd: number;
  marginUsd: number;
  marginPct: number; // marginUsd / revenueUsd; 0 when revenueUsd === 0
}

export interface CostReport {
  month: string;
  rows: UserCostRow[];
  totals: {
    costUsd: number;
    revenueUsd: number;
    netUsd: number;
    usersUnderwater: number;
  };
}

export const DEFAULT_COST_REPORT_RECIPIENT = "yardanalyzer@gmail.com";

export async function buildCostReport(month: string): Promise<CostReport> {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1; // 0-based for Date.UTC
  const gte = new Date(Date.UTC(year, monthIdx, 1));
  const lt = new Date(Date.UTC(year, monthIdx + 1, 1));

  const groups = await db.aiUsageEvent.groupBy({
    by: ["userId"],
    where: { createdAt: { gte, lt }, userId: { not: null } },
    _sum: { costUsd: true },
    _count: { _all: true },
  });

  const userIds = groups.map((g) => g.userId).filter((id): id is string => !!id);
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, plan: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows: UserCostRow[] = groups.map((g) => {
    const u = userById.get(g.userId!);
    const plan = u?.plan ?? "unknown";
    const revenueUsd = PLAN_MONTHLY_REVENUE_USD[plan] ?? 0;
    const costUsd = Number(g._sum.costUsd ?? 0);
    const marginUsd = revenueUsd - costUsd;
    const marginPct = revenueUsd === 0 ? 0 : marginUsd / revenueUsd;
    return {
      userId: g.userId!,
      email: u?.email ?? "(deleted user)",
      plan,
      calls: g._count._all,
      costUsd,
      revenueUsd,
      marginUsd,
      marginPct,
    };
  });

  // Worst margin first so the email surfaces problems at the top.
  rows.sort((a, b) => a.marginUsd - b.marginUsd);

  const totals = rows.reduce(
    (acc, r) => ({
      costUsd: acc.costUsd + r.costUsd,
      revenueUsd: acc.revenueUsd + r.revenueUsd,
      netUsd: acc.netUsd + r.marginUsd,
      usersUnderwater: acc.usersUnderwater + (r.marginUsd < 0 ? 1 : 0),
    }),
    { costUsd: 0, revenueUsd: 0, netUsd: 0, usersUnderwater: 0 },
  );

  return { month, rows, totals };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- cost-report.test
```

Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/cost-report.ts lib/__tests__/cost-report.test.ts
git commit -m "Add buildCostReport pure core for monthly per-user margin"
```

---

## Task 10: `buildCostReportEmail()` with snapshot test

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/__tests__/cost-report-email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/cost-report-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCostReportEmail } from "@/lib/email";
import type { CostReport } from "@/lib/cost-report";

const fixture: CostReport = {
  month: "2026-05",
  rows: [
    {
      userId: "u1", email: "alice@example.com", plan: "home_plus",
      calls: 127, costUsd: 14.21, revenueUsd: 9.99, marginUsd: -4.22, marginPct: -0.4224,
    },
    {
      userId: "u2", email: "bob@example.com", plan: "home_basic",
      calls: 48, costUsd: 2.89, revenueUsd: 4.99, marginUsd: 2.10, marginPct: 0.4208,
    },
  ],
  totals: { costUsd: 17.10, revenueUsd: 14.98, netUsd: -2.12, usersUnderwater: 1 },
};

describe("buildCostReportEmail", () => {
  it("returns a subject naming the month", () => {
    const { subject } = buildCostReportEmail(fixture);
    expect(subject).toContain("2026-05");
    expect(subject.toLowerCase()).toContain("cost");
  });

  it("includes totals and each row's email + margin in the HTML", () => {
    const { html } = buildCostReportEmail(fixture);
    expect(html).toContain("alice@example.com");
    expect(html).toContain("bob@example.com");
    expect(html).toContain("home_plus");
    expect(html).toContain("home_basic");
    // Underwater row marked negative
    expect(html).toMatch(/-\$?4\.22/);
    // Totals block
    expect(html).toMatch(/-\$?2\.12/);
    expect(html).toMatch(/1\s+of\s+2/i); // 1 underwater of 2
  });

  it("renders the empty-events case with a 'no events' line", () => {
    const empty: CostReport = {
      month: "2026-05",
      rows: [],
      totals: { costUsd: 0, revenueUsd: 0, netUsd: 0, usersUnderwater: 0 },
    };
    const { html } = buildCostReportEmail(empty);
    expect(html.toLowerCase()).toContain("no events");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- cost-report-email.test
```

Expected: FAIL — `buildCostReportEmail` not exported.

- [ ] **Step 3: Add `buildCostReportEmail` to `lib/email.ts`**

Append to `lib/email.ts`:

```ts
import type { CostReport, UserCostRow } from "@/lib/cost-report";

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function rowHtml(r: UserCostRow): string {
  const marginColor = r.marginUsd < 0 ? "#b91c1c" : "#15803d";
  return `<tr>
    <td style="padding:4px 8px;">${r.email}</td>
    <td style="padding:4px 8px;">${r.plan}</td>
    <td style="padding:4px 8px;text-align:right;">${r.calls}</td>
    <td style="padding:4px 8px;text-align:right;">${fmtUsd(r.costUsd)}</td>
    <td style="padding:4px 8px;text-align:right;">${fmtUsd(r.revenueUsd)}</td>
    <td style="padding:4px 8px;text-align:right;color:${marginColor};">${fmtUsd(r.marginUsd)}</td>
  </tr>`;
}

export function buildCostReportEmail(report: CostReport): { subject: string; html: string } {
  const subject = `Cost report - ${report.month}`;
  if (report.rows.length === 0) {
    const html = `<div style="font-family:system-ui,sans-serif;">
      <h2>Cost report - ${report.month}</h2>
      <p>No events recorded for this month.</p>
    </div>`;
    return { subject, html };
  }
  const tableRows = report.rows.map(rowHtml).join("");
  const summaryColor = report.totals.netUsd < 0 ? "#b91c1c" : "#15803d";
  const html = `<div style="font-family:system-ui,sans-serif;color:#111;">
    <h2 style="margin-bottom:4px;">Cost report - ${report.month}</h2>
    <p style="color:#444;margin-top:0;">
      Net margin: <strong style="color:${summaryColor};">${fmtUsd(report.totals.netUsd)}</strong>
      &nbsp;(Revenue ${fmtUsd(report.totals.revenueUsd)} &middot; Cost ${fmtUsd(report.totals.costUsd)})<br>
      Users underwater: <strong>${report.totals.usersUnderwater} of ${report.rows.length}</strong>
    </p>
    <table style="border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:4px 8px;text-align:left;">Email</th>
          <th style="padding:4px 8px;text-align:left;">Plan</th>
          <th style="padding:4px 8px;text-align:right;">Calls</th>
          <th style="padding:4px 8px;text-align:right;">Cost</th>
          <th style="padding:4px 8px;text-align:right;">Revenue</th>
          <th style="padding:4px 8px;text-align:right;">Margin</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
  return { subject, html };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- cost-report-email.test
```

Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/__tests__/cost-report-email.test.ts
git commit -m "Add buildCostReportEmail HTML template"
```

---

## Task 11: Monthly cron route handler

**Files:**
- Create: `app/api/cron/monthly-cost-report/route.ts`

- [ ] **Step 1: Inspect the existing daily cron's auth pattern**

```bash
sed -n '1,40p' app/api/cron/daily/route.ts
```

Note the `CRON_SECRET` timing-safe compare. Mirror that.

- [ ] **Step 2: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { buildCostReport, DEFAULT_COST_REPORT_RECIPIENT } from "@/lib/cost-report";
import { buildCostReportEmail, resend } from "@/lib/email";

function previousMonth(now: Date): string {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = previousMonth(new Date());
  const report = await buildCostReport(month);
  const { subject, html } = buildCostReportEmail(report);
  const to = process.env.COST_REPORT_RECIPIENT ?? DEFAULT_COST_REPORT_RECIPIENT;
  const from = process.env.RESEND_FROM_EMAIL ?? "Yard Analyzer <noreply@yardanalyzer.com>";

  await resend.emails.send({ from, to, subject, html });

  return NextResponse.json({ ok: true, month, rows: report.rows.length });
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test locally**

Start the dev server, then:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/monthly-cost-report"
```

Expected: `200 {"ok":true,"month":"YYYY-MM","rows":0}` for a month with no events. An email lands in the inbox configured by `COST_REPORT_RECIPIENT` (or the default `yardanalyzer@gmail.com` if unset).

If you don't want to actually send an email during the smoke test, set `RESEND_API_KEY` to a sandbox key or temporarily comment out the `resend.emails.send` line.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/monthly-cost-report/route.ts
git commit -m "Add monthly cost-report cron route"
```

---

## Task 12: Add the Vercel cron schedule

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the cron entry**

Open `vercel.json` and add to the `crons` array:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/monthly-cost-report",
      "schedule": "0 8 1 * *"
    }
  ]
}
```

- [ ] **Step 2: Document the env var**

If there's a `.env.example` or env documentation file, add `COST_REPORT_RECIPIENT=yardanalyzer@gmail.com` with a one-line comment. If there is no such file, skip this step.

```bash
ls .env.example 2>/dev/null && echo "exists" || echo "skip"
```

- [ ] **Step 3: Final verification**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: typecheck clean, lint clean (0 errors), all tests pass.

- [ ] **Step 4: Commit**

```bash
git add vercel.json .env.example
git commit -m "Schedule monthly cost-report cron on the 1st at 08:00 UTC"
```

---

## Self-review checklist (for the executor)

Before declaring done:

- [ ] `grep -rn "client\.messages\.create" --include="*.ts" lib/ app/ | grep -v node_modules | grep -v lib/ai/usage.ts` returns zero matches.
- [ ] Every Claude call site has a `feature` tag from the AiFeature union.
- [ ] The cron route is gated by `CRON_SECRET` exactly like `/api/cron/daily`.
- [ ] The smoke-test curl returns `{ ok: true, month, rows: N }`.
- [ ] An email actually arrives at `COST_REPORT_RECIPIENT` when the smoke test runs (or when set to a test inbox).
