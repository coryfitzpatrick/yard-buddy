import { describe, it, expect } from "vitest";
import { notificationPrefsSchema } from "../validations/notifications";

const VALID_FULL = {
  emailNotificationsEnabled: true,
  pushNotificationsEnabled: true,
  notificationsEnabled: true,
  taskPushEnabled: false,
  notifyDaysAhead: 3,
  reminderNotificationsEnabled: true,
  schedulePushEnabled: true,
  reminderDaysBefore: 0,
  weatherEmailEnabled: true,
  weatherPushEnabled: true,
  gddNotificationsEnabled: true,
  gddBestDayReminderDays: 0,
};

describe("notificationPrefsSchema", () => {
  it("accepts valid prefs with notifications on", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
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
      ...VALID_FULL,
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
      ...VALID_FULL,
      notifyDaysAhead: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects notifyDaysAhead above 14", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
      notifyDaysAhead: 15,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer notifyDaysAhead", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
      notifyDaysAhead: 2.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing notificationsEnabled", () => {
    const { notificationsEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("accepts reminderDaysBefore of 0 (send on day)", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
      reminderDaysBefore: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts reminderDaysBefore of 1 (send day before)", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
      reminderDaysBefore: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects reminderDaysBefore above 3", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
      reminderDaysBefore: 4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer reminderDaysBefore", () => {
    const result = notificationPrefsSchema.safeParse({
      ...VALID_FULL,
      reminderDaysBefore: 0.5,
    });
    expect(result.success).toBe(false);
  });

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

  it("rejects missing emailNotificationsEnabled", () => {
    const { emailNotificationsEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing pushNotificationsEnabled", () => {
    const { pushNotificationsEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing taskPushEnabled", () => {
    const { taskPushEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing schedulePushEnabled", () => {
    const { schedulePushEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing weatherEmailEnabled", () => {
    const { weatherEmailEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing weatherPushEnabled", () => {
    const { weatherPushEnabled: _, ...without } = VALID_FULL;
    const result = notificationPrefsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});
