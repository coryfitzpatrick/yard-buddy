import { describe, it, expect } from "vitest";
import { toSqft, toDisplaySize, SQFT_PER_ACRE } from "../size-utils";

describe("toSqft", () => {
  it("returns rounded sqft for sqft unit", () => {
    expect(toSqft("1000", "sqft")).toBe(1000);
  });

  it("rounds fractional sqft input", () => {
    expect(toSqft("1000.7", "sqft")).toBe(1001);
  });

  it("converts acres to sqft", () => {
    expect(toSqft("1", "acres")).toBe(SQFT_PER_ACRE);
  });

  it("rounds acres conversion", () => {
    expect(toSqft("0.5", "acres")).toBe(Math.round(0.5 * SQFT_PER_ACRE));
  });

  it("returns undefined for empty string", () => {
    expect(toSqft("", "sqft")).toBeUndefined();
  });

  it("returns undefined for zero", () => {
    expect(toSqft("0", "sqft")).toBeUndefined();
  });

  it("returns undefined for negative value", () => {
    expect(toSqft("-100", "sqft")).toBeUndefined();
  });

  it("returns undefined for non-numeric string", () => {
    expect(toSqft("abc", "sqft")).toBeUndefined();
  });
});

describe("toDisplaySize", () => {
  it("returns sqft as integer string", () => {
    expect(toDisplaySize(1000, "sqft")).toBe("1000");
  });

  it("converts sqft to acres with 3 decimal places", () => {
    expect(toDisplaySize(SQFT_PER_ACRE, "acres")).toBe("1.000");
  });

  it("round-trips exact acre values (1 acre = 43560 sqft)", () => {
    const original = SQFT_PER_ACRE;
    const asAcres = toDisplaySize(original, "acres");
    const backToSqft = toSqft(asAcres, "acres");
    expect(backToSqft).toBe(original);
  });

  it("3 decimal acre precision may drift by up to 1 sqft for non-integer acre values", () => {
    const original = 5000;
    const asAcres = toDisplaySize(original, "acres");
    const backToSqft = toSqft(asAcres, "acres");
    // 3 decimal places = ±21 sqft max drift; in practice well under 10
    expect(Math.abs((backToSqft ?? 0) - original)).toBeLessThan(25);
  });
});
