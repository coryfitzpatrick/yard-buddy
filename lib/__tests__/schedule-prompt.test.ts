import { describe, it, expect } from "vitest";
import { buildSchedulePrompt } from "@/lib/ai/schedule-prompt";

describe("buildSchedulePrompt", () => {
  it("includes grass type and zip on a minimal prompt", () => {
    const prompt = buildSchedulePrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain("Grass type: bermuda");
    expect(prompt).toContain("ZIP code: 30301");
  });

  it("renames underscored grass keys", () => {
    const prompt = buildSchedulePrompt({ grassType: "tall_fescue", zipCode: "30301" });
    expect(prompt).toContain("Grass type: tall fescue");
  });

  it("includes effective watering when both watering fields are set", () => {
    const prompt = buildSchedulePrompt({
      grassType: "kentucky_bluegrass",
      zipCode: "80202",
      wateringDaysPerWeek: 3,
      wateringMinutesPerSession: 20,
    });
    expect(prompt).toContain("Current watering: 3 day(s) per week, 20 minutes per session");
  });

  it("includes effective mowing when both mowing fields are set", () => {
    const prompt = buildSchedulePrompt({
      grassType: "tall_fescue",
      zipCode: "27513",
      mowingDaysPerWeek: 1,
      mowingHeightInches: 3.5,
    });
    expect(prompt).toContain("Current mowing: 1 time(s) per week at 3.5 inches");
  });

  it("falls back to from-scratch language when watering schedule is unset", () => {
    const prompt = buildSchedulePrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toMatch(/recommend a watering schedule from scratch/i);
  });

  it("declares the strict JSON response shape", () => {
    const prompt = buildSchedulePrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain('"watering"');
    expect(prompt).toContain('"mowing"');
    expect(prompt).toContain('"deviates"');
    expect(prompt).toContain('"suggestedDaysPerWeek"');
    expect(prompt).toContain('"suggestedMinutesPerSession"');
    expect(prompt).toContain('"suggestedHeightInches"');
  });
});
