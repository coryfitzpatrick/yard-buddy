import { describe, it, expect } from "vitest";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";

const section = (over: Partial<{ wDays: number; wMin: number; mDays: number; mH: number }>) => ({
  wateringDaysPerWeek: over.wDays ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDaysPerWeek: over.mDays ?? null,
  mowingHeightInches: over.mH ?? null,
});

const yard = (over: Partial<{ wDays: number; wMin: number; mDays: number; mH: number }>) => ({
  wateringDaysPerWeek: over.wDays ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDaysPerWeek: over.mDays ?? null,
  mowingHeightInches: over.mH ?? null,
});

describe("effectiveWatering", () => {
  it("prefers section override when plan allows", () => {
    const result = effectiveWatering(section({ wDays: 3, wMin: 15 }), yard({ wDays: 5, wMin: 30 }), "home_plus");
    expect(result).toEqual({ daysPerWeek: 3, minutesPerSession: 15 });
  });
  it("falls back to yard when section override is null", () => {
    const result = effectiveWatering(section({}), yard({ wDays: 5, wMin: 30 }), "home_plus");
    expect(result).toEqual({ daysPerWeek: 5, minutesPerSession: 30 });
  });
  it("ignores section override on home_basic plan", () => {
    const result = effectiveWatering(section({ wDays: 3, wMin: 15 }), yard({ wDays: 5, wMin: 30 }), "home_basic");
    expect(result).toEqual({ daysPerWeek: 5, minutesPerSession: 30 });
  });
  it("returns nulls when nothing is set", () => {
    const result = effectiveWatering(section({}), yard({}), "home_plus");
    expect(result).toEqual({ daysPerWeek: null, minutesPerSession: null });
  });
  it("falls back to yard for each unset section field independently", () => {
    const result = effectiveWatering(
      section({ wDays: 3 }), // wMin omitted
      yard({ wDays: 5, wMin: 30 }),
      "home_plus",
    );
    expect(result).toEqual({ daysPerWeek: 3, minutesPerSession: 30 });
  });
});

describe("effectiveMowing", () => {
  it("prefers section override when plan allows", () => {
    const result = effectiveMowing(section({ mDays: 1, mH: 3.0 }), yard({ mDays: 2, mH: 2.5 }), "professional");
    expect(result).toEqual({ daysPerWeek: 1, heightInches: 3.0 });
  });
  it("falls back to yard when section is null", () => {
    const result = effectiveMowing(section({}), yard({ mDays: 2, mH: 2.5 }), "home_plus");
    expect(result).toEqual({ daysPerWeek: 2, heightInches: 2.5 });
  });
  it("ignores section override on home_basic", () => {
    const result = effectiveMowing(section({ mDays: 1, mH: 3.0 }), yard({ mDays: 2, mH: 2.5 }), "home_basic");
    expect(result).toEqual({ daysPerWeek: 2, heightInches: 2.5 });
  });
});
