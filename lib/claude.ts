import Anthropic from "@anthropic-ai/sdk";
import { GrassType, AnalysisResult, RecommendationItem } from "@/types";
import { buildSectionAnalysisPrompt } from "@/lib/ai/analysis-prompt";
import { buildWateringPrompt, WateringPromptOpts } from "@/lib/ai/watering-prompt";
import { buildSystemPrompt } from "@/lib/prompts";
import { retrieveRelevant, formatChunksForPrompt, inferTopicHints } from "@/lib/rag";
import { getRelevantFacts } from "@/lib/facts";
import { buildCritiquePrompt, buildRevisePrompt } from "@/lib/prompts/critique";
import type { Base64Image } from "../scripts/validation/load-photos";

const CRITIQUE_MODEL = process.env.CRITIQUE_MODEL || "claude-haiku-4-5-20251001";
const CRITIQUE_ENABLED = process.env.CRITIQUE_DISABLED !== "1";

let _lastCritiqueFlags: string[] = [];
let _lastRevised = false;
export function getLastCritiqueMetadata(): { critiqueFlags: string[]; revised: boolean } {
  return { critiqueFlags: _lastCritiqueFlags, revised: _lastRevised };
}

export type DataGapField = 'soilPh' | 'grassType' | 'notes' | 'soilTest' | 'currentRoutine' | 'yardSizeSqft';

export function detectDataGaps(context: LawnContext): DataGapField[] {
  const gaps: DataGapField[] = [];
  if (context.soilPh == null) gaps.push('soilPh');
  if (!context.grassType || context.grassType === 'unknown') gaps.push('grassType');
  if (!context.notes || context.notes.trim().length < 8) gaps.push('notes');
  if (context.nitrogenPpm == null && context.phosphorusPpm == null && context.potassiumPpm == null) {
    gaps.push('soilTest');
  }
  if (!context.currentRoutine || context.currentRoutine.trim().length < 8) gaps.push('currentRoutine');
  if (!context.yardSizeSqft || context.yardSizeSqft <= 0) gaps.push('yardSizeSqft');
  return gaps;
}

const GAP_SENTENCES: Record<DataGapField, string> = {
  soilPh: "Soil pH wasn't shared, so any lime/sulfur and iron-chelate guidance is based on visible chlorosis only — confirm with a soil test before applying.",
  grassType: "Grass type wasn't confirmed, so this analysis assumes the species inferred from the photos. Verify before applying species-specific products (pre-emergent rates, post-emergent selectivity).",
  notes: "You didn't share notes about specific problems or history, so we worked from the photos alone — for chronic or recurring issues, the answer may be incomplete.",
  soilTest: "No soil test N-P-K values were provided, so fertilizer recommendations default to general extension rates rather than your soil's actual needs.",
  currentRoutine: "Your current lawn-care routine wasn't shared, so we couldn't tailor the recommendations to what you're already doing — some advice may duplicate or contradict your current schedule.",
  yardSizeSqft: "Yard size wasn't shared, so product quantities are expressed per 1,000 sq ft rather than as total amounts for your lawn.",
};

