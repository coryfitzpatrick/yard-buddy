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

  it("includes healthy lawn mode instructions", () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({
      section: {
        name: "Front Yard",
        grassType: "bermuda",
        soilPh: null,
        nitrogenPpm: null,
        phosphorusPpm: null,
        potassiumPpm: null,
        soilTestSource: null,
        sunExposure: null,
        squareFootage: null,
        streetAddress: null,
        currentRoutine: null,
      },
      weather: {
        temp: 75,
        humidity: 50,
        condition: "Clear",
        recentRainfall: 0,
        forecast: [],
      },
    });
    expect(systemPrompt).toContain("HEALTHY LAWN MODE");
    expect(systemPrompt).toContain("taskMode");
  });

  it("includes currentRoutine in prompt when provided", () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({
      section: {
        name: "Front Yard",
        grassType: "bermuda",
        soilPh: null,
        nitrogenPpm: null,
        phosphorusPpm: null,
        potassiumPpm: null,
        soilTestSource: null,
        sunExposure: null,
        squareFootage: null,
        streetAddress: null,
        currentRoutine: "Mowing: Weekly at 3.5 inches\nWatering: Tue/Thu/Sat mornings",
      },
      weather: {
        temp: 75,
        humidity: 50,
        condition: "Clear",
        recentRainfall: 0,
        forecast: [],
      },
    });
    expect(systemPrompt).toContain("Current Routine:");
    expect(systemPrompt).toContain("Mowing: Weekly at 3.5 inches");
  });

  it("omits currentRoutine from prompt when null", () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({
      section: {
        name: "Front Yard",
        grassType: "bermuda",
        soilPh: null,
        nitrogenPpm: null,
        phosphorusPpm: null,
        potassiumPpm: null,
        soilTestSource: null,
        sunExposure: null,
        squareFootage: null,
        streetAddress: null,
        currentRoutine: null,
      },
      weather: {
        temp: 75,
        humidity: 50,
        condition: "Clear",
        recentRainfall: 0,
        forecast: [],
      },
    });
    expect(systemPrompt).not.toContain("Current Routine:");
  });

  it("includes species identification rule in system prompt", () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain("SPECIES IDENTIFICATION RULE")
    expect(systemPrompt.toLowerCase()).toContain("crabgrass")
    expect(systemPrompt.toLowerCase()).toContain("nutsedge")
  })
})
