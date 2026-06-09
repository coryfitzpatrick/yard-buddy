import { describe, it, expect } from "vitest";
import { buildWateringPrompt } from "@/lib/ai/watering-prompt";

describe("buildWateringPrompt", () => {
  it("includes grass type and zip code", () => {
    const prompt = buildWateringPrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain("bermuda");
    expect(prompt).toContain("30301");
  });

  it("includes yard schedule context when both watering fields are provided", () => {
    const prompt = buildWateringPrompt({
      grassType: "bermuda",
      zipCode: "30301",
      wateringDaysPerWeek: 3,
      wateringMinutesPerSession: 20,
    });
    expect(prompt).toContain("3 day(s) per week");
    expect(prompt).toContain("20 minutes per session");
    expect(prompt).not.toContain("No yard watering schedule");
  });

  it("indicates no schedule when yard defaults are absent", () => {
    const prompt = buildWateringPrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).toContain("No yard watering schedule has been set");
  });

  it("includes optional section fields when present", () => {
    const prompt = buildWateringPrompt({
      grassType: "bermuda",
      zipCode: "30301",
      areaType: "back",
      soilPh: 6.5,
      soilMoisture: "dry",
      weatherSummary: "85°F, sunny",
      notes: "Partial shade",
    });
    expect(prompt).toContain("back");
    expect(prompt).toContain("6.5");
    expect(prompt).toContain("dry");
    expect(prompt).toContain("85°F, sunny");
    expect(prompt).toContain("Partial shade");
  });

  it("omits optional fields when absent", () => {
    const prompt = buildWateringPrompt({ grassType: "bermuda", zipCode: "30301" });
    expect(prompt).not.toContain("Area type:");
    expect(prompt).not.toContain("Soil pH:");
    expect(prompt).not.toContain("Notes:");
  });
});
