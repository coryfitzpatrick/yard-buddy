import { describe, it, expect } from "vitest";
import { computeNewWindow } from "../weather-scheduler";

const TODAY = new Date("2026-06-10T00:00:00.000Z");

const MIXED_FORECAST = [
  { date: "2026-06-10", precipChance: 10, high: 78, low: 65, description: "clear" },
  { date: "2026-06-11", precipChance: 15, high: 80, low: 66, description: "partly cloudy" },
  { date: "2026-06-12", precipChance: 90, high: 72, low: 63, description: "thunderstorms" },
  { date: "2026-06-13", precipChance: 80, high: 70, low: 62, description: "showers" },
  { date: "2026-06-14", precipChance: 10, high: 76, low: 64, description: "clear" },
];

const ALL_RAINY = MIXED_FORECAST.map((d) => ({ ...d, precipChance: 75 }));
const ALL_DRY = MIXED_FORECAST.map((d) => ({ ...d, precipChance: 5 }));

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

describe("computeNewWindow", () => {
  describe("dry_day", () => {
    it("returns today when today is dry (<20%)", () => {
      const result = computeNewWindow("dry_day", MIXED_FORECAST, 3, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-10");
      expect(dateStr(result!.scheduledEnd)).toBe("2026-06-12");
    });

    it("skips rainy days to find first dry day", () => {
      const forecast = [
        { ...MIXED_FORECAST[0], precipChance: 80 },
        { ...MIXED_FORECAST[1], precipChance: 10 },
        ...MIXED_FORECAST.slice(2),
      ];
      const result = computeNewWindow("dry_day", forecast, 2, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-11");
      expect(dateStr(result!.scheduledEnd)).toBe("2026-06-12");
    });

    it("returns null when all days are rainy", () => {
      expect(computeNewWindow("dry_day", ALL_RAINY, 3, TODAY)).toBeNull();
    });
  });

  describe("no_rain_48h", () => {
    it("returns first 2-day dry stretch", () => {
      const result = computeNewWindow("no_rain_48h", MIXED_FORECAST, 5, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-10");
    });

    it("finds stretch starting mid-forecast", () => {
      const forecast = [
        { ...MIXED_FORECAST[0], precipChance: 80 },
        { ...MIXED_FORECAST[1], precipChance: 10 },
        { ...MIXED_FORECAST[2], precipChance: 10 },
        ...MIXED_FORECAST.slice(3),
      ];
      const result = computeNewWindow("no_rain_48h", forecast, 3, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-11");
    });

    it("returns null when no 2-day dry stretch exists", () => {
      expect(computeNewWindow("no_rain_48h", ALL_RAINY, 5, TODAY)).toBeNull();
    });
  });

  describe("soil_moist", () => {
    it("returns day after first rainy day", () => {
      // First rainy day in MIXED_FORECAST is Jun 12 (90%), so start = Jun 13
      const result = computeNewWindow("soil_moist", MIXED_FORECAST, 2, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-13");
      expect(dateStr(result!.scheduledEnd)).toBe("2026-06-14");
    });

    it("returns null when no rainy day exists", () => {
      expect(computeNewWindow("soil_moist", ALL_DRY, 3, TODAY)).toBeNull();
    });
  });

  describe("any", () => {
    it("always returns null (caller handles)", () => {
      expect(computeNewWindow("any", MIXED_FORECAST, 5, TODAY)).toBeNull();
    });
  });
});
