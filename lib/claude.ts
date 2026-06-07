import Anthropic from "@anthropic-ai/sdk";
import { GrassType, AnalysisResult, RecommendationItem } from "@/types";
import { buildSectionAnalysisPrompt } from "@/lib/ai/analysis-prompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LawnContext {
  grassType: GrassType;
  zipCode: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  spreaderType?: string | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  weatherSummary?: string;
  forecastText?: string;
  notes?: string | null;
  // Section-aware enrichment fields
  sectionName?: string;
  streetAddress?: string | null;
  sunExposure?: string | null;
  weatherData?: {
    temp: number;
    humidity: number;
    condition: string;
    recentRainfall: number;
    forecast: Array<{ day: string; high: number; low: number; condition: string; chanceOfRain: number }>;
  };
}

const SYSTEM_PROMPT = `You are an expert lawn care agronomist and horticulturist with 20+ years of experience helping homeowners maintain healthy lawns across all US climate zones. You have deep knowledge of:
- All major grass types (warm-season and cool-season) and their specific care requirements
- Fertilization schedules, NPK ratios, soil amendments
- Weed identification and control (pre-emergent and post-emergent)
- Pest identification (grubs, chinch bugs, armyworms, etc.)
- Disease diagnosis (brown patch, dollar spot, red thread, etc.)
- Irrigation and water management
- Aerating, dethatching, overseeding timing and technique
- Spreader settings for major brands (Scotts, Andersons, Lesco, Earthway)

Always give specific, actionable advice. When recommending products, suggest the active ingredient AND a common brand example. Always consider the season, grass type, and local climate when making recommendations. Be direct and practical — homeowners want to know exactly what to do and when.

DEDUPLICATION RULE — never recommend the same type of treatment more than once. If multiple issues (e.g., compaction AND thatch) both call for aeration, include aeration exactly once and address all the reasons in that single task's description. Combine, don't duplicate.

TASK SEQUENCING RULES — only include prerequisite tasks when the conditions actually call for them:
- Aeration before overseeding: only recommend aeration as a prerequisite if the lawn shows compaction or thatch buildup > 0.5 inches. For thin or bare patches on non-compacted soil, seed-to-soil contact via raking is sufficient — do not add unnecessary aeration.
- If both dethatching and aeration are needed, dethatch first and space them ~3 weeks apart to allow recovery.
- When aeration IS recommended before overseeding, set its scheduledEndDays before overseeding's scheduledStartDays.
- Starter fertilizer: apply at or within 1-2 days of overseeding (scheduledStartDays same or +1 from overseeding).
- Pre-emergent herbicides completely prevent seed germination — NEVER recommend them in the same plan as overseeding.
- Post-emergent herbicides: do not recommend within 4-8 weeks of overseeding (product dependent — use 4 weeks as a safe minimum).
- Use scheduledStartDays and scheduledEndDays to reflect correct task order: tasks that must happen first get lower day numbers.

IMPORTANT: You must return valid JSON only — no markdown, no code fences, no explanation text outside the JSON structure.`;

export async function generateRecommendations(context: LawnContext): Promise<RecommendationItem[]> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate lawn care recommendations for this yard. Return a JSON array only.

Grass Type: ${context.grassType.replace(/_/g, " ")}
ZIP Code: ${context.zipCode}
${context.areaType ? `Yard Area: ${context.areaType.replace(/_/g, " ")} (${
  context.areaType === "front"      ? "high visibility, aesthetics matter most" :
  context.areaType === "back"       ? "recreational use, durability matters" :
  context.areaType === "left_side" || context.areaType === "right_side"
                                    ? "narrow side yard, often shaded" :
  context.areaType === "garden"     ? "garden or landscaped area" :
  "custom area"
})` : ""}
${context.yardSizeSqft ? `Yard Size: ${context.yardSizeSqft} sq ft` : ""}
${context.spreaderType ? `Spreader: ${context.spreaderType}` : ""}
${context.soilPh ? `Soil pH: ${context.soilPh}` : ""}
${context.soilMoisture ? `Soil Moisture: ${context.soilMoisture}` : ""}
${context.forecastText ? `5-Day Weather Forecast:\n${context.forecastText}` : context.weatherSummary ? `Current Weather: ${context.weatherSummary}` : ""}
${context.notes ? `Notes: ${context.notes.slice(0, 500)}` : ""}

Return a JSON array of 3-6 recommendations. Each item must follow this exact structure:
{
  "title": "string",
  "description": "string (2-3 sentences: what to do and why)",
  "priority": "urgent" | "high" | "medium" | "low",
  "timing": "string (e.g. 'This week', 'Next 2-4 weeks', 'Wait until fall')",
  "scheduledStartDays": number (integer, days from today to start — 0 means today),
  "scheduledEndDays": number (integer, days from today for hard cutoff — must be >= scheduledStartDays),
  "weatherCondition": "no_rain_48h" | "dry_day" | "soil_moist" | "any",
  "productSuggestion": "string (brand + product name, optional)",
  "productSearchQuery": "string (concise search term for online retailers, e.g. 'Scotts DiseaseEx Fungicide 10lb', omit if no product)",
  "estimatedPrice": "string (typical price range, e.g. '$18-28', omit if unknown)",
  "applicationRate": "string (optional, e.g. '3 lbs per 1000 sq ft')",
  "spreaderSetting": "string (optional, e.g. 'Scotts: 4, Andersons: 12')",
  "spreaderType": "broadcast" | "drop" | "handheld" | "liquid" | "none" (optional)
}

