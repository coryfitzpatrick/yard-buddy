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
