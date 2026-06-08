import { z } from 'zod'

export const soilDataSchema = z.object({
  soilPh: z.number().min(0).max(14).optional(),
  nitrogenPpm: z.number().min(0).optional(),
  phosphorusPpm: z.number().min(0).optional(),
  potassiumPpm: z.number().min(0).optional(),
  organicMatterPct: z.number().min(0).max(100).optional(),
  soilTestSource: z.string().max(200).optional(),
  soilTestedAt: z.coerce.date().optional(),
})

export type SoilData = z.infer<typeof soilDataSchema>
