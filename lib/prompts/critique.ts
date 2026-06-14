import type { LawnContext } from "@/lib/claude";

const RED_FLAG_CHECKLIST = `
RED-FLAG CHECKLIST — flag if the draft does ANY of these:

A. Unit-mixing math (centipede + any grass)
   - Combines a per-1,000 sq ft rate with a per-lawn total in the same sentence without explicit labels (e.g., "0.5 lbs N per 1,000 sq ft × 4,000 sq ft = 2.0 lbs total — within the 1 lb cap" reads as a contradiction even when the math is valid). Flag as: "unit-mixing in <field>".

B. Banned-product cross-recommendation
   - Recommends Tenacity (mesotrione) on bermuda — PHYTOTOXIC. (Tenacity is FINE on tall fescue, KBG, fine fescue, ryegrass, and centipede — do NOT flag those.)
   - Recommends Pennington UltraGreen 30-0-4, UltraGreen 30-0-10, Lesco Stressgard, any Scotts Turf Builder formulation (including "Scotts Turf Builder Southern Lawn Food"), or Scotts WinterGuard 32-0-10 ON CENTIPEDE ONLY. These products are normal/appropriate on bermuda, zoysia, St. Augustine, KBG, tall fescue, fine fescue, and ryegrass — do NOT flag those grass types. Only flag when the grass type is centipede.
   - Recommends Bonide Sulfur Plant Fungicide or Hi-Yield Wettable Dusting Sulfur FOR SOIL pH CORRECTION — those are fungicide-grade powders, not pH acidifiers. Do NOT flag when the same product is recommended as a fungicide for foliar disease — it's labeled for that use.

C. Lime classification
   - Calls Greenview Mag-I-Cal / Jonathan Green MAG-I-CAL Pro "calcitic" — they are calcium-MAGNESIUM (functionally dolomitic).
   - Recommends dolomitic lime without confirmed Mg deficiency from a soil test.

D. Cold-weather herbicide classification
   - Treats Speed Zone / Speed Zone Southern / Surge as a pure three-way for winter spot-spray guidance — they contain carfentrazone (or sulfentrazone) and retain activity at ~45–50°F.
   - Recommends pure three-way products (Trimec Classic, Ortho Weed-B-Gon, Bayer All-In-One) below 60°F daytime highs.

E. Regional tool mismatch
   - Recommends CoAgMet for any non-Colorado homeowner.
   - Recommends AZMet for any non-Arizona homeowner.
   - Recommends a soil-temperature tool from a state that does not match the homeowner's ZIP code.

F. Dormant-turf damage
   - Suggests a peel test, scalping (mowing below 1"), or aeration on dormant warm-season turf (bermuda, zoysia, centipede, St. Augustine when air temp <50°F or notes indicate dormancy).
   - Schedules grub scouting tasks in late November / December on dormant turf.

G. Iron chelate / pH alignment
   - Recommends FeEDTA (Southern Ag Chelated Liquid Iron etc.) above pH ~7.0 — degrades.
   - Says EDTA is effective at high pH or FeEDDHA is "only" for extreme alkaline soils.

H. Soil temperature trigger errors
   - Frames soil temp 60°F as the "ideal window" for spring crabgrass pre-emergent — by 60°F the window has passed or is closing.
   - Recommends elemental sulfur application when soil temps are below 55°F (no microbial oxidation).

I. New seed / dormancy constraints (these are critical hard rules)
   - Recommends pre-emergent on a recently-seeded lawn.
   - Recommends post-emergent on a recently-seeded lawn (< 4 weeks since germination).
   - Recommends fertilizer on warm-season turf when air temp <50°F (full dormancy).
   - Recommends high-N fertilizer on cool-season turf when air temp >85°F.

J. Drought-stress rules (apply ONLY when ALL THREE are true: soil moisture = "dry" AND recent rainfall = 0 inches AND air temp >= 80°F. If any is missing, do NOT flag as drought stress — the lawn is not in acute drought.)
   - Recommends 1–1.5 inches per SESSION (vs per week) on a drought-stressed lawn.
   - Recommends LOWER mowing height during drought stress.
   - Recommends fertilizer on a drought-stressed lawn (deferring/withholding fertilizer is the CORRECT action — never flag deferral as a violation).
   - Recommends FOLIAR fungicide on a drought-stressed or no-rain low-humidity (<65%) lawn. Soil/root fungicide drench for summer-patch / necrotic ring spot under dry heat stress is OK — do NOT flag that.
`;

export function buildCritiquePrompt(opts: {
  context: LawnContext;
  factsBlock: string;
  draftJson: string;
}): string {
  const { context, factsBlock, draftJson } = opts;

  const profileSummary = [
    `grass type: ${context.grassType}`,
    `zip: ${context.zipCode || "MISSING"}`,
    context.areaType ? `area: ${context.areaType}` : null,
    context.soilPh != null ? `soil pH: ${context.soilPh}` : null,
    context.soilMoisture ? `soil moisture: ${context.soilMoisture}` : null,
    context.weatherData?.temp != null ? `air temp: ${context.weatherData.temp}°F` : null,
    context.weatherData?.humidity != null ? `humidity: ${context.weatherData.humidity}%` : null,
    context.weatherData?.recentRainfall != null ? `recent rainfall: ${context.weatherData.recentRainfall}"` : null,
    context.notes ? `notes: ${context.notes.slice(0, 300)}` : null,
  ]
    .filter(Boolean)
    .join("\n  ");

  return `You are auditing a lawn-care recommendation draft for specific rule violations. Do NOT rewrite. Output ONLY a JSON object listing violations.

HOMEOWNER PROFILE:
  ${profileSummary}

${factsBlock}

${RED_FLAG_CHECKLIST}

DRAFT RECOMMENDATIONS:
${draftJson}

Output exactly this JSON shape:
{"violations": ["<one short specific description per issue, citing the exact recommendation field/title where possible>", ...]}

Rules:
- Empty array means no violations.
- Be CONCRETE: cite the specific product, field, or sentence that violates.
- Do NOT invent issues. Only flag what the checklist or VERIFIED FACTS explicitly cover.
- Output ONLY the JSON object, no preamble, no markdown fences.`;
}

export function buildRevisePrompt(opts: {
  originalUserPrompt: string;
  draftJson: string;
  violations: string[];
}): string {
  const { originalUserPrompt, draftJson, violations } = opts;
  const violationList = violations.map((v, i) => `${i + 1}. ${v}`).join("\n");

  return `Your previous draft for this profile had the following specific rule violations identified by an auditor:

${violationList}

Original draft (for reference):
${draftJson}

ORIGINAL TASK PROMPT (re-emit using this same context):
${originalUserPrompt}

INSTRUCTIONS:
- Re-emit the FULL JSON array, identical to your draft EXCEPT where you fix the listed violations.
- Do NOT introduce other changes, do NOT remove or add unrelated recommendations.
- Output ONLY the JSON array, no preamble, no markdown fences.`;
}
