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
});
