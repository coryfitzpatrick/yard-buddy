import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import * as events from "@/lib/observability/events";
import type { RateLimitedRoute } from "@/lib/observability/events";

// Two-layer mock setup for the "emits rate_limit.hit" tests below:
//  1. vi.mock("@axiomhq/nextjs") — the observability barrel transitively
//     imports the Axiom logger module at import time; this stub keeps that
//     graph from pulling Next-only runtime types under Vitest's ESM resolver.
//  2. vi.spyOn(events, "emitRateLimitHit") inside the test — short-circuits
//     the actual emit so we assert on call shape without any IO.
vi.mock("@axiomhq/nextjs", () => ({
  createAxiomRouteHandler: <T,>(_logger: unknown, _opts?: unknown) => (handler: T) => handler,
  nextJsFormatters: [],
}));

function makeReq(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

describe("getClientIp", () => {
  it("returns 'unknown' when x-forwarded-for is missing", () => {
    expect(getClientIp(makeReq({}))).toBe("unknown");
  });

  it("returns the only value when x-forwarded-for has a single entry", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("returns the left-most (originating) value from a comma-separated chain", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" })),
    ).toBe("203.0.113.5");
  });

  it("trims surrounding whitespace from the parsed value", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "   203.0.113.5   , 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
  });

  it("returns 'unknown' for an empty x-forwarded-for header", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});

describe("checkRateLimit emits rate_limit.hit on limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits when the in-memory fallback returns limited", async () => {
    const spy = vi.spyOn(events, "emitRateLimitHit").mockImplementation(() => {});
    const key = `test:${Math.random()}`;
    // Synthetic route used only by this test — cast to the union rather than
    // widening RateLimitedRoute to accommodate test-only values.
    const ctx = {
      route: "/api/test" as RateLimitedRoute,
      ip: "203.0.113.9",
      userId: "user_x",
    };

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
