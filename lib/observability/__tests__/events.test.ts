// lib/observability/__tests__/events.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @axiomhq/nextjs: its ESM build does `import * as next from "next/server"`
// (no .js extension), which Node's strict ESM resolver rejects under Vitest.
// logger.ts (transitively imported via events.ts) pulls in this module, so we
// stub the bits it consumes (createAxiomRouteHandler + nextJsFormatters).
vi.mock("@axiomhq/nextjs", () => ({
  createAxiomRouteHandler: () => (handler: unknown) => handler,
  nextJsFormatters: [],
}));

import { logger } from "@/lib/observability/logger";
import {
  emitCronRun,
  emitRateLimitHit,
  emitAiCall,
  emitAiDailySummary,
  isExpensiveCall,
} from "@/lib/observability/events";
import type { RateLimitedRoute } from "@/lib/observability/events";

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
  it("falls back to default when AI_EVENT_COST_THRESHOLD_USD is empty string", () => {
    process.env.AI_EVENT_COST_THRESHOLD_USD = "";
    expect(isExpensiveCall({ costUsd: 0.001, inputTokens: 100 })).toBe(false);
    delete process.env.AI_EVENT_COST_THRESHOLD_USD;
  });
  it("falls back to default when AI_EVENT_COST_THRESHOLD_USD is non-numeric", () => {
    process.env.AI_EVENT_COST_THRESHOLD_USD = "abc";
    expect(isExpensiveCall({ costUsd: 0.001, inputTokens: 100 })).toBe(false);
    delete process.env.AI_EVENT_COST_THRESHOLD_USD;
  });
  it("falls back to default when AI_EVENT_COST_THRESHOLD_USD is zero or negative", () => {
    process.env.AI_EVENT_COST_THRESHOLD_USD = "-1";
    expect(isExpensiveCall({ costUsd: 0.001, inputTokens: 100 })).toBe(false);
    process.env.AI_EVENT_COST_THRESHOLD_USD = "0";
    expect(isExpensiveCall({ costUsd: 0.001, inputTokens: 100 })).toBe(false);
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
  const cases: Array<[string, () => void, "info" | "warn" | "error"]> = [
    [
      "cron.run",
      () => emitCronRun({ route: "trial-reminders", ok: true, durationMs: 1, counts: {} }),
      "info",
    ],
    [
      "rate_limit.hit",
      () =>
        emitRateLimitHit({
          // Synthetic route for the common-fields matrix test; cast rather than
          // widening RateLimitedRoute for a test-only value.
          route: "/api/x" as RateLimitedRoute,
          ip: "1.2.3.4",
          userId: null,
          maxAttempts: 1,
          windowMs: 1000,
        }),
      "warn",
    ],
    [
      "ai.call",
      () =>
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
          reason: "failure",
        }),
      "error",
    ],
    [
      "ai.daily_summary",
      () =>
        emitAiDailySummary({
          date: "2026-06-19",
          totals: { calls: 0, failures: 0, costUsd: 0 },
          byFeature: {},
          topUsers: [],
        }),
      "info",
    ],
  ];

  it.each(cases)("includes env, service, version on %s", (kind, emit, level) => {
    const spy = vi.spyOn(logger, level).mockImplementation(() => {});
    emit();
    expect(spy).toHaveBeenCalledWith(
      kind,
      expect.objectContaining({
        env: expect.any(String),
        service: "yard-analyzer",
        version: expect.any(String),
      }),
    );
  });
});
