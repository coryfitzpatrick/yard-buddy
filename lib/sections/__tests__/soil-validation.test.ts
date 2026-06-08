import { describe, it, expect } from 'vitest'
import { soilDataSchema } from '../soil-validation'

describe('soilDataSchema', () => {
  it('accepts valid complete soil data', () => {
    const result = soilDataSchema.safeParse({
      soilPh: 6.5,
      nitrogenPpm: 42,
      phosphorusPpm: 28,
      potassiumPpm: 180,
      organicMatterPct: 3.2,
      soilTestSource: "Lowe's Soil Test Kit",
      soilTestedAt: new Date('2026-04-01'),
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial data — only pH is provided', () => {
    const result = soilDataSchema.safeParse({ soilPh: 7.1 })
    expect(result.success).toBe(true)
  })

  it('rejects pH out of range', () => {
    const result = soilDataSchema.safeParse({ soilPh: 15 })
    expect(result.success).toBe(false)
  })

  it('accepts empty object — user has no soil data', () => {
    const result = soilDataSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
