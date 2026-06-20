import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();
const mockUsageCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

vi.mock("@/lib/db", () => ({
  db: { aiUsageEvent: { create: mockUsageCreate } },
}));

const events = await import("@/lib/observability/events");
const { logger } = await import("@/lib/observability/logger");
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
    expect(mockUsageCreate.mock.calls[0][0].data.errorCode).toBe("rate_limit_error");
  });
});

describe("recordUsage robustness", () => {
  it("does not bubble DB errors to the caller and logs structured fields", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    mockCreate.mockResolvedValueOnce({
      id: "msg_1",
      model: "claude-sonnet-4-6",
      content: [],
      usage: {},
    });
    mockUsageCreate.mockRejectedValueOnce(new Error("DB exploded"));
    await expect(
      callClaude({ model: "claude-sonnet-4-6", max_tokens: 1, messages: [] }, {
        userId: "user_1",
        feature: "analyze",
      }),
    ).resolves.toBeDefined();
    // Failure to write the AiUsageEvent row must not throw, and must log
    // with structured fields so the failure is debuggable in Axiom.
    expect(errorSpy).toHaveBeenCalledWith(
      "recordUsage: failed to write AiUsageEvent",
      expect.objectContaining({
        feature: expect.any(String),
        model: expect.any(String),
        err: expect.any(String),
      }),
    );
    errorSpy.mockRestore();
  });
});

describe("callClaude emits ai.call on failure", () => {
  it("emits with reason=failure when the SDK throws", async () => {
    const emitSpy = vi.spyOn(events, "emitAiCall").mockImplementation(() => {});
    const err = Object.assign(new Error("boom"), {
      status: 503,
      error: { type: "overloaded_error" },
    });
    mockCreate.mockRejectedValueOnce(err);
    await expect(
      callClaude({ model: "claude-sonnet-4-6", max_tokens: 10, messages: [] }, {
        userId: "u1",
        feature: "analyze",
      }),
    ).rejects.toBeDefined();
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "failure",
        success: false,
        userId: "u1",
        feature: "analyze",
        model: "claude-sonnet-4-6",
        errorCode: "overloaded_error",
      }),
    );
  });
});
