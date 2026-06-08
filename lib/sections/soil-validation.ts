import { z } from 'zod'

// soilDataSchema is a lenient validator for standalone soil test results —
// intended for a future dedicated soil-data API endpoint where only soil fields
// are submitted (not the full section form). The form uses yardSectionSchema instead.
export const soilDataSchema = z.object({
  soilPh: z.number().min(4).max(9).optional(),
  nitrogenPpm: z.number().min(0).optional(),
  phosphorusPpm: z.number().min(0).optional(),
  potassiumPpm: z.number().min(0).optional(),
  organicMatterPct: z.number().min(0).max(100).optional(),
  soilTestSource: z.string().max(200).optional(),
  soilTestedAt: z.coerce.date().optional(),
})

export type SoilData = z.infer<typeof soilDataSchema>
