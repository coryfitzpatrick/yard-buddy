import { describe, it, expect } from "vitest"
import { buildSectionAnalysisPrompt } from '../analysis-prompt'

describe('buildSectionAnalysisPrompt', () => {
  const baseSection = {
    name: 'Front Yard',
    grassType: 'Tall Fescue',
    soilPh: 6.2,
    sunExposure: 'partial',
    squareFootage: 1200,
    streetAddress: '123 Main St, Atlanta, GA 30301',
  }

  const baseWeather = {
    temp: 78,
    humidity: 65,
    condition: 'Partly Cloudy',
    recentRainfall: 0.8,
    forecast: [
      { day: 'Tomorrow', high: 82, low: 61, condition: 'Sunny', chanceOfRain: 10 },
    ],
  }

  it('includes section name and grass type in system prompt', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain('Front Yard')
    expect(systemPrompt).toContain('Tall Fescue')
  })

  it('references soil pH in the prompt', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain('6.2')
  })

  it('asks for multi-brand product recommendations', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt.toLowerCase()).toContain('brand')
    expect(systemPrompt.toLowerCase()).toContain('generic')
  })

  it('includes current weather and forecast', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain('78')
    expect(systemPrompt).toContain('0.8')
  })

  it('asks for region-specific timing', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt.toLowerCase()).toContain('region')
    expect(systemPrompt.toLowerCase()).toContain('atlanta')
  })

  it('includes NPK soil data in prompt when provided', () => {
    const sectionWithNpk = {
      ...baseSection,
      nitrogenPpm: 42,
      phosphorusPpm: 28,
      potassiumPpm: 180,
      soilTestSource: "UGA Extension Lab",
    }
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: sectionWithNpk, weather: baseWeather })
    expect(systemPrompt).toContain('42')
    expect(systemPrompt).toContain('28')
    expect(systemPrompt).toContain('180')
    expect(systemPrompt).toContain('UGA Extension Lab')
  })
})
