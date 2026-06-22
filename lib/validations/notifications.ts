import { z } from "zod";

export const notificationPrefsSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
  pushNotificationsEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  taskPushEnabled: z.boolean(),
  notifyDaysAhead: z.number().int().min(1).max(14),
  reminderNotificationsEnabled: z.boolean(),
  schedulePushEnabled: z.boolean(),
  reminderDaysBefore: z.number().int().min(0).max(3),
  weatherEmailEnabled: z.boolean(),
  weatherPushEnabled: z.boolean(),
  gddNotificationsEnabled: z.boolean(),
  gddBestDayReminderDays: z.number().int().min(0).max(7),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
