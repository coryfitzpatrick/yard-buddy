import { describe, it, expect } from "vitest";
import { yardSchema } from "@/lib/validations/yard";

describe("yardSchema watering fields", () => {
  it("accepts valid watering days array and minutes", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDays: ["Mon", "Wed", "Fri"],
      wateringTime: "07:00",
      wateringMinutesPerSession: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wateringDays).toEqual(["Mon", "Wed", "Fri"]);
      expect(result.data.wateringTime).toBe("07:00");
      expect(result.data.wateringMinutesPerSession).toBe(20);
    }
  });

  it("accepts empty string for minutes (form input behaviour)", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wateringMinutesPerSession).toBeUndefined();
    }
  });

  it("rejects an invalid day name in wateringDays", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDays: ["Funday"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts omitted watering fields (optional)", () => {
    const result = yardSchema.safeParse({ name: "My Yard", zipCode: "30301" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty wateringDays array", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringDays: [],
    });
    expect(result.success).toBe(true);
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

  it("rejects malformed wateringTime", () => {
    const result = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringTime: "morning",
    });
    expect(result.success).toBe(false);
  });

  it("accepts wateringMinutesPerSession at min boundary (1) and max boundary (120)", () => {
    const minResult = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: 1,
    });
    expect(minResult.success).toBe(true);

    const maxResult = yardSchema.safeParse({
      name: "My Yard",
      zipCode: "30301",
      wateringMinutesPerSession: 120,
    });
    expect(maxResult.success).toBe(true);
  });
});
