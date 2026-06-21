import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateScheduleRecommendation } from "@/lib/claude";

vi.mock("@/lib/ai/usage", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/usage")>();
  return {
    ...actual,
    callClaude: vi.fn(),
  };
});

import { callClaude } from "@/lib/ai/usage";

const claudeReturning = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("generateScheduleRecommendation", () => {
  const opts = { grassType: "bermuda", zipCode: "30301" } as const;
  const ctx = { userId: "u_1", route: "/api/analyze", feature: "watering" } as const;

  it("parses a valid full JSON response", async () => {
    vi.mocked(callClaude).mockResolvedValue(claudeReturning(JSON.stringify({
      watering: { schedule: "3x/wk works", deviates: false, suggestedDaysPerWeek: 3, suggestedMinutesPerSession: 20 },
      mowing: { schedule: "Keep at 3 inches", deviates: false, suggestedDaysPerWeek: 1, suggestedHeightInches: 3.0 },
    })) as never);
    const result = await generateScheduleRecommendation(opts, ctx);
    expect(result).toEqual({
      watering: { schedule: "3x/wk works", deviates: false, suggestedDaysPerWeek: 3, suggestedMinutesPerSession: 20 },
      mowing: { schedule: "Keep at 3 inches", deviates: false, suggestedDaysPerWeek: 1, suggestedHeightInches: 3.0 },
    });
  });

  it("rounds non-integer suggested integers", async () => {
    vi.mocked(callClaude).mockResolvedValue(claudeReturning(JSON.stringify({
      watering: { schedule: "x", deviates: true, suggestedDaysPerWeek: 3.6, suggestedMinutesPerSession: 19.4 },
      mowing: { schedule: "y", deviates: true, suggestedDaysPerWeek: 1.5, suggestedHeightInches: 3.25 },
    })) as never);
    const result = await generateScheduleRecommendation(opts, ctx);
    expect(result.watering.suggestedDaysPerWeek).toBe(4);
    expect(result.watering.suggestedMinutesPerSession).toBe(19);
    expect(result.mowing.suggestedDaysPerWeek).toBe(2);
    expect(result.mowing.suggestedHeightInches).toBe(3.25);
  });

  it("treats deviates=non-boolean as false (strict equality)", async () => {
    vi.mocked(callClaude).mockResolvedValue(claudeReturning(JSON.stringify({
      watering: { schedule: "x", deviates: "true", suggestedDaysPerWeek: 3, suggestedMinutesPerSession: 20 },
      mowing: { schedule: "y", deviates: 1, suggestedDaysPerWeek: 1, suggestedHeightInches: 3.0 },
    })) as never);
    const result = await generateScheduleRecommendation(opts, ctx);
    expect(result.watering.deviates).toBe(false);
    expect(result.mowing.deviates).toBe(false);
  });

  it("returns safe defaults when watering or mowing sub-object is missing", async () => {
    vi.mocked(callClaude).mockResolvedValue(claudeReturning(JSON.stringify({})) as never);
    const result = await generateScheduleRecommendation(opts, ctx);
    expect(result).toEqual({
      watering: { schedule: "", deviates: false, suggestedDaysPerWeek: null, suggestedMinutesPerSession: null },
      mowing: { schedule: "", deviates: false, suggestedDaysPerWeek: null, suggestedHeightInches: null },
    });
  });

  it("returns safe defaults for missing nested fields", async () => {
    vi.mocked(callClaude).mockResolvedValue(claudeReturning(JSON.stringify({
      watering: { schedule: "ok" },
      mowing: {},
    })) as never);
    const result = await generateScheduleRecommendation(opts, ctx);
    expect(result.watering).toEqual({ schedule: "ok", deviates: false, suggestedDaysPerWeek: null, suggestedMinutesPerSession: null });
    expect(result.mowing).toEqual({ schedule: "", deviates: false, suggestedDaysPerWeek: null, suggestedHeightInches: null });
  });

  it("throws when Claude returns non-JSON", async () => {
    vi.mocked(callClaude).mockResolvedValue(claudeReturning("not json at all") as never);
    await expect(generateScheduleRecommendation(opts, ctx)).rejects.toThrow(/non-JSON/);
  });

  it("returns safe defaults when content array is empty", async () => {
    vi.mocked(callClaude).mockResolvedValue({ content: [] } as never);
    // empty content → text = "" → JSON.parse("") throws → wrapper rethrows
    await expect(generateScheduleRecommendation(opts, ctx)).rejects.toThrow(/non-JSON/);
  });
});
