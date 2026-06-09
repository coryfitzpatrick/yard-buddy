import { z } from "zod";

export const notificationPrefsSchema = z.object({
  notificationsEnabled: z.boolean(),
  notifyDaysAhead: z.number().int().min(1).max(14),
  reminderNotificationsEnabled: z.boolean(),
  reminderDaysBefore: z.number().int().min(0).max(3),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
