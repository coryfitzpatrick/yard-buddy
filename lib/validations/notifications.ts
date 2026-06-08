import { z } from "zod";

export const notificationPrefsSchema = z.object({
  notificationsEnabled: z.boolean(),
  notifyDaysAhead: z.number().int().min(1).max(14),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
