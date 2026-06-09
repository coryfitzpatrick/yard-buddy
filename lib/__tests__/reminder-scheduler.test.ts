import { describe, it, expect } from "vitest";
import { getTodayReminders } from "../cron/reminder-scheduler";

const MON = new Date("2026-06-08T00:00:00Z"); // Monday
const TUE = new Date("2026-06-09T00:00:00Z"); // Tuesday
const WED = new Date("2026-06-10T00:00:00Z"); // Wednesday

const mowMon = JSON.stringify({ days: ["Mon"], time: "10:00", inches: "3.5" });
const waterMonWedFri = JSON.stringify({ days: ["Mon", "Wed", "Fri"], time: "07:00", inches: "20" });

describe("getTodayReminders", () => {
  it("returns empty array when no sections match today", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: null }];
    expect(getTodayReminders(sections, TUE, 0)).toEqual([]);
  });

  it("returns mowing reminder when day matches", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: null }];
    const result = getTodayReminders(sections, MON, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sectionName: "Front",
      yardName: "Home",
      mowing: { time: "10:00", inches: "3.5" },
      watering: null,
    });
  });

  it("returns watering reminder when day matches", () => {
    const sections = [{ name: "Back", yardName: "Home", mowingSchedule: null, wateringSchedule: waterMonWedFri }];
    const result = getTodayReminders(sections, WED, 0);
    expect(result).toHaveLength(1);
    expect(result[0].watering).toMatchObject({ time: "07:00", minutes: "20" });
    expect(result[0].mowing).toBeNull();
  });

  it("returns both mowing and watering when both match", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: waterMonWedFri }];
    const result = getTodayReminders(sections, MON, 0);
    expect(result[0].mowing).not.toBeNull();
    expect(result[0].watering).not.toBeNull();
  });

  it("handles daysBefore=1 by checking tomorrow's day", () => {
    const sun = new Date("2026-06-07T00:00:00Z"); // Sunday
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: null }];
    const result = getTodayReminders(sections, sun, 1);
    expect(result).toHaveLength(1);
  });

  it("skips sections with unparseable schedule JSON", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: "not json", wateringSchedule: null }];
    expect(getTodayReminders(sections, MON, 0)).toEqual([]);
  });
});
