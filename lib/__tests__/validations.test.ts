import { describe, it, expect } from "vitest";
import { yardSchema, yardSectionSchema } from "../validations/yard";

describe("yardSchema", () => {
  it("accepts valid yard input", () => {
    const result = yardSchema.safeParse({ name: "My House", zipCode: "90210" });
    expect(result.success).toBe(true);
  });

  it("rejects ZIP codes shorter than 5 digits", () => {
    const result = yardSchema.safeParse({ zipCode: "1234" });
    expect(result.success).toBe(false);
  });

  it("rejects ZIP codes longer than 5 digits", () => {
    const result = yardSchema.safeParse({ zipCode: "123456" });
    expect(result.success).toBe(false);
  });

  it("rejects ZIP codes with non-digit characters", () => {
    const result = yardSchema.safeParse({ zipCode: "9021O" });
    expect(result.success).toBe(false);
  });

  it("defaults name to 'My Property' when empty", () => {
    const result = yardSchema.safeParse({ zipCode: "90210" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("My Property");
  });

  it("accepts optional fields", () => {
    const result = yardSchema.safeParse({
      zipCode: "90210",
      spreaderType: "broadcast",
      lotSqft: 5000,
      buildingSqft: 1200,
      streetAddress: "123 Main St",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid spreaderType", () => {
    const result = yardSchema.safeParse({ zipCode: "90210", spreaderType: "jetpack" });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer lotSqft", () => {
    const result = yardSchema.safeParse({ zipCode: "90210", lotSqft: 1000.5 });
    expect(result.success).toBe(false);
  });

  it("rejects negative lotSqft", () => {
    const result = yardSchema.safeParse({ zipCode: "90210", lotSqft: -1 });
    expect(result.success).toBe(false);
  });
});

describe("yardSectionSchema", () => {
  const base = { grassType: "bermuda" as const };

  it("accepts valid section input", () => {
    const result = yardSectionSchema.safeParse({ ...base, name: "Front Yard" });
    expect(result.success).toBe(true);
  });

  it("defaults name to 'Front Yard'", () => {
    const result = yardSectionSchema.safeParse({ grassType: "bermuda" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Front Yard");
  });

  it("rejects invalid grassType", () => {
    const result = yardSectionSchema.safeParse({ ...base, grassType: "bluegrass" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid grass types", () => {
    const grassTypes = [
      "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
      "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
    ] as const;
    for (const gt of grassTypes) {
      const result = yardSectionSchema.safeParse({ grassType: gt });
      expect(result.success, `expected ${gt} to be valid`).toBe(true);
    }
  });

  it("coerces empty string yardSizeSqft to undefined", () => {
    const result = yardSectionSchema.safeParse({ ...base, yardSizeSqft: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.yardSizeSqft).toBeUndefined();
  });

  it("coerces string yardSizeSqft to number", () => {
    const result = yardSectionSchema.safeParse({ ...base, yardSizeSqft: "2500" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.yardSizeSqft).toBe(2500);
  });

  it("rejects yardSizeSqft less than 1", () => {
    const result = yardSectionSchema.safeParse({ ...base, yardSizeSqft: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects yardSizeSqft greater than 500000", () => {
    const result = yardSectionSchema.safeParse({ ...base, yardSizeSqft: 500001 });
    expect(result.success).toBe(false);
  });

  it("accepts yardSizeSqft at boundary values", () => {
    expect(yardSectionSchema.safeParse({ ...base, yardSizeSqft: 1 }).success).toBe(true);
    expect(yardSectionSchema.safeParse({ ...base, yardSizeSqft: 500000 }).success).toBe(true);
  });

  it("rejects soilPh below 4", () => {
    const result = yardSectionSchema.safeParse({ ...base, soilPh: 3.9 });
    expect(result.success).toBe(false);
  });

  it("rejects soilPh above 9", () => {
    const result = yardSectionSchema.safeParse({ ...base, soilPh: 9.1 });
    expect(result.success).toBe(false);
  });

  it("accepts soilPh at boundary values", () => {
    expect(yardSectionSchema.safeParse({ ...base, soilPh: 4 }).success).toBe(true);
    expect(yardSectionSchema.safeParse({ ...base, soilPh: 9 }).success).toBe(true);
  });

  it("coerces empty string soilPh to undefined", () => {
    const result = yardSectionSchema.safeParse({ ...base, soilPh: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.soilPh).toBeUndefined();
  });

  it("rejects notes longer than 2000 chars", () => {
    const result = yardSectionSchema.safeParse({ ...base, notes: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("accepts notes at the 2000-char limit", () => {
    const result = yardSectionSchema.safeParse({ ...base, notes: "x".repeat(2000) });
    expect(result.success).toBe(true);
  });

  it("rejects invalid areaType", () => {
    const result = yardSectionSchema.safeParse({ ...base, areaType: "rooftop" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid soilMoisture", () => {
    const result = yardSectionSchema.safeParse({ ...base, soilMoisture: "soggy" });
    expect(result.success).toBe(false);
  });

  it("accepts mowingDays as a valid day array", () => {
    const result = yardSectionSchema.safeParse({ ...base, mowingDays: ["Mon", "Thu"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mowingDays).toEqual(["Mon", "Thu"]);
  });

  it("rejects mowingDays with an invalid day name", () => {
    const result = yardSectionSchema.safeParse({ ...base, mowingDays: ["Monday"] });
    expect(result.success).toBe(false);
  });

  it("accepts mowingDays as absent", () => {
    const result = yardSectionSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mowingDays).toBeUndefined();
  });

  it("accepts wateringDays as a valid day array", () => {
    const result = yardSectionSchema.safeParse({ ...base, wateringDays: ["Mon", "Wed", "Fri"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wateringDays).toEqual(["Mon", "Wed", "Fri"]);
  });

  it("rejects wateringDays with an invalid day name", () => {
    const result = yardSectionSchema.safeParse({ ...base, wateringDays: ["Wednesday"] });
    expect(result.success).toBe(false);
  });

  it("accepts wateringDays as absent", () => {
    const result = yardSectionSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wateringDays).toBeUndefined();
  });
});
