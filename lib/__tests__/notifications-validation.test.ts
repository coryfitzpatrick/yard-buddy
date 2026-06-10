import { describe, it, expect } from "vitest";
import { notificationPrefsSchema } from "../validations/notifications";

describe("notificationPrefsSchema", () => {
  it("accepts valid prefs with notifications on", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 5,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 1,
      gddNotificationsEnabled: true,
      gddBestDayReminderDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid prefs with notifications off", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: false,
      notifyDaysAhead: 3,
      reminderNotificationsEnabled: false,
      reminderDaysBefore: 0,
      gddNotificationsEnabled: true,
      gddBestDayReminderDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects notifyDaysAhead below 1", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 0,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects notifyDaysAhead above 14", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 15,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer notifyDaysAhead", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 2.5,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing notificationsEnabled", () => {
    const result = notificationPrefsSchema.safeParse({
      notifyDaysAhead: 3,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts reminderDaysBefore of 0 (send on day)", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 5,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 0,
      gddNotificationsEnabled: true,
      gddBestDayReminderDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts reminderDaysBefore of 1 (send day before)", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 5,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 1,
      gddNotificationsEnabled: true,
      gddBestDayReminderDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects reminderDaysBefore above 3", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 5,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer reminderDaysBefore", () => {
    const result = notificationPrefsSchema.safeParse({
      notificationsEnabled: true,
      notifyDaysAhead: 5,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: 0.5,
    });
    expect(result.success).toBe(false);
  });

  const VALID_FULL = {
    notificationsEnabled: true,
    notifyDaysAhead: 3,
    reminderNotificationsEnabled: true,
    reminderDaysBefore: 0,
    gddNotificationsEnabled: true,
    gddBestDayReminderDays: 0,
  };

  it("accepts valid prefs with gdd fields present", () => {
    const result = notificationPrefsSchema.safeParse(VALID_FULL);
    expect(result.success).toBe(true);
  });

  it("rejects gddBestDayReminderDays above 7", () => {
    const result = notificationPrefsSchema.safeParse({ ...VALID_FULL, gddBestDayReminderDays: 8 });
    expect(result.success).toBe(false);
  });

  it("rejects negative gddBestDayReminderDays", () => {
    const result = notificationPrefsSchema.safeParse({ ...VALID_FULL, gddBestDayReminderDays: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean gddNotificationsEnabled", () => {
    const result = notificationPrefsSchema.safeParse({ ...VALID_FULL, gddNotificationsEnabled: "yes" });
    expect(result.success).toBe(false);
  });

  it("rejects missing gddNotificationsEnabled", () => {
    const { gddNotificationsEnabled: _, ...withoutGdd } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(withoutGdd);
    expect(result.success).toBe(false);
  });
});
