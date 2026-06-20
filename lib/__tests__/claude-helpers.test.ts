import { describe, it, expect } from "vitest";
import type { LawnContext } from "@/lib/claude";

const {
  detectDataGaps,
  buildDataGapWarning,
  buildContextWarnings,
} = await import("@/lib/claude");

function ctx(over: Partial<LawnContext>): LawnContext {
  return {
    grassType: "tall_fescue",
    zipCode: "90210",
    soilPh: 6.5,
    notes: "Healthy lawn, no issues to report.",
    currentRoutine: "Mowing weekly at 3.5 inches, water deeply twice a week.",
    yardSizeSqft: 5000,
    nitrogenPpm: 25,
    phosphorusPpm: 35,
    potassiumPpm: 120,
    ...over,
  };
}

describe("detectDataGaps", () => {
  it("returns an empty list when all critical fields are populated", () => {
    expect(detectDataGaps(ctx({}))).toEqual([]);
  });

  it("flags soilPh when missing", () => {
    const gaps = detectDataGaps(ctx({ soilPh: null }));
    expect(gaps).toContain("soilPh");
  });

  it("flags grassType when unknown", () => {
    expect(detectDataGaps(ctx({ grassType: "unknown" as LawnContext["grassType"] }))).toContain(
      "grassType",
    );
  });

  it("flags grassType when empty string", () => {
    expect(detectDataGaps(ctx({ grassType: "" as LawnContext["grassType"] }))).toContain(
      "grassType",
    );
  });

  it("flags notes when shorter than 8 characters", () => {
    expect(detectDataGaps(ctx({ notes: "ok" }))).toContain("notes");
  });

  it("flags notes when null", () => {
    expect(detectDataGaps(ctx({ notes: null }))).toContain("notes");
  });

  it("flags yardSizeSqft when null or non-positive", () => {
    expect(detectDataGaps(ctx({ yardSizeSqft: null }))).toContain("yardSizeSqft");
    expect(detectDataGaps(ctx({ yardSizeSqft: 0 }))).toContain("yardSizeSqft");
  });

  it("flags soilTest only when ALL of pH and N-P-K are missing", () => {
    // pH only is enough to NOT flag soilTest
    const gapsWithPhOnly = detectDataGaps(
      ctx({ nitrogenPpm: null, phosphorusPpm: null, potassiumPpm: null }),
    );
    expect(gapsWithPhOnly).not.toContain("soilTest");

    // No pH and no N-P-K -> flagged
    const gapsAllMissing = detectDataGaps(
      ctx({ soilPh: null, nitrogenPpm: null, phosphorusPpm: null, potassiumPpm: null }),
    );
    expect(gapsAllMissing).toContain("soilTest");
  });

  it("only flags currentRoutine when 2+ other critical gaps already exist", () => {
    // Single gap (soilPh) + missing routine -> routine NOT flagged
    const oneGap = detectDataGaps(ctx({ soilPh: null, currentRoutine: null }));
    expect(oneGap).toContain("soilPh");
    expect(oneGap).not.toContain("currentRoutine");

    // Two gaps + missing routine -> routine flagged
    const twoGaps = detectDataGaps(
      ctx({ soilPh: null, notes: null, currentRoutine: null }),
    );
    expect(twoGaps).toContain("currentRoutine");
  });
});

describe("buildDataGapWarning", () => {
  it("returns null when there are no gaps", () => {
    expect(buildDataGapWarning([])).toBeNull();
  });

  it("returns the single field sentence verbatim for one gap", () => {
    const warning = buildDataGapWarning(["soilPh"]);
    expect(warning).toContain("Soil pH");
    expect(warning?.toLowerCase()).toContain("soil test");
  });

  it("joins individual sentences for 2-3 gaps", () => {
    const warning = buildDataGapWarning(["soilPh", "grassType"]);
    expect(warning).toContain("Soil pH");
    expect(warning).toContain("Grass type");
    // Each sentence should appear, joined by spaces (not a generic summary)
    expect(warning).not.toMatch(/Missing fields:/);
  });

  it("falls back to a generic summary listing fields when 4+ gaps", () => {
    const warning = buildDataGapWarning([
      "soilPh",
      "grassType",
      "notes",
      "yardSizeSqft",
    ]);
    expect(warning).toMatch(/Missing fields:/);
    expect(warning).toContain("soilPh");
    expect(warning).toContain("grassType");
  });
});

