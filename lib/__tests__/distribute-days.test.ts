import { describe, it, expect } from "vitest";
import { distributeWateringDays, distributeMowingDays } from "@/lib/schedules/distribute-days";

describe("distributeWateringDays", () => {
  it("returns empty for null", () => {
    expect(distributeWateringDays(null)).toEqual([]);
  });
  it("returns empty for 0 or negative", () => {
    expect(distributeWateringDays(0)).toEqual([]);
    expect(distributeWateringDays(-1)).toEqual([]);
  });
  it("returns Wed for 1 day", () => {
    expect(distributeWateringDays(1)).toEqual(["Wed"]);
  });
  it("returns Mon,Thu for 2 days", () => {
    expect(distributeWateringDays(2)).toEqual(["Mon", "Thu"]);
  });
  it("returns Mon,Wed,Fri for 3 days", () => {
    expect(distributeWateringDays(3)).toEqual(["Mon", "Wed", "Fri"]);
  });
  it("returns Mon,Tue,Thu,Sat for 4 days", () => {
    expect(distributeWateringDays(4)).toEqual(["Mon", "Tue", "Thu", "Sat"]);
  });
  it("returns weekdays for 5 days", () => {
    expect(distributeWateringDays(5)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });
  it("returns Mon-Sat for 6 days", () => {
    expect(distributeWateringDays(6)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
  it("returns all days for 7", () => {
    expect(distributeWateringDays(7)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
  it("clamps out-of-range high values to empty", () => {
    expect(distributeWateringDays(8)).toEqual([]);
  });
});

describe("distributeMowingDays", () => {
  it("returns empty for null or 0", () => {
    expect(distributeMowingDays(null)).toEqual([]);
    expect(distributeMowingDays(0)).toEqual([]);
  });
  it("returns Sat for 1 day (weekend bias)", () => {
    expect(distributeMowingDays(1)).toEqual(["Sat"]);
  });
  it("returns Wed,Sat for 2 days", () => {
    expect(distributeMowingDays(2)).toEqual(["Wed", "Sat"]);
  });
  it("returns Mon,Wed,Sat for 3 days", () => {
    expect(distributeMowingDays(3)).toEqual(["Mon", "Wed", "Sat"]);
  });
  it("returns Mon,Wed,Fri,Sat for 4 days", () => {
    expect(distributeMowingDays(4)).toEqual(["Mon", "Wed", "Fri", "Sat"]);
  });
  it("returns Mon-Sat for 6 days", () => {
    expect(distributeMowingDays(6)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});