For scheduledStartDays/scheduledEndDays: use the forecast to pick realistic windows. Example: if rain is Thursday-Friday, schedule a fungicide application for today-Wednesday (scheduledStartDays: 0, scheduledEndDays: 2) with weatherCondition "no_rain_48h". Use "any" only for tasks where weather does not matter (e.g. mowing, edging).`,
      },
    ],
  });

  const text = (message.content[0] as Anthropic.TextBlock).text.trim();
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/^[^[{]*/s, "")
    .trim();
  try {
    return JSON.parse(cleaned) as RecommendationItem[];
  } catch {
    throw new Error(`Claude returned non-JSON response: ${cleaned.slice(0, 300)}`);
  }
}

export async function analyzeImages(
  imageUrls: string[],
  context: LawnContext
): Promise<AnalysisResult> {
  const imageContent = imageUrls.map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  // Build section-aware system prompt when enriched context is available
  const systemPrompt = context.weatherData
    ? buildSectionAnalysisPrompt({
        section: {
          name: context.sectionName ?? context.areaType ?? "Lawn Section",
          grassType: context.grassType,
          soilPh: context.soilPh,
          sunExposure: context.sunExposure ?? null,
          squareFootage: context.yardSizeSqft,
          streetAddress: context.streetAddress,
        },
        weather: context.weatherData,
      }).systemPrompt + `

ADDITIONAL CONTEXT FOR JSON RESPONSE:
You must return valid JSON only — no markdown, no code fences, no explanation text outside the JSON structure.

DEDUPLICATION RULE — never recommend the same type of treatment more than once. If multiple issues both call for the same treatment, combine them into a single task.

TASK SEQUENCING RULES:
- Aeration before overseeding: only if compaction/thatch > 0.5" is evident.
- Pre-emergent herbicides completely prevent seed germination — NEVER recommend them with overseeding.
- Post-emergent herbicides: minimum 4 weeks gap from overseeding.
- Use scheduledStartDays/scheduledEndDays to reflect correct task order.`
    : SYSTEM_PROMPT;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text" as const,
            text: `Analyze this lawn. Return a JSON object only.

Known context:
- Grass Type: ${context.grassType.replace(/_/g, " ")}
- ZIP Code: ${context.zipCode}
${context.areaType ? `- Yard Area: ${context.areaType.replace(/_/g, " ")} (${
  context.areaType === "front"      ? "high visibility, aesthetics matter most" :
  context.areaType === "back"       ? "recreational use, durability matters" :
  context.areaType === "left_side" || context.areaType === "right_side"
                                    ? "narrow side yard, often shaded" :
  context.areaType === "garden"     ? "garden or landscaped area" :
  "custom area"
})` : ""}
${context.yardSizeSqft ? `- Yard Size: ${context.yardSizeSqft} sq ft` : ""}
${context.spreaderType ? `- Spreader: ${context.spreaderType}` : ""}
${context.soilPh ? `- Soil pH: ${context.soilPh}` : ""}
${context.soilMoisture ? `- Soil Moisture: ${context.soilMoisture}` : ""}
${context.forecastText ? `- 5-Day Forecast:\n${context.forecastText}` : context.weatherSummary ? `- Weather: ${context.weatherSummary}` : ""}
${context.notes ? `- Notes: ${context.notes.slice(0, 500)}` : ""}

Return this exact JSON structure:
{
  "issues": ["array using only these keys: grubs, weeds_broadleaf, weeds_grassy, fungus, drought_stress, overwatering, bare_spots, thatch, compaction, nutrient_deficiency, pests, healthy"],
  "healthScore": number (0-100),
  "summary": "2-3 sentence plain English description of what you see",
  "grassTypeDetected": "one of: bermuda, kentucky_bluegrass, tall_fescue, fine_fescue, zoysia, st_augustine, centipede, buffalo, ryegrass, unknown",
  "confidence": number (0-100, your confidence in the analysis given image quality),
  "recommendations": [
    {
      "title": "string",
      "description": "string",
      "priority": "urgent" | "high" | "medium" | "low",
      "timing": "string",
      "scheduledStartDays": number (integer, days from today to start — 0 means today),
      "scheduledEndDays": number (integer, days from today for hard cutoff — must be >= scheduledStartDays),
      "weatherCondition": "no_rain_48h" | "dry_day" | "soil_moist" | "any",
      "productSuggestion": "string (brand + product name, optional)",
      "productSearchQuery": "string (concise search term for online retailers, omit if no product)",
      "estimatedPrice": "string (typical price range, e.g. '$18-28', omit if unknown)",
      "applicationRate": "string (optional)",
      "spreaderSetting": "string (optional)",
      "spreaderType": "broadcast" | "drop" | "handheld" | "liquid" | "none" (optional)
    }
  ]
}

For scheduledStartDays/scheduledEndDays: use the forecast to pick realistic windows. Example: if rain is Thursday-Friday, schedule a fungicide application for today-Wednesday (scheduledStartDays: 0, scheduledEndDays: 2) with weatherCondition "no_rain_48h". Use "any" only for tasks where weather does not matter (e.g. mowing, edging).`,
          },
        ],
      },
    ],
  });

  const text = (message.content[0] as Anthropic.TextBlock).text.trim();
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/^[^[{]*/s, "")
    .trim();
  try {
    return JSON.parse(cleaned) as AnalysisResult;
  } catch {
    throw new Error(`Claude returned non-JSON response: ${cleaned.slice(0, 300)}`);
  }
}
