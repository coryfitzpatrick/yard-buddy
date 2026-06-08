type SectionInput = {
  name: string
  grassType?: string | null
  soilPh?: number | null
  nitrogenPpm?: number | null
  phosphorusPpm?: number | null
  potassiumPpm?: number | null
  soilTestSource?: string | null
  sunExposure?: string | null
  squareFootage?: number | null
  streetAddress?: string | null
  irrigationType?: string | null
}

type WeatherInput = {
  temp: number
  humidity: number
  condition: string
  recentRainfall: number
  forecast: Array<{ day: string; high: number; low: number; condition: string; chanceOfRain: number }>
}

type PromptInput = {
  section: SectionInput
  weather: WeatherInput
  userQuestion?: string
}

export function buildSectionAnalysisPrompt({ section, weather, userQuestion }: PromptInput): {
  systemPrompt: string
  userMessage: string
} {
  const systemPrompt = `You are an expert lawn care agronomist advising a homeowner on their "${section.name}" lawn section.

LAWN PROFILE:
- Grass type: ${section.grassType ?? 'unknown — ask if important'}
- Soil pH: ${section.soilPh != null ? section.soilPh : 'not tested yet — mention testing if relevant'}
- Nitrogen (N): ${section.nitrogenPpm != null ? `${section.nitrogenPpm} ppm` : 'not tested'}
- Phosphorus (P): ${section.phosphorusPpm != null ? `${section.phosphorusPpm} ppm` : 'not tested'}
- Potassium (K): ${section.potassiumPpm != null ? `${section.potassiumPpm} ppm` : 'not tested'}
${section.soilTestSource ? `- Soil test from: ${section.soilTestSource}` : ''}
- Sun exposure: ${section.sunExposure ?? 'unknown'}
- Size: ${section.squareFootage != null ? `${section.squareFootage} sq ft` : 'unknown'}
- Location: ${section.streetAddress ?? 'unknown — use general US guidance'}
- Irrigation: ${section.irrigationType ?? 'unknown'}

CURRENT CONDITIONS (${section.streetAddress ?? 'user location'}):
- Temperature: ${weather.temp}°F
- Humidity: ${weather.humidity}%
- Conditions: ${weather.condition}
- Recent rainfall: ${weather.recentRainfall}" in last 7 days
- Forecast: ${weather.forecast.map(f => `${f.day}: ${f.high}°/${f.low}°, ${f.condition}, ${f.chanceOfRain}% rain`).join(' | ')}

INSTRUCTIONS:
1. Give advice specific to this section's grass type, sun exposure, and current regional conditions — not generic advice.
2. When recommending products, name at least 2 options across different brands (e.g., Scotts, Jonathan Green, generic store brand, organic option) and note approximate price range.
3. Adjust task timing based on actual forecast — if rain is coming, say so and adjust watering advice accordingly.
4. Flag if the soil pH is outside the ideal range for this grass type and recommend an amendment.
5. Be specific about application rates per square footage when relevant.
6. Match recommendations to the correct seasonal timing for this region (not a one-size-fits-all national calendar).
7. Keep the response practical — no more than 3-4 prioritized action items plus any photo observations.`

  const userMessage = userQuestion
    ?? `Please analyze this lawn section and give me prioritized recommendations for what to do in the next 1-2 weeks.`

  return { systemPrompt, userMessage }
}
