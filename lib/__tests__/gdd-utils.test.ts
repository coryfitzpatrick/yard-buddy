import { describe, it, expect } from "vitest";
import {
  computeDailyGdd,
  isPreEmergentApplicable,
  isGrubAlertApplicable,
  isOverseedingApplicable,
} from "../gdd-utils";

describe("computeDailyGdd", () => {
  it("returns positive GDD when avg exceeds base 50", () => {
    expect(computeDailyGdd(80, 60)).toBe(20); // avg 70, 70-50=20
  });
  it("clamps to 0 when avg is below base", () => {
    expect(computeDailyGdd(40, 30)).toBe(0); // avg 35, below 50
  });
  it("returns 0 when avg equals base exactly", () => {
    expect(computeDailyGdd(60, 40)).toBe(0); // avg 50, 50-50=0
  });
  it("returns fractional GDD", () => {
    expect(computeDailyGdd(81, 60)).toBeCloseTo(20.5);
  });
});

describe("isPreEmergentApplicable", () => {
  it("returns true for cool-season grass in any state", () => {
    expect(isPreEmergentApplicable("tall_fescue", "OH")).toBe(true);
    expect(isPreEmergentApplicable("kentucky_bluegrass", "FL")).toBe(true);
  });
  it("returns true for warm-season grass outside deep South", () => {
    expect(isPreEmergentApplicable("bermuda", "VA")).toBe(true);
  });
  it("returns false for warm-season grass in deep South", () => {
    expect(isPreEmergentApplicable("bermuda", "FL")).toBe(false);
    expect(isPreEmergentApplicable("zoysia", "TX")).toBe(false);
  });
  it("is case-insensitive for state code", () => {
    expect(isPreEmergentApplicable("bermuda", "fl")).toBe(false);
    expect(isPreEmergentApplicable("bermuda", "FL")).toBe(false);
  });
  it("returns true when state is empty string", () => {
    expect(isPreEmergentApplicable("bermuda", "")).toBe(true);
  });
});

describe("isGrubAlertApplicable", () => {
  it("returns false for warm-season grass regardless of state", () => {
    expect(isGrubAlertApplicable("bermuda", "OH")).toBe(false);
    expect(isGrubAlertApplicable("zoysia", "NJ")).toBe(false);
    expect(isGrubAlertApplicable("st_augustine", "VA")).toBe(false);
  });
  it("returns true for cool-season grass in Japanese beetle states", () => {
    expect(isGrubAlertApplicable("tall_fescue", "OH")).toBe(true);
    expect(isGrubAlertApplicable("kentucky_bluegrass", "NJ")).toBe(true);
    expect(isGrubAlertApplicable("perennial_ryegrass", "DC")).toBe(true);
  });
  it("returns false for cool-season grass outside Japanese beetle range", () => {
    expect(isGrubAlertApplicable("tall_fescue", "TX")).toBe(false);
    expect(isGrubAlertApplicable("kentucky_bluegrass", "AZ")).toBe(false);
    expect(isGrubAlertApplicable("tall_fescue", "FL")).toBe(false);
  });
  it("is case-insensitive for state code", () => {
    expect(isGrubAlertApplicable("tall_fescue", "oh")).toBe(true);
  });
});

describe("isOverseedingApplicable", () => {
  it("returns true for cool-season grasses", () => {
    expect(isOverseedingApplicable("tall_fescue")).toBe(true);
    expect(isOverseedingApplicable("kentucky_bluegrass")).toBe(true);
    expect(isOverseedingApplicable("perennial_ryegrass")).toBe(true);
  });
  it("returns false for warm-season grasses", () => {
    expect(isOverseedingApplicable("bermuda")).toBe(false);
    expect(isOverseedingApplicable("zoysia")).toBe(false);
    expect(isOverseedingApplicable("st_augustine")).toBe(false);
    expect(isOverseedingApplicable("centipede")).toBe(false);
    expect(isOverseedingApplicable("bahia")).toBe(false);
  });
  it("returns true for unknown grass type", () => {
    expect(isOverseedingApplicable("unknown")).toBe(true);
  });
});
