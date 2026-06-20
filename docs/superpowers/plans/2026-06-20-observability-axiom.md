# Observability / Axiom Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a single structured logging + event pipeline (Axiom) into Yard Analyzer so production problems surface as alerts before customer complaints. Three first-class typed events (`cron.run`, `rate_limit.hit`, `ai.call` / `ai.daily_summary`) plus a free-form `logger.{info,warn,error}` surface that replaces every `console.*` call in critical paths and auto-captures uncaught exceptions in every API route handler via `withAxiom`.

**Architecture:** `lib/observability/` module exposes a `logger`, a `withAxiom` route-handler wrapper, and typed event emitters. Env-aware transport list: `AxiomJSTransport` in prod, `AxiomJSTransport + ConsoleTransport` in preview, console-only in dev, no-op in test. Axiom dashboard JSON committed to `ops/`; two day-one email alerts (cron failure, AI failure rate > 5% over 15 min with min 10-call floor) configured click-ops in Axiom UI.

**Tech Stack:** `@axiomhq/js` (already installed), `@axiomhq/nextjs` (already installed), `@axiomhq/logging` (new direct dep), `vitest` for tests, Next.js 16 App Router.

**Spec:** `docs/superpowers/specs/2026-06-20-observability-axiom-design.md` (approved).

**Review checkpoints:** four logical groups — Foundation, Event Taxonomy, Migration, Dashboards & Verification. Stop after each group; user reviews before continuing.

---

## Group 1 — Foundation

Single dependency add + four files: `client.ts`, `logger.ts`, `redact.ts`, plus tests for `logger` and `redact`. Establishes the surface used by everything downstream.

### Task 1.1: Install `@axiomhq/logging` as direct dependency

**Files:**
- Modify: `package.json` (add dep), `package-lock.json` (auto)

- [ ] **Step 1: Install**

Run:
```bash
npm install @axiomhq/logging
```
Expected: package added under `dependencies` in `package.json`. Version `^1.x` is fine; pin whatever `npm` resolves.

- [ ] **Step 2: Verify import surface is reachable**

Run:
```bash
node -e "const m = require('@axiomhq/logging'); console.log(Object.keys(m).sort());"
```
Expected: output includes `AxiomJSTransport`, `ConsoleTransport`, `Logger`. If `Transport` interface isn't in the keys, it's still importable as a type — that's fine for TypeScript.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add @axiomhq/logging direct dependency for observability layer"
```

### Task 1.2: Create the Axiom client wrapper

**Files:**
- Create: `lib/observability/client.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/observability/client.ts
import { Axiom } from "@axiomhq/js";

// Lazy singleton — only constructed when first read so tests/dev without an
// AXIOM_TOKEN don't fail at import time.
let client: Axiom | null = null;

export function getAxiomClient(): Axiom | null {
  if (client) return client;
  const token = process.env.AXIOM_TOKEN;
  if (!token) return null;
  client = new Axiom({ token });
  return client;
}

export const AXIOM_DATASET = process.env.AXIOM_DATASET ?? "yard-analyzer";
```

- [ ] **Step 2: Commit**

```bash
git add lib/observability/client.ts
git commit -m "Add lazy Axiom client wrapper"
```

### Task 1.3: Create the redaction helper + tests

**Files:**
- Create: `lib/observability/redact.ts`
- Create: `lib/observability/__tests__/redact.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/observability/__tests__/redact.test.ts
import { describe, it, expect } from "vitest";
import { hashEmail, hashIp } from "@/lib/observability/redact";

describe("hashEmail", () => {
  it("returns an 8-character hex prefix", () => {
    const h = hashEmail("user@example.com");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic", () => {
    expect(hashEmail("user@example.com")).toBe(hashEmail("user@example.com"));
  });

  it("differs across inputs", () => {
    expect(hashEmail("a@example.com")).not.toBe(hashEmail("b@example.com"));
  });
});

