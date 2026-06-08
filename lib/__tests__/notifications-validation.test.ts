import { describe, it, expect } from "vitest";
import { notificationPrefsSchema } from "../validations/notifications";

describe("notificationPrefsSchema", () => {
  it("accepts valid prefs with notifications on", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid prefs with notifications off", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: false,
      notifyDaysAhead: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects notifyDaysAhead below 1", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects notifyDaysAhead above 14", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 15,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer notifyDaysAhead", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 2.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing notificationsEnabled", () => {
    const result = notificationPrefsSchema.safeParse({ notifyDaysAhead: 3 });
    expect(result.success).toBe(false);
  });
});
