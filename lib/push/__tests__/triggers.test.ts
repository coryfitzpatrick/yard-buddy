import { describe, it, expect } from "vitest";
import {
  shouldPushBestDay,
  shouldPushWeatherWarning,
  shouldPushPreEmergent,
  shouldPushGrub,
  shouldPushOverseed,
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
