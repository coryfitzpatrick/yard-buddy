import { describe, it, expect } from "vitest";
import { userPreferencesSchema } from "../validations/userPreferences";

describe("userPreferencesSchema", () => {
  it("accepts weatherWidgetCollapsed: true", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: true });
    expect(result.success).toBe(true);
  });

  it("accepts weatherWidgetCollapsed: false", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: false });
    expect(result.success).toBe(true);
  });

  it("rejects missing weatherWidgetCollapsed", () => {
    const result = userPreferencesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects string instead of boolean", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects number instead of boolean", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: 1 });
    expect(result.success).toBe(false);
  });
});