describe("hashIp", () => {
  it("returns an 8-character hex prefix", () => {
    expect(hashIp("203.0.113.5")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns 'unknown' for the unknown sentinel without hashing it", () => {
    expect(hashIp("unknown")).toBe("unknown");
  });

  it("is deterministic", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/observability/__tests__/redact.test.ts`
Expected: FAIL with "Cannot find module '@/lib/observability/redact'" or similar.

- [ ] **Step 3: Write the implementation**

```ts
// lib/observability/redact.ts
import { createHash } from "crypto";

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function hashEmail(email: string): string {
  return shortHash(email.toLowerCase());
}

// IPs need to remain groupable across log lines (for "noisy IP" dashboards), so
// hash them. The sentinel "unknown" comes from getClientIp() when no
// x-forwarded-for is present; pass it through so the dashboard shows it
// distinctly rather than as a meaningless hash.
export function hashIp(ip: string): string {
  if (ip === "unknown") return "unknown";
  return shortHash(ip);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/observability/__tests__/redact.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/observability/redact.ts lib/observability/__tests__/redact.test.ts
git commit -m "Add PII-safe email/IP redaction helper"
```

### Task 1.4: Create the env-aware logger + `withAxiom` wrapper + tests

**Files:**
- Create: `lib/observability/logger.ts`
- Create: `lib/observability/__tests__/logger.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/observability/__tests__/logger.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIG_ENV = { ...process.env };

describe("buildTransports", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  it("returns no-op transport when NODE_ENV=test", async () => {
    process.env.NODE_ENV = "test";
    process.env.AXIOM_TOKEN = "tok";
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    // No-op transport's `log` returns undefined (verify by calling it)
    expect(() => transports[0].log({ level: "info", message: "x", fields: {}, _time: new Date().toISOString() })).not.toThrow();
  });

  it("returns console-only when NODE_ENV=development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.AXIOM_TOKEN;
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    // ConsoleTransport identifiable by constructor name
    expect(transports[0].constructor.name).toBe("ConsoleTransport");
  });

  it("returns Axiom + console when VERCEL_ENV=preview", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.AXIOM_TOKEN = "tok";
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(2);
    const names = transports.map((t) => t.constructor.name).sort();
    expect(names).toEqual(["AxiomJSTransport", "ConsoleTransport"]);
  });

  it("returns Axiom only when VERCEL_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.AXIOM_TOKEN = "tok";
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    expect(transports[0].constructor.name).toBe("AxiomJSTransport");
  });

  it("degrades to console when AXIOM_TOKEN is missing in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    delete process.env.AXIOM_TOKEN;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    expect(transports[0].constructor.name).toBe("ConsoleTransport");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("AXIOM_TOKEN"));
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/observability/__tests__/logger.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// lib/observability/logger.ts
import { Logger, AxiomJSTransport, ConsoleTransport, type Transport } from "@axiomhq/logging";
import { createAxiomRouteHandler, nextJsFormatters } from "@axiomhq/nextjs";
import { getAxiomClient, AXIOM_DATASET } from "./client";

const NOOP_TRANSPORT: Transport = {
  log: () => {},
  flush: async () => {},
};

let warnedMissingToken = false;

export function buildTransports(): Transport[] {
  if (process.env.NODE_ENV === "test") {
    return [NOOP_TRANSPORT];
  }

  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | undefined
  const isLocalDev = process.env.NODE_ENV === "development" && !vercelEnv;
  if (isLocalDev) {
    return [new ConsoleTransport({ prettyPrint: true })];
  }

  const axiom = getAxiomClient();
  if (!axiom) {
    if (!warnedMissingToken) {
      console.warn(
        "[observability] AXIOM_TOKEN not set, logs going to console only. Set the env var on Vercel to enable Axiom ingest.",
      );
      warnedMissingToken = true;
    }
    return [new ConsoleTransport()];
  }

  const axiomTransport = new AxiomJSTransport({ axiom, dataset: AXIOM_DATASET });

  // Preview deploys get both — Axiom (tagged env: "preview") for dashboards
  // plus console for `vercel logs` debugging on PR branches.
  if (vercelEnv === "preview") {
    return [axiomTransport, new ConsoleTransport()];
  }

  return [axiomTransport];
}

export function buildEnvScope(): Record<string, string> {
  return {
    env:
      process.env.VERCEL_ENV ??
      (process.env.NODE_ENV === "development" ? "development" : "unknown"),
    service: "yard-analyzer",
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  };
}

export const logger = new Logger({
  transports: buildTransports(),
  formatters: nextJsFormatters,
});

// withAxiom's `store` callback injects request-scoped fields onto every log
// line emitted inside the wrapped handler. Common scope (env/service/version)
// lives there too so it lands on uncaught-exception logs the wrapper produces.
export const withAxiom = createAxiomRouteHandler(logger, {
  store: () => buildEnvScope(),
});
```

> **Note on common fields outside a route handler:** the typed event emitters in `lib/observability/events.ts` (Task 2.1) also include `env/service/version` in their payloads via a `commonFields()` helper, so events fired from cron startup, library code, or background work still carry the scope even though they aren't inside a `withAxiom` wrapper.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/observability/__tests__/logger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: green across the board. If any pre-existing tests fail, do not proceed — investigate root cause.

- [ ] **Step 6: Commit**

```bash
git add lib/observability/logger.ts lib/observability/__tests__/logger.test.ts
git commit -m "Add env-aware Axiom logger + withAxiom route wrapper"
```

### **CHECKPOINT 1** — Stop, report to user

Report: "Group 1 (Foundation) complete. 4 commits. `lib/observability/{client,logger,redact}.ts` plus tests landed. Logger env-routing matrix verified. Ready to continue to Group 2 (event taxonomy)."

---

## Group 2 — Event Taxonomy

One file (`events.ts`) with four typed emitters and one test file. Defines the schema for every typed event in the design.

### Task 2.1: Define typed event emitters + tests

**Files:**
- Create: `lib/observability/events.ts`
- Create: `lib/observability/__tests__/events.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/observability/__tests__/events.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { logger } from "@/lib/observability/logger";
import {
  emitCronRun,
  emitRateLimitHit,
  emitAiCall,
  emitAiDailySummary,
  isExpensiveCall,
} from "@/lib/observability/events";

describe("emitCronRun", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  it("emits info-level event for successful run", () => {
    emitCronRun({
      route: "daily-tasks",
      ok: true,
      durationMs: 1234,
      counts: { yards: 5, emailsSent: 3 },
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "cron.run",
      expect.objectContaining({
        kind: "cron.run",
        route: "daily-tasks",
        ok: true,
        durationMs: 1234,
        counts: { yards: 5, emailsSent: 3 },
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("emits error-level event for failed run with error payload", () => {
    emitCronRun({
      route: "monthly-cost-report",
      ok: false,
      durationMs: 999,
      counts: {},
      error: { message: "Resend timeout", code: "ETIMEDOUT" },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "cron.run",
      expect.objectContaining({
        kind: "cron.run",
        ok: false,
        error: { message: "Resend timeout", code: "ETIMEDOUT" },
      }),
    );
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

describe("emitRateLimitHit", () => {
  it("emits a warn-level event with hashed IP and userId", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    emitRateLimitHit({
      route: "/api/analyze",
      ip: "203.0.113.5",
      userId: "user_abc",
      maxAttempts: 10,
      windowMs: 3600000,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "rate_limit.hit",
      expect.objectContaining({
        kind: "rate_limit.hit",
        route: "/api/analyze",
        ipHash: expect.stringMatching(/^[0-9a-f]{8}$/),
        userIdHash: expect.stringMatching(/^[0-9a-f]{8}$/),
        limit: { maxAttempts: 10, windowMs: 3600000 },
      }),
    );
  });

  it("omits userIdHash when userId is null", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    emitRateLimitHit({
      route: "/api/auth/register",
      ip: "203.0.113.5",
      userId: null,
      maxAttempts: 5,
      windowMs: 3600000,
    });
    const payload = warnSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.userIdHash).toBeUndefined();
  });
});

describe("isExpensiveCall", () => {
  it("flags calls over the cost threshold", () => {
    expect(isExpensiveCall({ costUsd: 0.06, inputTokens: 100 })).toBe(true);
  });
  it("flags calls over the input-token threshold", () => {
    expect(isExpensiveCall({ costUsd: 0.001, inputTokens: 60_000 })).toBe(true);
  });
  it("does not flag cheap, small calls", () => {
    expect(isExpensiveCall({ costUsd: 0.001, inputTokens: 100 })).toBe(false);
  });
  it("respects env-var thresholds when set", () => {
    process.env.AI_EVENT_COST_THRESHOLD_USD = "1.0";
    expect(isExpensiveCall({ costUsd: 0.5, inputTokens: 100 })).toBe(false);
    delete process.env.AI_EVENT_COST_THRESHOLD_USD;
  });
});

describe("emitAiCall", () => {
  it("emits error level when success=false", () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    emitAiCall({
      userId: "u1",
      feature: "analyze",
      model: "claude-sonnet-4-6",
      success: false,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      errorCode: "rate_limit_error",
      reason: "failure",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "ai.call",
      expect.objectContaining({ kind: "ai.call", reason: "failure", errorCode: "rate_limit_error" }),
    );
  });

  it("emits warn level when success=true (expensive)", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    emitAiCall({
      userId: "u1",
      feature: "analyze",
      model: "claude-opus-4-7",
      success: true,
      costUsd: 0.2,
      inputTokens: 10000,
      outputTokens: 2000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reason: "expensive",
    });
    expect(warnSpy).toHaveBeenCalledWith("ai.call", expect.objectContaining({ reason: "expensive" }));
  });
});

describe("emitAiDailySummary", () => {
  it("emits an info-level summary event", () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    emitAiDailySummary({
      date: "2026-06-19",
      totals: { calls: 50, failures: 2, costUsd: 1.23 },
      byFeature: { analyze: { calls: 30, costUsd: 1.0 } },
      topUsers: [{ userId: "u1", calls: 10, costUsd: 0.5 }],
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "ai.daily_summary",
      expect.objectContaining({
        kind: "ai.daily_summary",
        date: "2026-06-19",
        totals: { calls: 50, failures: 2, costUsd: 1.23 },
      }),
    );
  });
});

describe("common fields on every event", () => {
  it("includes env, service, version on cron.run payloads", () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    emitCronRun({ route: "trial-reminders", ok: true, durationMs: 1, counts: {} });
    expect(infoSpy).toHaveBeenCalledWith(
      "cron.run",
      expect.objectContaining({
        env: expect.any(String),
        service: "yard-analyzer",
        version: expect.any(String),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/observability/__tests__/events.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// lib/observability/events.ts
import { logger, buildEnvScope } from "./logger";
import { hashEmail, hashIp } from "./redact";

// Common fields included in every typed event payload so events fired outside
// a `withAxiom` route handler (cron startup, library code) still carry the
// env/service/version scope.
function commonFields(): Record<string, string> {
  return buildEnvScope();
}

export type CronRoute =
  | "daily-tasks"
  | "trial-reminders"
  | "account-deletion"
  | "card-expiry"
  | "monthly-cost-report";

export type AiFeature =
  | "analyze"
  | "identify-grass"
  | "recommendations"
  | "watering"
  | "critique"
  | "overdue-assessor";

interface CronRunArgs {
  route: CronRoute;
  ok: boolean;
  durationMs: number;
  counts: Record<string, number>;
  error?: { message: string; code?: string; stack?: string };
}

export function emitCronRun(args: CronRunArgs): void {
  const payload = {
    ...commonFields(),
    kind: "cron.run" as const,
    route: args.route,
    ok: args.ok,
    durationMs: args.durationMs,
    counts: args.counts,
    ...(args.error ? { error: args.error } : {}),
  };
  if (args.ok) logger.info("cron.run", payload);
  else logger.error("cron.run", payload);
}

interface RateLimitHitArgs {
  route: string;
  ip: string;
  userId: string | null;
  maxAttempts: number;
  windowMs: number;
}

export function emitRateLimitHit(args: RateLimitHitArgs): void {
  const payload: Record<string, unknown> = {
    ...commonFields(),
    kind: "rate_limit.hit",
    route: args.route,
    ipHash: hashIp(args.ip),
    limit: { maxAttempts: args.maxAttempts, windowMs: args.windowMs },
  };
  if (args.userId) {
    // Reuse the email-hash function — same shape, deterministic.
    payload.userIdHash = hashEmail(args.userId);
  }
  logger.warn("rate_limit.hit", payload);
}

const DEFAULT_COST_THRESHOLD = 0.05;
const DEFAULT_INPUT_TOKEN_THRESHOLD = 50_000;

export function isExpensiveCall(args: { costUsd: number; inputTokens: number }): boolean {
  const costThreshold = Number(process.env.AI_EVENT_COST_THRESHOLD_USD ?? DEFAULT_COST_THRESHOLD);
  const tokenThreshold = Number(
    process.env.AI_EVENT_INPUT_TOKEN_THRESHOLD ?? DEFAULT_INPUT_TOKEN_THRESHOLD,
  );
  return args.costUsd > costThreshold || args.inputTokens > tokenThreshold;
}

interface AiCallArgs {
  userId: string | null;
  feature: AiFeature;
  model: string;
  success: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  errorCode?: string;
  reason: "failure" | "expensive";
}

export function emitAiCall(args: AiCallArgs): void {
  const payload = { ...commonFields(), kind: "ai.call" as const, ...args };
  if (!args.success) logger.error("ai.call", payload);
  else logger.warn("ai.call", payload);
}

interface AiDailySummaryArgs {
  date: string;
  totals: { calls: number; failures: number; costUsd: number };
  byFeature: Record<string, { calls: number; costUsd: number }>;
  topUsers: Array<{ userId: string; calls: number; costUsd: number }>;
}

export function emitAiDailySummary(args: AiDailySummaryArgs): void {
  logger.info("ai.daily_summary", { ...commonFields(), kind: "ai.daily_summary", ...args });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/observability/__tests__/events.test.ts`
Expected: PASS, all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add lib/observability/events.ts lib/observability/__tests__/events.test.ts
git commit -m "Add typed event emitters: cron.run, rate_limit.hit, ai.call, ai.daily_summary"
```

### **CHECKPOINT 2** — Stop, report to user

Report: "Group 2 (Event Taxonomy) complete. 1 commit. All 4 typed emitters defined and unit-tested. Ready to continue to Group 3 (migration)."

---

## Group 3 — Migration

The big group. Splits into 5 sub-groups:
- 3a — rate-limit (lowest blast radius, gates other tasks)
- 3b — AI usage tracking (`lib/ai/usage.ts` + `lib/ai/prices.ts`)
- 3c — Cron routes (all 5)
- 3d — `ai.daily_summary` emission in `daily-tasks` cron
- 3e — Remaining lib + API route wrapping

### Task 3a.1: Add `route` parameter to `checkRateLimit` + emit event

**Files:**
- Modify: `lib/rate-limit.ts`
- Modify: `lib/__tests__/rate-limit.test.ts` (extend existing, do not replace)

- [ ] **Step 1: Add a failing test for the new behavior**

Append to `lib/__tests__/rate-limit.test.ts`:

```ts
import { vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";
import * as events from "@/lib/observability/events";

describe("checkRateLimit emits rate_limit.hit on limit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits when the in-memory fallback returns limited", async () => {
    const spy = vi.spyOn(events, "emitRateLimitHit").mockImplementation(() => {});
    const key = `test:${Math.random()}`;
    const ctx = { route: "/api/test", ip: "203.0.113.9", userId: "user_x" };

    // First call below the limit — should NOT emit
    await checkRateLimit(key, 1, 60_000, ctx);
    expect(spy).not.toHaveBeenCalled();

    // Second call exceeds the limit — should emit exactly once
    await checkRateLimit(key, 1, 60_000, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      route: "/api/test",
      ip: "203.0.113.9",
      userId: "user_x",
      maxAttempts: 1,
      windowMs: 60_000,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/rate-limit.test.ts -t "emits rate_limit.hit"`
Expected: FAIL (either compilation error on extra arg or "expected spy to be called").

- [ ] **Step 3: Update `lib/rate-limit.ts`**

Replace the existing `checkRateLimit` function (and only that function) with:

```ts
export interface RateLimitContext {
  route: string;
  ip: string;
  userId: string | null;
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  ctx?: RateLimitContext,
): Promise<{ limited: boolean }> {
  const limiter = getLimiter(maxAttempts, windowMs);
  const result = limiter
    ? { limited: !(await limiter.limit(key)).success }
    : memoryCheck(key, maxAttempts, windowMs);

  if (result.limited && ctx) {
    // Lazy import keeps the rate-limit module free of observability deps for
    // any caller (tests, scripts) that doesn't pass ctx.
    const { emitRateLimitHit } = await import("@/lib/observability/events");
    emitRateLimitHit({
      route: ctx.route,
      ip: ctx.ip,
      userId: ctx.userId,
      maxAttempts,
      windowMs,
    });
  }

  return result;
}
```

- [ ] **Step 4: Verify the new test passes and existing tests still pass**

Run: `npx vitest run lib/__tests__/rate-limit.test.ts`
Expected: all PASS, including the existing `getClientIp` block.

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts lib/__tests__/rate-limit.test.ts
git commit -m "Wire rate-limit hits to Axiom event emitter"
```

### Task 3a.2: Update all 10 callers of `checkRateLimit` to pass `ctx`

**Files (all under `app/api/`):**
- Modify: `analyze/route.ts`, `weather/route.ts`, `identify-grass/route.ts`, `recommendations/route.ts`, `upload/route.ts`, `validate-zip/route.ts`, `lookup-yard-size/route.ts`, `auth/register/route.ts`, `auth/forgot-password/route.ts`, `auth/reset-password/route.ts`

- [ ] **Step 1: Pattern — authenticated routes**

For each of `analyze`, `weather`, `identify-grass`, `recommendations`, `upload`, `validate-zip`, `lookup-yard-size`: locate the `checkRateLimit(...)` call and add the 4th argument. Also import `getClientIp` if not already imported.

Pattern (example for `app/api/analyze/route.ts`):

Before:
```ts
import { checkRateLimit } from "@/lib/rate-limit";
// ...
const rate = await checkRateLimit(`analyze:${session.user.id}`, 10, 60 * 60 * 1000);
```

After:
```ts
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
// ...
const rate = await checkRateLimit(
  `analyze:${session.user.id}`,
  10,
  60 * 60 * 1000,
  { route: "/api/analyze", ip: getClientIp(req), userId: session.user.id },
);
```

The `route` string in `ctx` should match the URL path (e.g. `"/api/weather"`, `"/api/upload"`).

- [ ] **Step 2: Pattern — unauthenticated auth routes**

For `register`, `forgot-password`, `reset-password`: `getClientIp` is already imported. Pass `userId: null`.

Pattern (example for `app/api/auth/register/route.ts`):

Before:
```ts
const { limited } = await checkRateLimit(`register:${getClientIp(req)}`, 5, HOUR_MS);
```

After:
```ts
const { limited } = await checkRateLimit(
  `register:${getClientIp(req)}`,
  5,
  HOUR_MS,
  { route: "/api/auth/register", ip: getClientIp(req), userId: null },
);
```

- [ ] **Step 3: Verify no callers were missed**

Run:
```bash
grep -rn "checkRateLimit(" app lib --include="*.ts" | grep -v __tests__ | grep -v "checkRateLimit," | grep -v "ctx?"
```
Expected: only the function definition in `lib/rate-limit.ts` should remain unmatched (every caller now passes ≥4 args). Inspect output; any 3-arg caller is a miss.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts app/api/weather/route.ts app/api/identify-grass/route.ts app/api/recommendations/route.ts app/api/upload/route.ts app/api/validate-zip/route.ts app/api/lookup-yard-size/route.ts app/api/auth/register/route.ts app/api/auth/forgot-password/route.ts app/api/auth/reset-password/route.ts
git commit -m "Pass rate-limit context (route, ip, userId) from all API callers"
```

### Task 3b.1: Wire AI cost events in `lib/ai/usage.ts`

**Files:**
- Modify: `lib/ai/usage.ts`
- Modify: `lib/ai/__tests__/usage.test.ts` (extend)

- [ ] **Step 1: Add failing test for failure event emission**

Append to `lib/ai/__tests__/usage.test.ts`:

```ts
import * as events from "@/lib/observability/events";

describe("callClaude emits ai.call on failure", () => {
  it("emits with reason=failure when the SDK throws", async () => {
    const emitSpy = vi.spyOn(events, "emitAiCall").mockImplementation(() => {});
    // Existing test infra in this file already mocks the Anthropic SDK; reuse
    // whatever pattern is there to make `client.messages.create` reject.
    // Then:
    await expect(
      callClaude({ model: "claude-sonnet-4-6", max_tokens: 10, messages: [] }, {
        userId: "u1",
        feature: "analyze",
      }),
    ).rejects.toBeDefined();
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "failure", success: false, userId: "u1", feature: "analyze" }),
    );
  });
});
```

> **Note on existing test mocks:** read `lib/ai/__tests__/usage.test.ts` first to understand the existing Anthropic SDK mock setup. The snippet above describes intent — copy the existing mock pattern (likely `vi.mock("@anthropic-ai/sdk")`) for the actual setup lines.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/ai/__tests__/usage.test.ts -t "emits with reason=failure"`
Expected: FAIL.

- [ ] **Step 3: Update `lib/ai/usage.ts`**

Replace the existing `callClaude` and `recordUsage` functions with:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { computeCostUsd, type AiUsageInput } from "./prices";
import { logger } from "@/lib/observability/logger";
import { emitAiCall, isExpensiveCall, type AiFeature } from "@/lib/observability/events";

export type { AiFeature };

export interface AiCallCtx {
  userId: string | null;
  feature: AiFeature;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(
  params: Omit<Anthropic.MessageCreateParams, "stream"> & { stream?: false },
  ctx: AiCallCtx,
): Promise<Anthropic.Message> {
  try {
    const response = (await client.messages.create(params)) as Anthropic.Message;
    const usage = response.usage as AiUsageInput;
    const costUsd = computeCostUsd(response.model, usage);
    const inputTokens = usage.input_tokens ?? 0;

    await recordUsage({ ...ctx, model: response.model, usage, success: true });

    // Mirror only outliers — failures and expensive calls — to Axiom.
    // Postgres remains the source of truth for the monthly margin report.
    if (isExpensiveCall({ costUsd, inputTokens })) {
      emitAiCall({
        userId: ctx.userId,
        feature: ctx.feature,
        model: response.model,
        success: true,
        costUsd,
        inputTokens,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        reason: "expensive",
      });
    }

    return response;
  } catch (err) {
    const model = typeof params.model === "string" ? params.model : "unknown";
    const errorCode = extractErrorCode(err);
    await recordUsage({ ...ctx, model, usage: null, success: false, errorCode });
    emitAiCall({
      userId: ctx.userId,
      feature: ctx.feature,
      model,
      success: false,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      errorCode,
      reason: "failure",
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
    logger.error("recordUsage: failed to write AiUsageEvent", {
      err: err instanceof Error ? err.message : String(err),
      feature: args.feature,
      model: args.model,
    });
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

- [ ] **Step 4: Verify new + existing tests pass**

Run: `npx vitest run lib/ai/__tests__/usage.test.ts`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/usage.ts lib/ai/__tests__/usage.test.ts
git commit -m "Emit ai.call event to Axiom on failures and expensive calls"
```

### Task 3b.2: Migrate `console.warn` in `lib/ai/prices.ts`

**Files:**
- Modify: `lib/ai/prices.ts`

- [ ] **Step 1: Replace**

In `lib/ai/prices.ts`, change:
```ts
console.warn(`computeCostUsd: unknown model "${model}" - pricing as ${FALLBACK_MODEL}`);
```
to:
```ts
const { logger } = await import("@/lib/observability/logger");
logger.warn("computeCostUsd: unknown model", { model, fallback: FALLBACK_MODEL });
```

> **Why lazy import:** `lib/ai/prices.ts` is imported synchronously by `lib/ai/usage.ts`. Keeping the import lazy avoids a tight cycle (`prices.ts` → `logger.ts` → … → indirectly back via Axiom transport setup) at module-load time. Alternative: hoist the import — verify there's no cycle first by running `npm run build`. If clean, prefer the hoisted import.

- [ ] **Step 2: Verify build and tests**

Run: `npm test && npm run build`
Expected: both green.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/prices.ts
git commit -m "Route unknown-model warning through observability logger"
```

### Task 3b.3: Migrate `lib/cron/overdue-assessor.ts` console calls

**Files:**
- Modify: `lib/cron/overdue-assessor.ts`

- [ ] **Step 1: Replace both calls**

Find:
```ts
console.error("assessOverdueTasks: no JSON array found in response");
```
Replace with:
```ts
logger.error("assessOverdueTasks: no JSON array found in response");
```

Find:
```ts
console.error("assessOverdueTasks: JSON.parse failed:", err);
```
Replace with:
```ts
logger.error("assessOverdueTasks: JSON.parse failed", {
  err: err instanceof Error ? err.message : String(err),
});
```

Add at the top of the file:
```ts
import { logger } from "@/lib/observability/logger";
```

- [ ] **Step 2: Verify build and tests**

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add lib/cron/overdue-assessor.ts
git commit -m "Route overdue-assessor errors through observability logger"
```

### Task 3c.1: Migrate `app/api/cron/monthly-cost-report/route.ts`

**Files:**
- Modify: `app/api/cron/monthly-cost-report/route.ts`

- [ ] **Step 1: Rewrite the route**

Full replacement (preserves all existing behavior; adds `withAxiom` wrap, structured logging, and `cron.run` emit):

```ts
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { buildCostReport, DEFAULT_COST_REPORT_RECIPIENT } from "@/lib/cost-report";
import { buildCostReportEmail, resend } from "@/lib/email";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";

const RETAIN_MONTHS = 3;

function previousMonth(now: Date): string {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const GET = withAxiom(async (req: NextRequest) => {
  const startedAt = Date.now();
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const provided = authHeader ?? "";
  const tokensMatch =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!tokensMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = previousMonth(new Date());

  let report;
  try {
    report = await buildCostReport(month);
  } catch (err) {
    logger.error("monthly-cost-report: buildCostReport failed", {
      month,
      err: err instanceof Error ? err.message : String(err),
    });
    emitCronRun({
      route: "monthly-cost-report",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { month: Number(month.replace("-", "")) },
      error: { message: "buildCostReport failed", code: "build" },
    });
    return NextResponse.json({ ok: false, month, stage: "build" }, { status: 500 });
  }

  const { subject, html } = buildCostReportEmail(report);
  const to = process.env.COST_REPORT_RECIPIENT ?? DEFAULT_COST_REPORT_RECIPIENT;

  try {
    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.com>",
      to,
      subject,
      html,
    });
  } catch (err) {
    logger.error("monthly-cost-report: resend send failed", {
      month,
      to,
      err: err instanceof Error ? err.message : String(err),
    });
    emitCronRun({
      route: "monthly-cost-report",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { rows: report.rows.length },
      error: { message: "resend send failed", code: "send" },
    });
    return NextResponse.json({ ok: false, month, stage: "send" }, { status: 500 });
  }

  const [yearStr, monthStr] = month.split("-");
  const cutoff = new Date(Date.UTC(Number(yearStr), Number(monthStr) - RETAIN_MONTHS, 1));
  let purged = 0;
  try {
    const result = await db.aiUsageEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    purged = result.count;
  } catch (err) {
    logger.error("monthly-cost-report: purge failed", {
      month,
      cutoff: cutoff.toISOString(),
      err: err instanceof Error ? err.message : String(err),
    });
    emitCronRun({
      route: "monthly-cost-report",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { rows: report.rows.length, purged: 0, purgeError: 1 },
    });
    return NextResponse.json({ ok: true, month, rows: report.rows.length, purged: 0, purgeError: true });
  }

  emitCronRun({
    route: "monthly-cost-report",
    ok: true,
    durationMs: Date.now() - startedAt,
    counts: { rows: report.rows.length, purged },
  });
  return NextResponse.json({ ok: true, month, rows: report.rows.length, purged });
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean. If the wrapper changes route export signatures incompatibly, investigate — see Axiom `createAxiomRouteHandler` docs.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/monthly-cost-report/route.ts
git commit -m "Wire monthly-cost-report cron through Axiom + cron.run emit"
```

### Task 3c.2: Migrate `app/api/cron/trial-reminders/route.ts`

**Files:**
- Modify: `app/api/cron/trial-reminders/route.ts`

- [ ] **Step 1: Rewrite**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { resend, buildTrialReminderEmail } from "@/lib/email";
import { mapWithConcurrency } from "@/lib/cron/concurrency";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";

export const maxDuration = 300;
const EMAIL_CONCURRENCY = 10;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const GET = withAxiom(async (req: NextRequest) => {
  const startedAt = Date.now();
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const today = startOfToday();
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const pricingUrl = `${baseUrl}/pricing`;
  const reminderDays = [7, 1];

  let sent = 0;
  let failed = 0;

  try {
    for (const daysLeft of reminderDays) {
      const targetDate = addDays(today, daysLeft);

      const trialUsers = await db.user.findMany({
        where: {
          planStatus: "trialing",
          trialEndsAt: { gte: targetDate, lt: addDays(targetDate, 1) },
        },
        select: { id: true, email: true, name: true },
      });

      await mapWithConcurrency(trialUsers, EMAIL_CONCURRENCY, async (user) => {
        if (!user.email) return;
        const { subject, html } = buildTrialReminderEmail({
          userName: user.name?.split(" ")[0] ?? "there",
          daysLeft,
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
          logger.error("trial-reminders: email send failed", {
            daysLeft,
            userId: user.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    emitCronRun({
      route: "trial-reminders",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
    });
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    emitCronRun({
      route: "trial-reminders",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { sent, failed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err; // let withAxiom + the framework handle the 500
  }
});
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/trial-reminders/route.ts
git commit -m "Wire trial-reminders cron through Axiom + cron.run emit"
```

### Task 3c.3: Migrate `app/api/cron/account-deletion/route.ts`

**Files:**
- Modify: `app/api/cron/account-deletion/route.ts`

- [ ] **Step 1: Read the file**

Run: `cat app/api/cron/account-deletion/route.ts`

Apply the same shape as task 3c.2:
1. Wrap export with `withAxiom(async (req) => { ... })`
2. Add `const startedAt = Date.now();` and `let deleted = 0; let failed = 0;` (or whatever counters the route tracks)
3. Replace `console.log(` with `logger.info(`, `console.error(` with `logger.error(` (use the structured form: `logger.error("...", { ...fields })`)
4. Wrap the body in `try { ... return NextResponse.json(...) } catch (err) { emitCronRun({ ok: false, error: {...} }); throw err; }`
5. Emit `cron.run` with `ok: true` and the counters before the success return.

Imports to add:
```ts
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/account-deletion/route.ts
git commit -m "Wire account-deletion cron through Axiom + cron.run emit"
```

### Task 3c.4: Migrate `app/api/cron/card-expiry/route.ts`

Same shape as 3c.3. Counters: track `warned` (successes) and `failed`. Migrate both `console.log` and `console.error` calls.

- [ ] **Step 1: Apply the pattern from 3c.2/3c.3**

- [ ] **Step 2: Verify and commit**

```bash
npm run build
git add app/api/cron/card-expiry/route.ts
git commit -m "Wire card-expiry cron through Axiom + cron.run emit"
```

### Task 3c.5: Migrate `app/api/cron/daily-tasks/route.ts`

**Files:**
- Modify: `app/api/cron/daily-tasks/route.ts`

This route is 429 lines; do not rewrite from scratch. Apply targeted edits.

- [ ] **Step 1: Add imports near top**

After existing imports, add:
```ts
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";
```

- [ ] **Step 2: Wrap the export**

Find:
```ts
export async function GET(req: NextRequest) {
```
Replace with:
```ts
export const GET = withAxiom(async (req: NextRequest) => {
  const startedAt = Date.now();
```

At the bottom of the function (currently `return NextResponse.json({ ok: true, processed: userMap.size });`), wrap and emit. Replace the trailing block with:

```ts
  emitCronRun({
    route: "daily-tasks",
    ok: true,
    durationMs: Date.now() - startedAt,
    counts: { yards: yards.length, usersProcessed: userMap.size },
  });
  return NextResponse.json({ ok: true, processed: userMap.size });
});
```

(Note the closing `});` instead of `}` to match the arrow-function + wrapper closure.)

- [ ] **Step 3: Wrap the body in try/catch for the failure path**

The route does not currently have an outer try/catch. Wrap the function body between `const startedAt = ...` and the closing emit/return with a try, and add a catch that emits a failed `cron.run` and re-throws:

```ts
  try {
    // ... entire existing body ...
    emitCronRun({ /* success emit as shown above */ });
    return NextResponse.json({ ok: true, processed: userMap.size });
  } catch (err) {
    emitCronRun({
      route: "daily-tasks",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: {},
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err;
  }
```

- [ ] **Step 4: Migrate the 3 inline console calls**

Find and replace:

```ts
console.warn(`[cron] No weather data for ZIP ${yard.zipCode}, skipping yard ${yard.id}`);
```
becomes:
```ts
logger.warn("daily-tasks: no weather data, skipping yard", { zipCode: yard.zipCode, yardId: yard.id });
```

```ts
console.error("Overdue assessment failed for section:", err);
```
becomes:
```ts
logger.error("daily-tasks: overdue assessment failed", {
  err: err instanceof Error ? err.message : String(err),
});
```

```ts
console.error("Email send failed for user:", userId, err);
```
becomes:
```ts
logger.error("daily-tasks: email send failed", {
  userId,
  err: err instanceof Error ? err.message : String(err),
});
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/daily-tasks/route.ts
git commit -m "Wire daily-tasks cron through Axiom + cron.run emit"
```

### Task 3d.1: Emit `ai.daily_summary` at start of `daily-tasks` cron

**Files:**
- Create: `lib/observability/ai-daily-summary.ts`
- Create: `lib/observability/__tests__/ai-daily-summary.test.ts`
- Modify: `app/api/cron/daily-tasks/route.ts` (add one call at top of GET body)

- [ ] **Step 1: Write the failing test**

```ts
// lib/observability/__tests__/ai-daily-summary.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    aiUsageEvent: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { buildAiDailySummary } from "@/lib/observability/ai-daily-summary";

describe("buildAiDailySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates totals, byFeature, and topUsers for the given day", async () => {
    // 3 events on 2026-06-19:
    //   user u1, analyze, $0.50, success
    //   user u1, analyze, $0.20, success
    //   user u2, identify-grass, $0.10, failure
    (db.aiUsageEvent.groupBy as ReturnType<typeof vi.fn>).mockImplementation(async (q: { by: string[] }) => {
      if (q.by.includes("feature")) {
        return [
          { feature: "analyze", _sum: { costUsd: 0.7 }, _count: { _all: 2 } },
          { feature: "identify-grass", _sum: { costUsd: 0.1 }, _count: { _all: 1 } },
        ];
      }
      if (q.by.includes("userId")) {
        return [
          { userId: "u1", _sum: { costUsd: 0.7 }, _count: { _all: 2 } },
          { userId: "u2", _sum: { costUsd: 0.1 }, _count: { _all: 1 } },
        ];
      }
      return [];
    });
    (db.aiUsageEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { success: true }, { success: true }, { success: false },
    ]);

    const summary = await buildAiDailySummary("2026-06-19");

    expect(summary.date).toBe("2026-06-19");
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.failures).toBe(1);
    expect(summary.totals.costUsd).toBeCloseTo(0.8, 3);
    expect(summary.byFeature.analyze).toEqual({ calls: 2, costUsd: 0.7 });
    expect(summary.topUsers[0]).toEqual({ userId: "u1", calls: 2, costUsd: 0.7 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/observability/__tests__/ai-daily-summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/observability/ai-daily-summary.ts
import { db } from "@/lib/db";
import { emitAiDailySummary } from "./events";

export interface AiDailySummary {
  date: string;
  totals: { calls: number; failures: number; costUsd: number };
  byFeature: Record<string, { calls: number; costUsd: number }>;
  topUsers: Array<{ userId: string; calls: number; costUsd: number }>;
}

export async function buildAiDailySummary(date: string): Promise<AiDailySummary> {
  const [y, m, d] = date.split("-").map(Number);
  const gte = new Date(Date.UTC(y, m - 1, d));
  const lt = new Date(Date.UTC(y, m - 1, d + 1));
  const where = { createdAt: { gte, lt } };

  const [byFeatureRows, byUserRows, allRows] = await Promise.all([
    db.aiUsageEvent.groupBy({
      by: ["feature"],
      where,
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    db.aiUsageEvent.groupBy({
      by: ["userId"],
      where: { ...where, userId: { not: null } },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    db.aiUsageEvent.findMany({ where, select: { success: true } }),
  ]);

  const calls = allRows.length;
  const failures = allRows.filter((r) => !r.success).length;
  const costUsd = byFeatureRows.reduce((acc, r) => acc + Number(r._sum.costUsd ?? 0), 0);

  const byFeature: Record<string, { calls: number; costUsd: number }> = {};
  for (const r of byFeatureRows) {
    byFeature[r.feature] = { calls: r._count._all, costUsd: Number(r._sum.costUsd ?? 0) };
  }

  const topUsers = byUserRows
    .map((r) => ({
      userId: r.userId as string,
      calls: r._count._all,
      costUsd: Number(r._sum.costUsd ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 10);

  return { date, totals: { calls, failures, costUsd }, byFeature, topUsers };
}

export async function emitYesterdaysAiSummary(now: Date = new Date()): Promise<void> {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const date = yesterday.toISOString().slice(0, 10);
  const summary = await buildAiDailySummary(date);
  emitAiDailySummary(summary);
}
```

- [ ] **Step 4: Verify test passes**

Run: `npx vitest run lib/observability/__tests__/ai-daily-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Call from `daily-tasks` cron**

In `app/api/cron/daily-tasks/route.ts`, add at the top of the `try { ... }` block (right after `const startedAt = ...`):

```ts
  // Emit yesterday's AI cost summary (fire-and-forget — don't fail the cron if
  // this aggregate query has a hiccup; withAxiom captures any throw).
  try {
    const { emitYesterdaysAiSummary } = await import("@/lib/observability/ai-daily-summary");
    await emitYesterdaysAiSummary();
  } catch (err) {
    logger.error("daily-tasks: ai daily summary failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
```

- [ ] **Step 6: Verify build**

Run: `npm run build && npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add lib/observability/ai-daily-summary.ts lib/observability/__tests__/ai-daily-summary.test.ts app/api/cron/daily-tasks/route.ts
git commit -m "Emit ai.daily_summary event at start of daily-tasks cron"
```

### Task 3e.1: Wrap all non-cron API routes with `withAxiom` and migrate `console.error`

**Files (each gets the same pattern):**
- Modify: `app/api/analyze/route.ts`, `app/api/recommendations/route.ts`, `app/api/weather/route.ts`, `app/api/upload/route.ts`, `app/api/auth/forgot-password/route.ts`, `app/api/stripe/webhook/route.ts`

(Other API routes — `validate-zip`, `identify-grass`, `lookup-yard-size`, `register`, `reset-password`, `[...nextauth]`, `notifications/*`, `user/*`, `yard/*` — do not currently call `console.*` but should still be wrapped for uncaught-exception capture. Include them in the same task.)

- [ ] **Step 1: Pattern (apply to every route)**

Before:
```ts
export async function GET(req: NextRequest) {
  // body
}
```
After:
```ts
import { withAxiom, logger } from "@/lib/observability/logger";

export const GET = withAxiom(async (req: NextRequest) => {
  // body
});
```

For each `console.error("X", err)` call inside the body:
```ts
logger.error("X", { err: err instanceof Error ? err.message : String(err) });
```

For multi-arg `console.error("X:", id, err)`:
```ts
logger.error("X", { id, err: err instanceof Error ? err.message : String(err) });
```

The `[...nextauth]` route exports `handlers` from `lib/auth.ts` — wrap it slightly differently:
```ts
import { handlers } from "@/lib/auth";
import { withAxiom } from "@/lib/observability/logger";
export const GET = withAxiom(handlers.GET);
export const POST = withAxiom(handlers.POST);
```
Verify the current contents of this file first; if the existing pattern differs, adapt.

- [ ] **Step 2: Sweep — verify no `console.error` remains under `app/api/`**

Run:
```bash
grep -rn "console\." app/api --include="*.ts"
```
Expected: empty output, or only inside the `withAxiom` library import (none).

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: green.

- [ ] **Step 4: Commit (single commit for all routes, message lists them)**

```bash
git add app/api/
git commit -m "Wrap all API routes with withAxiom; migrate console.error calls to logger"
```

### **CHECKPOINT 3** — Stop, report to user

Report: "Group 3 (Migration) complete. Commits: rate-limit (+ 10 caller updates), AI usage events, prices + overdue-assessor, 5 cron routes, ai.daily_summary, and all non-cron API routes wrapped. All `console.*` calls in `app/` and `lib/` (excluding tests) are now structured logger calls or auto-captured exceptions. Ready to continue to Group 4 (dashboards & verification)."

---

## Group 4 — Dashboards, Alerts, Verification

Code that ships to the repo: a committed dashboard JSON template plus a verification checklist doc. Axiom dashboard/monitor creation itself is click-ops (one-time setup).

### Task 4.1: Commit Axiom dashboard JSON template

**Files:**
- Create: `ops/axiom-dashboard.json`

- [ ] **Step 1: Write the file**

```json
{
  "name": "Yard Analyzer — Production Health",
  "description": "Day-one dashboard. Filter all charts on env: production.",
  "charts": [
    {
      "name": "Cron health (last 7 days)",
      "kind": "table",
      "apl": "['yard-analyzer'] | where env == 'production' and kind == 'cron.run' | summarize ok = countif(ok == true), failed = countif(ok == false), p50_ms = percentile(durationMs, 50), p95_ms = percentile(durationMs, 95) by route, bin(_time, 1d) | order by _time desc"
    },
    {
      "name": "AI cost — daily totals",
      "kind": "timeseries",
      "apl": "['yard-analyzer'] | where env == 'production' and kind == 'ai.daily_summary' | project _time, costUsd = totals.costUsd, failures = totals.failures | order by _time asc"
    },
    {
      "name": "AI cost — top 10 users (last 7d)",
      "kind": "table",
      "apl": "['yard-analyzer'] | where env == 'production' and kind == 'ai.daily_summary' and _time > ago(7d) | mv-expand topUsers | summarize calls = sum(toint(topUsers.calls)), costUsd = sum(todouble(topUsers.costUsd)) by userId = tostring(topUsers.userId) | order by costUsd desc | take 10"
    },
    {
      "name": "Rate-limit hits by route (last 24h)",
      "kind": "bar",
      "apl": "['yard-analyzer'] | where env == 'production' and kind == 'rate_limit.hit' and _time > ago(24h) | summarize hits = count() by route | order by hits desc"
    },
    {
      "name": "Errors (last 1h)",
      "kind": "table",
      "apl": "['yard-analyzer'] | where env == 'production' and level == 'error' | order by _time desc | take 100"
    }
  ]
}
```

> **Note:** Axiom's dashboard import format may evolve; this file is a *reference* for what to set up in the UI, not necessarily a one-click importable artifact. The APL queries are the load-bearing part — they should work as-is.

- [ ] **Step 2: Commit**

```bash
git add ops/axiom-dashboard.json
git commit -m "Commit reference Axiom dashboard config"
```

### Task 4.2: Write the post-deploy verification checklist

**Files:**
- Create: `ops/axiom-setup.md`

- [ ] **Step 1: Write the file**

```markdown
# Axiom setup & verification (one-time)

## Setup

1. Sign in to Axiom (https://app.axiom.co/), create or open the workspace.
2. Create a dataset named exactly `yard-analyzer`.
3. Settings → API tokens → create an ingest token for the `yard-analyzer` dataset.
4. Save the token as `AXIOM_TOKEN` on Vercel for **Production, Preview, and Development** environments.
5. Add the same token to `.env.local` for local Axiom emission (optional — local dev defaults to console-only).
6. (Optional) Set `AXIOM_DATASET=yard-analyzer` if you want it explicit; the code defaults to that value if unset.

## Dashboard

Recreate the 5 charts from `ops/axiom-dashboard.json` in the Axiom UI:
- Cron health (last 7 days) — table
- AI cost — daily totals — timeseries
- AI cost — top 10 users (last 7d) — table
- Rate-limit hits by route (last 24h) — bar
- Errors (last 1h) — table

All charts filter on `env == 'production'`.

> **Field path note:** if APL queries return no data, the formatter may be nesting fields under `fields.*`. Try `fields.kind == 'cron.run'` instead of `kind == 'cron.run'`. Check the raw event in Axiom's stream view first — whatever path the fields actually live at is the path to use everywhere.

## Alerts (Monitors)

Create two monitors in Axiom UI, both with destination = email `yardanalyzer@gmail.com`.

### Monitor 1: Cron failed

```apl
['yard-analyzer']
| where env == 'production' and kind == 'cron.run' and ok == false
| summarize count() by bin(_time, 15m), route
```

Trigger: any result row in the last 15 minutes.

### Monitor 2: AI failure rate high

```apl
['yard-analyzer']
| where env == 'production' and kind == 'ai.call' and _time > ago(15m)
| summarize total = count(), failures = countif(success == false)
| extend rate = todouble(failures) / todouble(total)
| where total >= 10 and rate > 0.05
```

Trigger: any result row in the last 15 minutes. The `total >= 10` clause prevents false positives at low volume.

## Verification (run after first deploy)

- [ ] Manually trigger a cron route with curl:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/trial-reminders
  ```
  Expect: `200` response, `kind: "cron.run"` event in Axiom within ~5 seconds, tagged `env: "production"`.

- [ ] Hit a rate-limited endpoint in a loop:
  ```bash
  for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/api/auth/register -X POST -H "Content-Type: application/json" -d '{}'; done
  ```
  Expect: first 5 return validation errors (or 429 after limit), one or more `kind: "rate_limit.hit"` events in Axiom.

- [ ] On a preview branch, break the ANTHROPIC_API_KEY:
  ```
  vercel env add ANTHROPIC_API_KEY preview <<< "invalid-key"
  ```
  Hit `/api/analyze`. Expect: `kind: "ai.call"` event with `reason: "failure"`, tagged `env: "preview"`. The "AI failure rate high" monitor should **not** fire (filter is `env == 'production'`).

- [ ] Watch the first 8:00 UTC daily-tasks run after deploy. Confirm:
  - `kind: "cron.run"` event with `ok: true`
  - `kind: "ai.daily_summary"` event for yesterday's date
```

- [ ] **Step 2: Commit**

```bash
git add ops/axiom-setup.md
git commit -m "Add Axiom setup + verification checklist"
```

### Task 4.3: Update session handoff doc

**Files:**
- Modify: `docs/session-handoff.md`

- [ ] **Step 1: Append a short section to the "Latest" block**

Add under "Latest: Scaling audit & refactor (2026-06-18)" a new dated subsection:

```markdown
### Observability layer (2026-06-20)

Wired Axiom for cron success/failure, rate-limit hits, and AI cost outliers. See `docs/superpowers/specs/2026-06-20-observability-axiom-design.md` and `ops/axiom-setup.md`.

- Single `lib/observability/` module: `logger` (free-form), `withAxiom` (route wrapper), `events.emitX(...)` (typed signals).
- All API routes wrapped with `withAxiom` for uncaught-exception capture.
- All `console.*` calls in cron + library code replaced with structured `logger.{info,warn,error}` calls.
- Two day-one email alerts: any cron failure, AI failure rate > 5% over 15 min (min 10-call floor).
- Dashboard config at `ops/axiom-dashboard.json`; setup checklist at `ops/axiom-setup.md`.

**Pending verification:** complete the steps in `ops/axiom-setup.md` after `AXIOM_TOKEN` is set on Vercel.
```

- [ ] **Step 2: Commit**

```bash
git add docs/session-handoff.md
git commit -m "Document observability layer in session handoff"
```

### **CHECKPOINT 4 (FINAL)** — Stop, report to user

Report: "All 4 groups complete. Repo-side work done. Outstanding manual steps (not code):
1. Create Axiom workspace + dataset.
2. Set `AXIOM_TOKEN` on Vercel (Production, Preview, Development).
3. Create the 5 dashboard charts and 2 monitors per `ops/axiom-setup.md`.
4. Run the verification curl commands.

After those are done, observability is live."

---

## Self-Review Notes (filled during plan-writing)

**Spec coverage:** every spec section maps to tasks above:
- Architecture / module layout → Tasks 1.2–1.4, 2.1
- Event taxonomy → Task 2.1 (one emitter per event kind)
- Migration → Tasks 3a.* (rate-limit), 3b.* (AI), 3c.* (crons), 3e.* (API routes)
- Daily summary → Task 3d.1
- Dev/test/prod transport routing → Task 1.4 (test asserts the matrix)
- Dashboards & alerts → Tasks 4.1, 4.2
- Rollout → Group structure mirrors the rollout order (foundation → events → migration → ops)

**Placeholder scan:** no TBDs, no "implement appropriate X" calls, no "similar to N" shortcuts. Two soft pointers: Task 3b.1 references existing test mock setup in `lib/ai/__tests__/usage.test.ts` (engineer is told to read it first) and Task 3c.3/3c.4 say "apply the pattern from 3c.2" — but the pattern is shown in full in 3c.2, so the engineer can copy from there.

**Type consistency:** `CronRoute`, `AiFeature`, `RateLimitContext`, the `emitCronRun/RateLimitHit/AiCall/AiDailySummary` signatures, and the field names (`ipHash`, `userIdHash`, `costUsd`, etc.) are consistent across all tasks.
