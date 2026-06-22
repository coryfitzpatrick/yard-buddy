import { describe, it, expect } from "vitest";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";

const section = (over: Partial<{ wDays: string[]; wTime: string; wMin: number; mDays: string[]; mTime: string; mH: number }>) => ({
  wateringDays: over.wDays ?? [],
  wateringTime: over.wTime ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDays: over.mDays ?? [],
  mowingTime: over.mTime ?? null,
  mowingHeightInches: over.mH ?? null,
});

const yard = (over: Partial<{ wDays: string[]; wTime: string; wMin: number; mDays: string[]; mTime: string; mH: number }>) => ({
  wateringDays: over.wDays ?? [],
  wateringTime: over.wTime ?? null,
  wateringMinutesPerSession: over.wMin ?? null,
  mowingDays: over.mDays ?? [],
  mowingTime: over.mTime ?? null,
  mowingHeightInches: over.mH ?? null,
});

describe("effectiveWatering", () => {
  it("prefers section days when plan allows and section has any", () => {
    const result = effectiveWatering(
      section({ wDays: ["Mon","Wed","Fri"], wTime: "07:00", wMin: 15 }),
      yard({ wDays: ["Tue","Thu","Sat"], wTime: "06:00", wMin: 30 }),
      "home_plus",
    );
    expect(result).toEqual({ days: ["Mon","Wed","Fri"], time: "07:00", minutesPerSession: 15 });
  });

  it("falls back to yard when section days is empty", () => {
    const result = effectiveWatering(
      section({}),
      yard({ wDays: ["Tue","Thu"], wTime: "06:00", wMin: 30 }),
      "home_plus",
    );
    expect(result).toEqual({ days: ["Tue","Thu"], time: "06:00", minutesPerSession: 30 });
  });

  it("ignores section override on home_basic plan", () => {
    const result = effectiveWatering(
      section({ wDays: ["Mon"], wTime: "10:00", wMin: 5 }),
      yard({ wDays: ["Tue","Thu"], wTime: "06:00", wMin: 30 }),
      "home_basic",
    );
    expect(result).toEqual({ days: ["Tue","Thu"], time: "06:00", minutesPerSession: 30 });
  });

  it("returns empty days and nulls when nothing is set", () => {
    const result = effectiveWatering(section({}), yard({}), "home_plus");
    expect(result).toEqual({ days: [], time: null, minutesPerSession: null });
  });

  it("falls back per-field independently (section days present, but minutes null)", () => {
    const result = effectiveWatering(
      section({ wDays: ["Mon"] }),
      yard({ wDays: ["Tue"], wTime: "06:00", wMin: 30 }),
      "home_plus",
    );
    expect(result).toEqual({ days: ["Mon"], time: "06:00", minutesPerSession: 30 });
  });

  it("uses yard for null plan (no override capability)", () => {
    const result = effectiveWatering(
      section({ wDays: ["Mon"], wTime: "10:00", wMin: 5 }),
      yard({ wDays: ["Tue"], wTime: "06:00", wMin: 30 }),
      null,
    );
    expect(result).toEqual({ days: ["Tue"], time: "06:00", minutesPerSession: 30 });
  });
});

describe("effectiveMowing", () => {
  it("prefers section override when plan allows", () => {
    const result = effectiveMowing(
      section({ mDays: ["Sat"], mTime: "08:00", mH: 3.0 }),
      yard({ mDays: ["Sun"], mTime: "09:00", mH: 2.5 }),
      "professional",
    );
    expect(result).toEqual({ days: ["Sat"], time: "08:00", heightInches: 3.0 });
  });

  it("falls back to yard when section days is empty", () => {
    const result = effectiveMowing(
      section({}),
      yard({ mDays: ["Sun"], mTime: "09:00", mH: 2.5 }),
      "home_plus",
    );
    expect(result).toEqual({ days: ["Sun"], time: "09:00", heightInches: 2.5 });
  });

  it("ignores section override on home_basic", () => {
    const result = effectiveMowing(
      section({ mDays: ["Sat"], mTime: "08:00", mH: 3.0 }),
      yard({ mDays: ["Sun"], mTime: "09:00", mH: 2.5 }),
      "home_basic",
    );
    expect(result).toEqual({ days: ["Sun"], time: "09:00", heightInches: 2.5 });
  });

  it("returns empty days and nulls when nothing is set", () => {
    const result = effectiveMowing(section({}), yard({}), "home_plus");
    expect(result).toEqual({ days: [], time: null, heightInches: null });
  });
});
