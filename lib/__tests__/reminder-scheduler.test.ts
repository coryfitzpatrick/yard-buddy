import { describe, it, expect } from "vitest";
import { getTodayReminders } from "@/lib/cron/reminder-scheduler";

const monday = new Date("2026-06-22T00:00:00Z"); // a Monday
const tuesday = new Date("2026-06-23T00:00:00Z");

describe("getTodayReminders (structured)", () => {
  it("returns empty when no sections", () => {
    expect(getTodayReminders([], monday, 0)).toEqual([]);
  });

  it("returns empty when sections have no schedules", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: [], time: null, minutesPerSession: null },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    expect(getTodayReminders(sections, monday, 0)).toEqual([]);
  });

  it("returns watering reminder when today is in wateringDays", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: ["Mon","Wed","Fri"], time: "07:00", minutesPerSession: 20 },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    expect(getTodayReminders(sections, monday, 0)).toEqual([
      { sectionName: "Front", yardName: "Home", mowing: null, watering: { time: "07:00", minutes: 20 } },
    ]);
  });

  it("returns mowing reminder when today is in mowingDays", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: [], time: null, minutesPerSession: null },
      effectiveMowing: { days: ["Mon"], time: "08:00", heightInches: 3.0 },
    }];
    expect(getTodayReminders(sections, monday, 0)).toEqual([
      { sectionName: "Front", yardName: "Home", mowing: { time: "08:00", inches: 3.0 }, watering: null },
    ]);
  });

  it("returns both watering and mowing reminders for the same section", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: ["Mon"], time: "07:00", minutesPerSession: 15 },
      effectiveMowing: { days: ["Mon"], time: "08:00", heightInches: 3.5 },
    }];
    const result = getTodayReminders(sections, monday, 0);
    expect(result).toHaveLength(1);
    expect(result[0].watering).toEqual({ time: "07:00", minutes: 15 });
    expect(result[0].mowing).toEqual({ time: "08:00", inches: 3.5 });
  });

  it("respects daysBefore offset", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: ["Tue"], time: "07:00", minutesPerSession: 20 },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    // From Monday, daysBefore=1 means we check Tuesday (the upcoming reminder day).
    expect(getTodayReminders(sections, monday, 1).length).toBe(1);
    expect(getTodayReminders(sections, monday, 0).length).toBe(0);
  });

  it("skips watering reminder when time is null even if today is in days", () => {
    const sections = [{
      name: "Front", yardName: "Home",
      effectiveWatering: { days: ["Mon"], time: null, minutesPerSession: 20 },
      effectiveMowing: { days: [], time: null, heightInches: null },
    }];
    expect(getTodayReminders(sections, monday, 0)).toEqual([]);
  });
});
