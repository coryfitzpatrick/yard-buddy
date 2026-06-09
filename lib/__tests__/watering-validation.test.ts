import { describe, it, expect } from "vitest";
import { yardSchema } from "@/lib/validations/yard";

describe("yardSchema watering fields", () => {
  it("accepts valid watering days and minutes", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 3,
      wateringMinutesPerSession: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wateringDaysPerWeek).toBe(3);
      expect(result.data.wateringMinutesPerSession).toBe(20);
    }
  });

  it("accepts empty string as undefined (form input behaviour)", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: "",
      wateringMinutesPerSession: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wateringDaysPerWeek).toBeUndefined();
      expect(result.data.wateringMinutesPerSession).toBeUndefined();
    }
  });

  it("rejects wateringDaysPerWeek outside 1-7", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 8,
    });
    expect(result.success).toBe(false);
  });

  it("accepts omitted watering fields (optional)", () => {
    const result = yardSchema.safeParse({ name: "My Yard", zipCode: "30301" });
    expect(result.success).toBe(true);
  });

  it("rejects wateringDaysPerWeek: 0 (below min 1)", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects wateringMinutesPerSession: 0 (below min 1)", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects wateringMinutesPerSession: 121 (above max 120)", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: 121,
    });
    expect(result.success).toBe(false);
  });

  it("accepts wateringDaysPerWeek at min boundary (1) and max boundary (7)", () => {
    const minResult = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 1,
    });
    expect(minResult.success).toBe(true);
    if (minResult.success) {
      expect(minResult.data.wateringDaysPerWeek).toBe(1);
    }

    const maxResult = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDaysPerWeek: 7,
    });
    expect(maxResult.success).toBe(true);
    if (maxResult.success) {
      expect(maxResult.data.wateringDaysPerWeek).toBe(7);
    }
  });

  it("accepts wateringMinutesPerSession at min boundary (1) and max boundary (120)", () => {
    const minResult = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: 1,
    });
    expect(minResult.success).toBe(true);
    if (minResult.success) {
      expect(minResult.data.wateringMinutesPerSession).toBe(1);
    }

    const maxResult = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: 120,
    });
    expect(maxResult.success).toBe(true);
    if (maxResult.success) {
      expect(maxResult.data.wateringMinutesPerSession).toBe(120);
    }
  });
});
