import { describe, it, expect } from "vitest";
import {
  shouldPushBestDay,
  shouldPushWeatherWarning,
  shouldPushPreEmergent,
  shouldPushGrub,
  shouldPushOverseed,
  shouldPushWateringReminder,
  shouldPushMowingReminder,
  shouldPushWateringWeatherWarning,
  shouldPushMowingWeatherWarning,
} from "@/lib/push/triggers";

describe("shouldPushBestDay", () => {
  it("returns true when task bestDay is today", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushBestDay({ bestDay: new Date("2026-06-20T12:00:00Z") }, today)).toBe(true);
  });
  it("returns false when bestDay is in the future", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushBestDay({ bestDay: new Date("2026-06-21T00:00:00Z") }, today)).toBe(false);
  });
  it("returns false when bestDay is null", () => {
    expect(shouldPushBestDay({ bestDay: null }, new Date())).toBe(false);
  });
});

describe("shouldPushWeatherWarning", () => {
  it("returns true when a scheduled task tomorrow has a weather concern", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushWeatherWarning(
      { scheduledStart: new Date("2026-06-21T00:00:00Z"), weatherCondition: "no_rain_48h" },
      today,
    )).toBe(true);
  });
  it("returns false when no weather concern", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushWeatherWarning(
      { scheduledStart: new Date("2026-06-21T00:00:00Z"), weatherCondition: null },
      today,
    )).toBe(false);
  });
  it("returns false when weatherCondition is 'any' (the no-sensitivity sentinel)", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushWeatherWarning(
      { scheduledStart: new Date("2026-06-21T00:00:00Z"), weatherCondition: "any" },
      today,
    )).toBe(false);
  });
});

describe("shouldPushPreEmergent / Grub / Overseed", () => {
  it("only fires on first-true transition (today true, yesterday false)", () => {
    expect(shouldPushPreEmergent(true, false)).toBe(true);
    expect(shouldPushPreEmergent(true, true)).toBe(false);  // already in window
    expect(shouldPushPreEmergent(false, true)).toBe(false); // window closed
    expect(shouldPushPreEmergent(false, false)).toBe(false);
  });
  it("same for grub", () => {
    expect(shouldPushGrub(true, false)).toBe(true);
    expect(shouldPushGrub(true, true)).toBe(false);
  });
  it("same for overseed", () => {
    expect(shouldPushOverseed(true, false)).toBe(true);
    expect(shouldPushOverseed(true, true)).toBe(false);
  });
});

describe("shouldPushWateringReminder", () => {
  it("returns true when today is scheduled and time is set", () => {
    expect(shouldPushWateringReminder({ effective: { days: ["Mon"], time: "07:00" }, todayIsScheduled: true })).toBe(true);
  });
  it("returns false when today is not a scheduled day", () => {
    expect(shouldPushWateringReminder({ effective: { days: ["Mon"], time: "07:00" }, todayIsScheduled: false })).toBe(false);
  });
  it("returns false when days array is empty", () => {
    expect(shouldPushWateringReminder({ effective: { days: [], time: "07:00" }, todayIsScheduled: true })).toBe(false);
  });
  it("returns false when time is null", () => {
    expect(shouldPushWateringReminder({ effective: { days: ["Mon"], time: null }, todayIsScheduled: true })).toBe(false);
  });
});

describe("shouldPushMowingReminder", () => {
  it("true on a scheduled day with time", () => {
    expect(shouldPushMowingReminder({ effective: { days: ["Sat"], time: "08:00" }, todayIsScheduled: true })).toBe(true);
  });
  it("false when not scheduled today", () => {
    expect(shouldPushMowingReminder({ effective: { days: ["Sat"], time: "08:00" }, todayIsScheduled: false })).toBe(false);
  });
});

describe("shouldPushWateringWeatherWarning", () => {
  it("triggers on rain chance >= 50%", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.7, rainfallInches: 0 } })).toBe(true);
  });
  it("triggers on rainfall >= 0.25 inches", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.1, rainfallInches: 0.3 } })).toBe(true);
  });
  it("does not trigger on light rain forecast below thresholds", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.2, rainfallInches: 0.1 } })).toBe(false);
  });
  it("does not trigger when not a scheduled day", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: false, todayForecast: { chanceOfRain: 0.9, rainfallInches: 1.0 } })).toBe(false);
  });
  it("does not trigger when forecast is null", () => {
    expect(shouldPushWateringWeatherWarning({ todayIsScheduled: true, todayForecast: null })).toBe(false);
  });
});

describe("shouldPushMowingWeatherWarning", () => {
  it("triggers on rainfall >= 0.10 inches (tighter than watering)", () => {
    expect(shouldPushMowingWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.1, rainfallInches: 0.15 } })).toBe(true);
  });
  it("does not trigger on rainfall below 0.10 inches", () => {
    expect(shouldPushMowingWeatherWarning({ todayIsScheduled: true, todayForecast: { chanceOfRain: 0.1, rainfallInches: 0.05 } })).toBe(false);
  });
});