export function buildDataGapWarning(gaps: DataGapField[]): string | null {
  if (gaps.length === 0) return null;
  if (gaps.length === 1) return GAP_SENTENCES[gaps[0]];
  if (gaps.length <= 3) {
    return gaps.map((g) => GAP_SENTENCES[g]).join(' ');
  }
  return `You only shared photos and your ZIP. These recommendations are general for your climate and what's visible — sharing a soil test, grass type, yard size, and notes about specific problems would tighten them considerably. Missing fields: ${gaps.join(', ')}.`;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LawnContext {
  grassType: GrassType;
  zipCode: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  spreaderType?: string | null;
  soilPh?: number | null;
  nitrogenPpm?: number | null;
  phosphorusPpm?: number | null;
  potassiumPpm?: number | null;
  soilTestSource?: string | null;
  soilMoisture?: string | null;
  weatherSummary?: string;
  forecastText?: string;
  notes?: string | null;
  currentRoutine?: string | null;
  routineMode?: boolean;
  priorHealthScore?: number;
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


const WARM_SEASON_GRASSES = new Set(["bermuda", "zoysia", "st_augustine", "centipede", "buffalo"]);

const COOL_SEASON_GRASSES = new Set(["kentucky_bluegrass", "tall_fescue", "fine_fescue", "ryegrass"]);

function buildContextWarnings(context: LawnContext): string {
  const warnings: string[] = [];
  const temp = context.weatherData?.temp;
  const isWarmSeason = WARM_SEASON_GRASSES.has(context.grassType);
  const isCoolSeason = COOL_SEASON_GRASSES.has(context.grassType);

  if (isWarmSeason && temp != null && temp < 50) {
    warnings.push(
      `⚠️ DORMANCY CONSTRAINT (MANDATORY): This ${context.grassType} is fully dormant — air temperature is ${temp}°F, below the 50°F growth threshold. HARD RULES for this response:
- Do NOT include any fertilization recommendation — not now, not as future spring planning, not as a heads-up for later. Zero mentions of "fertilize," "apply nitrogen," "feed," or fertilizer products.
- Address ONLY what to do right now during dormancy (weed pre-emergent timing, reduced irrigation, pest scouting).
- Do not plan ahead to spring fertilization in this response. That belongs in a separate spring analysis.`
    );
  }

  if (isCoolSeason && temp != null && temp > 85) {
    warnings.push(
      `⚠️ HEAT STRESS CONSTRAINT (MANDATORY): This cool-season grass (${context.grassType}) is under heat stress — air temperature is ${temp}°F. HARD RULES for this response:
- Do NOT recommend high-nitrogen fertilizer now or include specific high-N product codes (28-0, 32-0, 34-0, 30-0) anywhere in your response — not even as future planning examples.
- If fertilization is mentioned, say only "defer to fall when temperatures drop below 75°F" without naming specific high-N products.
- Do NOT recommend overseeding or seeding now — cool-season seed cannot germinate or survive in ${temp}°F heat. Overseeding should be deferred to fall when SOIL TEMPERATURES drop to 60–65°F (optimal for fast germination; use a soil thermometer to verify — do NOT rely on air temperature alone).
- Focus on heat stress management: raise mowing height, deep infrequent irrigation, avoid foot traffic.`
    );
  }

  if (context.grassType === "st_augustine" && temp != null && temp >= 80) {
    warnings.push(
      `⚠️ ST. AUGUSTINE MOWING CONSTRAINT (MANDATORY): St. Augustine should be mowed at 3–3.5 inches for standard (non-shaded) turf (Texas A&M AgriLife Extension). The absolute MINIMUM is 3 inches — NEVER recommend below 3 inches. Maximum is 4 inches ONLY for deeply shaded locations. Do NOT recommend 3.5–4 inches as the default range for full-sun turf — the standard recommendation is 3–3.5 inches. Do NOT apply bermuda grass mowing heights to St. Augustine.`
    );
  }

  const isDroughtStress = (context.soilMoisture === "dry") &&
    (context.weatherData?.recentRainfall ?? 1) === 0 &&
    (temp != null && temp >= 80);
  if (isDroughtStress) {
    warnings.push(
      `⚠️ DROUGHT STRESS CONSTRAINT (MANDATORY): This lawn is in acute drought stress — soil is dry, no recent rainfall, and temperature is ${temp}°F. HARD RULES for this response:
- Priority #1 is rehydration: target 1–1.5 INCHES TOTAL PER WEEK — deliver this as 2–3 irrigation SESSIONS per week (early morning), each session applying 0.3–0.5 inches using the cycle-and-soak technique (multiple short runs with soak time between). NEVER recommend "1–1.5 inches per session" — that is 3–4.5 inches per week, which causes runoff and waterlogging even in drought.
- MOWING HEIGHT: RAISE to the MAXIMUM for this grass type during drought — tall fescue: 4 inches, Kentucky bluegrass: 3.5 inches, bermuda: 2 inches (University of Arizona extension recommendation for drought stress). NEVER lower mowing height during drought stress; lower heights increase water loss and turf damage.
- Do NOT recommend fertilization of any kind — applying fertilizer to drought-stressed turf causes salt burn and amplifies stress.
- ABSOLUTELY NO FUNGICIDE: Do NOT recommend any fungicide — dry conditions (soil moisture: dry, no recent rainfall) prevent fungal disease development. Fungal pathogens require moisture to spread. Any fungicide recommendation in these conditions is agronomically incorrect.
- Defer ALL non-irrigation inputs (fertilizer, weed control, pre-emergent, fungicide) until the lawn has fully recovered (2–3 weeks of normal growth). Do NOT include fall pre-emergent or overseeding as separate task recommendations in the drought response — if mentioned at all as future planning, it must be a single brief note that ALWAYS includes the soil temperature trigger (e.g., "once the lawn recovers, plan fall pre-emergent when soil temps drop to 70°F").
- Include the footprint/wilt test as a watering trigger: water when footprints remain visible in the lawn after walking on it.
- TALL FESCUE SUMMER DORMANCY: If the homeowner is unable or unwilling to irrigate through the summer, note that tall fescue can be allowed to go dormant in summer heat as an acceptable management option — reduce irrigation to 0.5 inches every 2–3 weeks to keep crown alive (survival moisture only, not growth irrigation), then resume full irrigation in fall when highs consistently fall below 85–90°F. Do NOT set the recovery threshold at 75°F — that is too conservative; most extension sources recommend resuming fall irrigation when temperatures fall into the 80–85°F range. Dormancy is an extension-endorsed survival strategy, not a failure. Mention this option when tall fescue is in drought stress.`
    );
  }

  const humidity = context.weatherData?.humidity;
  const recentRainfall = context.weatherData?.recentRainfall ?? 0;
  // Fire for any temperature — low humidity + no rain = no fungal pressure regardless of heat
  const isDryConditions = recentRainfall === 0 && humidity != null && humidity < 65;
  if (isDryConditions && !isDroughtStress) {
    warnings.push(
      `⚠️ DRY CONDITIONS FUNGICIDE CONSTRAINT (MANDATORY): Humidity is ${humidity}% with no recent rainfall — these dry conditions do NOT support FOLIAR fungal disease development or spread. ABSOLUTE HARD RULE for FOLIAR fungicides: Do NOT recommend foliar fungicide application (dollar spot spray, gray leaf spot treatment, brown patch treatment). No mention of azoxystrobin foliar spray, propiconazole foliar spray, myclobutanil, Headway, Heritage, Armada for foliar disease. EXCEPTION: Root/soil diseases (summer patch — Magnaporthe poae, necrotic ring spot — Ophiosphaerella korrae) actually develop under DRY HEAT STRESS and may be mentioned as relevant concerns with a preventive fungicide DRENCH when heat stress symptoms are present — these are soil-borne pathogens, not foliar diseases. For all OTHER disease topics: mention ONLY as: "If conditions become more humid in the future, watch for X."`
    );
  }

  const notes = (context.notes ?? "").toLowerCase();
  const isRecentlySeeded = notes.includes("seed") || notes.includes("overseed") || notes.includes("germina");
  if (isRecentlySeeded) {
    warnings.push(
      `⚠️ NEW SEED CONSTRAINT (MANDATORY): This lawn was recently seeded or is actively germinating. HARD RULES for this response:
- Do NOT recommend pre-emergent herbicides — they prevent germination entirely.
- Do NOT recommend post-emergent herbicides for at least 4–6 weeks after germination.
- Do NOT recommend high-nitrogen maintenance fertilizer yet — seedlings need to be established first. Emphasize WAITING until after 2–3 mowings at full height before the regular fertilization program begins.
- Watering: light and frequent (brief cycles 2-3x daily to keep surface moist), NOT deep infrequent irrigation.
- Focus on: protecting germinating seedlings, correct watering frequency, first mowing timing (when grass reaches 3-4 inches). For disease monitoring: ${(temp ?? 70) < 75 ? `at current temperature (${temp}°F), damping-off risk is generally LOW — do NOT cite Pythium blight or Pythium aphanidermatum (require >85°F soil temp); if mentioning disease at all, use "cool-season damping-off monitoring only if conditions stay persistently wet"` : `at current temperature (${temp}°F), Pythium blight (Pythium aphanidermatum) is a risk on new seedlings in wet conditions — mefenoxam fungicide drench is the appropriate treatment if damping-off symptoms appear`}.`
    );
  }

  if (context.yardSizeSqft !== undefined && context.yardSizeSqft <= 0) {
    warnings.push(
      `⚠️ INVALID YARD SIZE: The provided yard size (${context.yardSizeSqft} sq ft) is invalid or missing. You MUST acknowledge this uncertainty in your response and note that product quantities cannot be calculated without a valid yard size. Use phrases like "unable to calculate exact quantities without a valid yard size" or "cannot determine specific amounts." Do not provide specific product amounts (lbs, bags, or oz per sq ft calculations) when yard size is invalid.`
    );
  }


  const recentRain = context.weatherData?.recentRainfall ?? 0;
  const isWaterlogged = context.soilMoisture === "wet" && recentRain >= 2;
  if (isWaterlogged) {
    warnings.push(
      `⚠️ WATERLOGGED SOIL CONSTRAINT: This lawn has wet/saturated soil with ${recentRain}" of recent rainfall. HARD RULES for this response:
- Yellow patches and decline in low wet areas are PRIMARILY caused by anaerobic soil conditions (oxygen deprivation/root suffocation), NOT fungal disease — do NOT leap to fungicide as the diagnosis.
- Priority recommendation: reduce irrigation immediately, improve drainage (aeration, topdressing with sand in low areas, french drain consideration).
- Do NOT recommend fungicide unless there is clear evidence of disease (e.g., visible lesions, target-shaped patches with distinct margins) — overwatering symptoms and disease look similar but have different causes.
- Fertilizer should be deferred until soil moisture normalizes — applying fertilizer to saturated soil causes runoff and does not benefit the lawn.`
    );
  }

  if (!context.zipCode || context.zipCode.trim() === "") {
    warnings.push(
      `⚠️ MISSING LOCATION (MANDATORY): No ZIP code or location was provided. You MUST acknowledge this in your response — use phrases like "without knowing your specific location," "general recommendations for your climate region," or "these are general guidelines based on your grass type." Do not silently assume a location. Every recommendation must be framed as general/regional guidance.`
    );
  }

  if (context.grassType === "unknown") {
    warnings.push(
      `⚠️ UNKNOWN GRASS TYPE CONSTRAINT (MANDATORY): The grass type is unknown and unidentified. HARD RULES for this response:
- EVERY recommendation must explicitly acknowledge that it is tentative pending grass type identification — use language like "once your grass type is identified," "this assumes cool-season grass — verify first," or "general guidance until type confirmed"
- Do NOT provide specific mowing height recommendations (ranges vary dramatically by species)
- Do NOT provide specific fertilizer rates or NPK product codes
- Do NOT provide species-specific disease or pest control without first noting uncertainty
- LEAD with grass type identification guidance: recommend taking photos of the lawn and consulting a local extension office, or describe the key visual differences between common grass types (blade width, growth habit, color, season) so the homeowner can self-identify
- Pre-emergent recommendations must be framed as general guidance without species-specific timing`
    );
  }

  if (context.soilPh !== undefined && context.soilPh !== null) {
    // Soil test was already done — explicitly note this so AI doesn't recommend waiting for test
    if (context.soilPh > 7.0) {
      warnings.push(
        `⚠️ SOIL TEST COMPLETE (pH ${context.soilPh} confirmed): A soil test has already been performed — the soil pH is confirmed at ${context.soilPh}. Do NOT recommend waiting for a soil test before starting pH management. The test is done; begin the management program immediately. DO recommend: (1) Follow-up soil test in 3–6 months to track pH progress, (2) Start the sulfur/amendment program now using the known pH as the baseline.`
      );
    }
  }

  return warnings.length > 0 ? `\n${warnings.join("\n")}\n` : "";
}

function buildProfileText(context: LawnContext): string {
  const parts = [
    `grass type: ${context.grassType}`,
    `zip: ${context.zipCode}`,
    context.areaType && `area: ${context.areaType}`,
    context.yardSizeSqft && `size: ${context.yardSizeSqft} sqft`,
    context.soilPh && `soil pH: ${context.soilPh}`,
    context.soilMoisture && `soil moisture: ${context.soilMoisture}`,
    context.weatherSummary,
    context.notes,
  ].filter(Boolean);
  return parts.join(" ");
}

function buildGenerateUserPrompt(context: LawnContext, ragBlock: string, factsBlock: string): string {
  return `Generate lawn care recommendations for this yard. Return a JSON array only.
${buildContextWarnings(context)}
${factsBlock}
${ragBlock}
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
${context.soilPh ? `Soil pH: ${context.soilPh}` : ""}${context.nitrogenPpm != null ? `\n- Nitrogen (N): ${context.nitrogenPpm} ppm` : ''}${context.phosphorusPpm != null ? `\n- Phosphorus (P): ${context.phosphorusPpm} ppm` : ''}${context.potassiumPpm != null ? `\n- Potassium (K): ${context.potassiumPpm} ppm` : ''}${context.soilTestSource ? `\n- Soil test from: ${context.soilTestSource}` : ''}
${context.soilMoisture ? `Soil Moisture: ${context.soilMoisture}` : ""}
${context.forecastText ? `5-Day Weather Forecast:\n${context.forecastText}` : context.weatherSummary ? `Current Weather: ${context.weatherSummary}` : ""}
${context.notes ? `Notes: <notes>${context.notes.slice(0, 500)}</notes>` : ""}
${context.currentRoutine ? `Homeowner's Current Routine:\n<current_routine>${context.currentRoutine.slice(0, 1000)}</current_routine>` : ""}
${context.priorHealthScore !== undefined ? `Prior lawn health score: ${context.priorHealthScore}/100. Apply HEALTHY LAWN MODE if >= 75.` : ""}
${context.routineMode ? "\nROUTINE REMINDER MODE: Generate maintenance-only reminder tasks based on the routine above." : ""}

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
  "spreaderType": "broadcast" | "drop" | "handheld" | "liquid" | "none" (optional),
  "taskMode": "corrective" | "maintenance" | "improvement"
    (corrective = fixing a problem; maintenance = ongoing care; improvement = optional upgrade for a healthy lawn)
}

For scheduledStartDays/scheduledEndDays: use the forecast to pick realistic windows. Example: if rain is Thursday-Friday, schedule a fungicide application for today-Wednesday (scheduledStartDays: 0, scheduledEndDays: 2) with weatherCondition "no_rain_48h". Use "any" only for tasks where weather does not matter (e.g. mowing, edging).`;
}

function extractJsonText(raw: string): string {
  return raw
    .replace(/```(?:json)?\n?/g, "")
    .replace(/^[^[{]*/s, "")
    .trim();
}

async function runCritique(
  context: LawnContext,
  factsBlock: string,
  draftJson: string
): Promise<string[]> {
  try {
    const message = await client.messages.create({
      model: CRITIQUE_MODEL,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: buildCritiquePrompt({ context, factsBlock, draftJson }),
        },
      ],
    });
    const text = (message.content[0] as Anthropic.TextBlock).text.trim();
    const cleaned = text.replace(/```(?:json)?\n?/g, "").replace(/^[^{]*/s, "").trim();
    const parsed = JSON.parse(cleaned) as { violations?: unknown };
    if (Array.isArray(parsed.violations)) {
      return parsed.violations.filter((v): v is string => typeof v === "string");
    }
    return [];
  } catch {
    return ["critique_call_failed"];
  }
}

async function runRevise(
  systemPrompt: string,
  originalUserPrompt: string,
  draftJson: string,
  violations: string[]
): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: buildRevisePrompt({ originalUserPrompt, draftJson, violations }),
      },
    ],
  });
  return (message.content[0] as Anthropic.TextBlock).text.trim();
}

export async function generateRecommendations(context: LawnContext): Promise<RecommendationItem[]> {
  const systemPrompt = buildSystemPrompt(context.grassType);

  const profileText = buildProfileText(context);
  const topicHints = inferTopicHints(profileText, context.notes);
  const ragChunks = retrieveRelevant({
    grassType: context.grassType,
    scenarioText: profileText,
    topicHints,
    k: 5,
  });
  const ragBlock = formatChunksForPrompt(ragChunks);
  const factsBlock = getRelevantFacts(context);

  const userPrompt = buildGenerateUserPrompt(context, ragBlock, factsBlock);

  const draft = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const draftRaw = (draft.content[0] as Anthropic.TextBlock).text.trim();
  let workingJson = extractJsonText(draftRaw);

  _lastCritiqueFlags = [];
  _lastRevised = false;

  if (CRITIQUE_ENABLED) {
    const violations = await runCritique(context, factsBlock, workingJson);
    const realViolations = violations.filter((v) => v !== "critique_call_failed");

    if (realViolations.length > 0) {
      _lastCritiqueFlags = realViolations;
      try {
        const revisedRaw = await runRevise(systemPrompt, userPrompt, workingJson, realViolations);
        const revisedJson = extractJsonText(revisedRaw);
        JSON.parse(revisedJson);
        workingJson = revisedJson;
        _lastRevised = true;
      } catch {
        _lastRevised = false;
      }
    } else {
      _lastCritiqueFlags = violations;
    }
  }

  try {
    return JSON.parse(workingJson) as RecommendationItem[];
  } catch {
    throw new Error(`Claude returned non-JSON response: ${workingJson.slice(0, 300)}`);
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
          nitrogenPpm: context.nitrogenPpm,
          phosphorusPpm: context.phosphorusPpm,
          potassiumPpm: context.potassiumPpm,
          soilTestSource: context.soilTestSource,
          sunExposure: context.sunExposure ?? null,
          squareFootage: context.yardSizeSqft,
          streetAddress: context.streetAddress,
          currentRoutine: context.currentRoutine ?? null,
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
    : buildSystemPrompt(context.grassType);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
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
${context.notes ? `- Notes: <notes>${context.notes.slice(0, 500)}</notes>` : ""}
${context.currentRoutine ? `- Current Routine: <current_routine>${context.currentRoutine.slice(0, 1000)}</current_routine>` : ""}

Return this exact JSON structure:
{
  "issues": ["array using only these keys: grubs, weeds_broadleaf, weeds_grassy, fungus, drought_stress, overwatering, bare_spots, thatch, compaction, nutrient_deficiency, pests, healthy"],
  "healthScore": number (0-100),
  "summary": "2-3 sentence plain English description of what you see, naming specific weed/pest/disease species observed",
  "grassTypeDetected": "one of: bermuda, kentucky_bluegrass, tall_fescue, fine_fescue, zoysia, st_augustine, centipede, buffalo, ryegrass, unknown",
  "confidence": number (0-100, your confidence in the analysis given image quality),
  "recommendations": [
    {
      "title": "string (name specific weed/pest species if applicable, not generic categories)",
      "description": "string (include species name and why it's a problem for this grass type)",
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
      "spreaderType": "broadcast" | "drop" | "handheld" | "liquid" | "none" (optional),
      "taskMode": "corrective" | "maintenance" | "improvement"
        (corrective = fixing a problem; maintenance = ongoing care; improvement = optional upgrade for a healthy lawn)
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
    const result = JSON.parse(cleaned) as AnalysisResult;
    const gaps = detectDataGaps(context);
    result.dataGapWarning = buildDataGapWarning(gaps);
    return result;
  } catch {
    throw new Error(`Claude returned non-JSON response: ${cleaned.slice(0, 300)}`);
  }
}

export async function analyzeImagesBase64(
  base64Images: Base64Image[],
  context: LawnContext
): Promise<AnalysisResult> {
  const systemPrompt = context.weatherData
    ? buildSectionAnalysisPrompt({
        section: {
          name: context.sectionName ?? context.areaType ?? "Lawn Section",
          grassType: context.grassType,
          soilPh: context.soilPh,
          nitrogenPpm: context.nitrogenPpm,
          phosphorusPpm: context.phosphorusPpm,
          potassiumPpm: context.potassiumPpm,
          soilTestSource: context.soilTestSource,
          sunExposure: context.sunExposure ?? null,
          squareFootage: context.yardSizeSqft,
          streetAddress: context.streetAddress,
          currentRoutine: context.currentRoutine ?? null,
        },
        weather: context.weatherData,
      }).systemPrompt + `

ADDITIONAL CONTEXT FOR JSON RESPONSE:
You must return valid JSON only — no markdown, no code fences, no explanation text outside the JSON structure.`
    : buildSystemPrompt(context.grassType);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          ...base64Images,
          {
            type: "text" as const,
            text: `Analyze this lawn from the photos. Return the same JSON structure used by analyzeImages.

Context:
- Grass Type: ${context.grassType.replace(/_/g, " ")}
- ZIP Code: ${context.zipCode}
${context.yardSizeSqft ? `- Yard Size: ${context.yardSizeSqft} sq ft` : ""}
${context.soilPh ? `- Soil pH: ${context.soilPh}` : ""}
${context.soilMoisture ? `- Soil Moisture: ${context.soilMoisture}` : ""}
${context.weatherSummary ? `- Weather: ${context.weatherSummary}` : ""}
${context.notes ? `- Notes: ${context.notes.slice(0, 500)}` : ""}

Return the exact AnalysisResult JSON shape with fields: issues (string[]), healthScore (0-100), summary, grassTypeDetected, confidence (0-100), recommendations (array of the standard recommendation shape).`,
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
  const result = JSON.parse(cleaned) as AnalysisResult;
  const gaps = detectDataGaps(context);
  result.dataGapWarning = buildDataGapWarning(gaps);
  return result;
}

export async function validateLawnImages(
  imageUrls: string[]
): Promise<{ valid: boolean; feedback: string | null }> {
  const imageContent = imageUrls.map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text" as const,
            text: `Review these photos submitted for lawn analysis. Evaluate on three criteria:

1. SUBJECT: Do the images show lawn, grass, or outdoor ground cover? (Not people, pets, buildings, indoor scenes, or unrelated subjects)
2. QUALITY: Are the images clear and in focus, well-lit, and close enough to see the grass condition?
3. VARIETY: If multiple images, do they show different angles or areas rather than identical shots?

Return JSON only, no other text:
{
  "valid": true or false,
  "feedback": null or "1-2 sentence explanation of what's wrong and how to fix it"
}

Set valid=true only when: all images are clearly of a lawn/grass area, quality is acceptable, and the set provides useful information.
Set valid=false with feedback when: any image clearly isn't a lawn, all images are too blurry/dark to analyze, or all images are near-identical with no variety.`,
          },
        ],
      },
    ],
  });

  try {
    const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    const json = JSON.parse(text.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
    return {
      valid: json.valid === true,
      feedback: typeof json.feedback === "string" ? json.feedback : null,
    };
  } catch {
    // If Haiku returns unparseable output, allow the analysis to proceed
    return { valid: true, feedback: null };
  }
}

export async function generateWateringRecommendation(
  opts: WateringPromptOpts
): Promise<{ schedule: string; deviates: boolean }> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system:
      "You are an expert lawn care agronomist. Given lawn section details, provide a concise watering schedule recommendation. Return valid JSON only — no markdown, no text outside the JSON object.",
    messages: [{ role: "user", content: buildWateringPrompt(opts) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  try {
    return JSON.parse(text) as { schedule: string; deviates: boolean };
  } catch {
    throw new Error(`generateWateringRecommendation: Claude returned non-JSON: ${text.slice(0, 200)}`);
  }
}