describe("buildContextWarnings", () => {
  it("returns an empty string when no weather data and benign context", () => {
    expect(buildContextWarnings(ctx({ weatherData: undefined }))).toBe("");
  });

  it("emits a warm-season dormancy warning when warm grass < 50F", () => {
    const out = buildContextWarnings(
      ctx({
        grassType: "bermuda",
        weatherData: {
          temp: 42,
          humidity: 70,
          condition: "Clear",
          recentRainfall: 0,
          forecast: [],
        },
      }),
    );
    expect(out).toContain("DORMANCY CONSTRAINT");
    expect(out).not.toContain("HEAT STRESS");
  });

  it("emits a cool-season heat-stress warning when cool grass > 85F", () => {
    const out = buildContextWarnings(
      ctx({
        grassType: "tall_fescue",
        weatherData: {
          temp: 92,
          humidity: 70,
          condition: "Hot",
          recentRainfall: 1,
          forecast: [],
        },
      }),
    );
    expect(out).toContain("HEAT STRESS CONSTRAINT");
    expect(out).not.toContain("DORMANCY CONSTRAINT");
  });

  it("emits a St. Augustine mowing constraint when temp >= 80F", () => {
    const out = buildContextWarnings(
      ctx({
        grassType: "st_augustine",
        weatherData: {
          temp: 85,
          humidity: 70,
          condition: "Sunny",
          recentRainfall: 0.5,
          forecast: [],
        },
      }),
    );
    expect(out).toContain("ST. AUGUSTINE MOWING CONSTRAINT");
  });

  it("emits a drought-stress warning when dry soil + no rain + heat", () => {
    const out = buildContextWarnings(
      ctx({
        soilMoisture: "dry",
        weatherData: {
          temp: 90,
          humidity: 30,
          condition: "Sunny",
          recentRainfall: 0,
          forecast: [],
        },
      }),
    );
    expect(out).toContain("DROUGHT STRESS CONSTRAINT");
  });

  it("emits the dry-conditions fungicide warning only when not also in drought stress", () => {
    // Dry + no rain + low humidity, but soil is moist -> drought stress is false
    const dryOnly = buildContextWarnings(
      ctx({
        soilMoisture: "moist",
        weatherData: {
          temp: 70,
          humidity: 40,
          condition: "Clear",
          recentRainfall: 0,
          forecast: [],
        },
      }),
    );
    expect(dryOnly).toContain("DRY CONDITIONS FUNGICIDE CONSTRAINT");

    // Add drought conditions (dry soil + heat) -> drought warning fires, dry-only is suppressed
    const droughtAlso = buildContextWarnings(
      ctx({
        soilMoisture: "dry",
        weatherData: {
          temp: 90,
          humidity: 40,
          condition: "Sunny",
          recentRainfall: 0,
          forecast: [],
        },
      }),
    );
    expect(droughtAlso).toContain("DROUGHT STRESS CONSTRAINT");
    expect(droughtAlso).not.toContain("DRY CONDITIONS FUNGICIDE CONSTRAINT");
  });

  it("emits the new-seed constraint when notes mention seeding or germination", () => {
    expect(
      buildContextWarnings(ctx({ notes: "Just overseeded the front yard last weekend" })),
    ).toContain("NEW SEED CONSTRAINT");
    expect(
      buildContextWarnings(ctx({ notes: "Seedlings just started germinating" })),
    ).toContain("NEW SEED CONSTRAINT");
  });
});
