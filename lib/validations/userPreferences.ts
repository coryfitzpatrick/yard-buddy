import { z } from "zod";

export const userPreferencesSchema = z.object({
  weatherWidgetCollapsed: z.boolean(),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
