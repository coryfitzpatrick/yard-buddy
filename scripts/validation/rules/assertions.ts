import type { Rule, RuleResult, Scenario } from "../types";

function contains(response: string, ...terms: string[]): boolean {
  const lower = response.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

const COOL_SEASON: string[] = [
  "kentucky_bluegrass",
  "tall_fescue",
  "fine_fescue",
  "ryegrass",
];

const WARM_SEASON: string[] = ["bermuda", "zoysia", "st_augustine", "centipede", "buffalo"];

const MOWING_RANGES: Record<string, [number, number]> = {
  kentucky_bluegrass: [2.5, 4.0],
  tall_fescue: [3.0, 4.0],
  fine_fescue: [2.5, 4.0],
  ryegrass: [2.0, 3.5],
  bermuda: [0.5, 2.0],
  zoysia: [1.0, 2.5],
  st_augustine: [3.0, 4.0],
  centipede: [1.5, 2.5],
  buffalo: [2.0, 4.0],
};

const noHighNInHeat: Rule = {
  id: "no-high-n-in-heat",
  description:
    "Cool-season grass + air temp >85°F: must not recommend high-nitrogen fertilizer (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const isCool = COOL_SEASON.includes(scenario.profile.grassType);
    const temp = scenario.profile.weatherData?.temp ?? 0;
    if (!isCool || temp <= 85) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    const highNPatterns = [
      "28-0", "32-0", "34-0", "30-0", "high nitrogen", "high-nitrogen",
      "apply fertilizer this week", "fertilize now",
    ];
    const negativeContext = /\b(avoid|not|don't|never|defer|wait|instead|without|skip)\b/i;
    for (const pattern of highNPatterns) {
      const lowerResponse = response.toLowerCase();
      let idx = lowerResponse.indexOf(pattern.toLowerCase());
      while (idx !== -1) {
        // Check the surrounding sentence (~150 chars) for negative context
        const snippet = lowerResponse.slice(Math.max(0, idx - 100), idx + 100);
        if (!negativeContext.test(snippet)) {
          return { ruleId: this.id, pass: false, reason: `Found high-N indicator "${pattern}" for cool-season grass at ${temp}°F` };
        }
        idx = lowerResponse.indexOf(pattern.toLowerCase(), idx + 1);
      }
    }
    return { ruleId: this.id, pass: true, reason: "No high-N recommendation found during heat stress" };
  },
};

const noFertInDormancy: Rule = {
  id: "no-fert-in-dormancy",
  description:
    "Warm-season grass in dormancy (temp <50°F): must not recommend fertilization (Source: UGA Extension)",
  check(scenario, response): RuleResult {
    const isWarm = WARM_SEASON.includes(scenario.profile.grassType);
    const temp = scenario.profile.weatherData?.temp ?? 99;
    if (!isWarm || temp >= 50) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    const fertPatterns = ["fertilize", "apply nitrogen", "feed your lawn", "apply fertilizer"];
    const found = fertPatterns.find((p) => response.toLowerCase().includes(p.toLowerCase()));
    if (found) {
      return { ruleId: this.id, pass: false, reason: `Found fertilization recommendation "${found}" while warm-season grass is dormant at ${temp}°F` };
    }
    return { ruleId: this.id, pass: true, reason: "No fertilization recommended during dormancy" };
  },
};

const limeForLowPh: Rule = {
  id: "lime-for-low-ph",
  description: "Soil pH <6.0: lime or pH-raising amendment must be mentioned (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const ph = scenario.profile.soilPh;
    if (ph == null || ph >= 6.0) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    if (contains(response, "lime", "limestone", "dolomite", "calcitic")) {
      return { ruleId: this.id, pass: true, reason: "Lime recommendation found for low pH" };
    }
    return { ruleId: this.id, pass: false, reason: `pH is ${ph} but no lime recommendation found` };
  },
};

const sulfurForHighPh: Rule = {
  id: "sulfur-for-high-ph",
  description: "Soil pH >7.5: sulfur amendment or acidifying fertilizer must be mentioned (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const ph = scenario.profile.soilPh;
    if (ph == null || ph <= 7.5) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    if (contains(response, "sulfur", "sulphur", "acidif", "elemental sulfur", "ammonium sulfate")) {
      return { ruleId: this.id, pass: true, reason: "Sulfur/acidifying recommendation found for high pH" };
    }
    return { ruleId: this.id, pass: false, reason: `pH is ${ph} but no sulfur or acidifying recommendation found` };
  },
};

const wateringForDrought: Rule = {
  id: "watering-for-drought",
  description:
    "Drought indicators (soilMoisture=dry OR humidity<35 AND recentRainfall=0): watering advice must be present (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const isDry = scenario.profile.soilMoisture === "dry";
    const lowHumidity = (scenario.profile.weatherData?.humidity ?? 100) < 35;
    const noRain = (scenario.profile.weatherData?.recentRainfall ?? 1) === 0;
    if (!isDry && !(lowHumidity && noRain)) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    if (contains(response, "water", "irrigat", "inch per week")) {
      return { ruleId: this.id, pass: true, reason: "Watering advice found for drought conditions" };
    }
    return { ruleId: this.id, pass: false, reason: "Drought conditions detected but no watering recommendation found" };
  },
};

const preEmergentSoilTemp: Rule = {
  id: "pre-emergent-soil-temp",
  description:
    "Pre-emergent weed control recommendation: must mention soil temperature threshold, not only calendar date (Source: Purdue Extension)",
  check(scenario, response): RuleResult {
    const lower = response.toLowerCase();
    if (!lower.includes("pre-emergent") && !lower.includes("preemergent")) {
      return { ruleId: this.id, pass: true, reason: "No pre-emergent recommendation — rule does not apply" };
    }
    if (contains(response, "soil temp", "soil temperature", "50 degree", "55 degree")) {
      return { ruleId: this.id, pass: true, reason: "Pre-emergent recommendation includes soil temperature reference" };
    }
    return { ruleId: this.id, pass: false, reason: "Pre-emergent recommended but no soil temperature threshold mentioned" };
  },
};

const fertAfterSeedingWaiting: Rule = {
  id: "fert-after-seeding-waiting",
  description:
    "Fertilization on recently seeded lawn: must include appropriate waiting period (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const notes = (scenario.profile.notes ?? "").toLowerCase();
    const isRecentlySeeded =
      notes.includes("seed") || notes.includes("overseed") || notes.includes("germina");
    if (!isRecentlySeeded) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    const lower = response.toLowerCase();
    const hasFert = lower.includes("fertilize") || lower.includes("fertilizer");
    if (!hasFert) return { ruleId: this.id, pass: true, reason: "No fertilization recommended — rule not triggered" };
    if (contains(response, "wait", "weeks", "established", "germina", "mow", "first mow")) {
      return { ruleId: this.id, pass: true, reason: "Fertilization recommendation includes waiting period" };
    }
    return { ruleId: this.id, pass: false, reason: "Fertilization recommended for new seed without waiting period" };
  },
};

const mowingHeightInRange: Rule = {
  id: "mowing-height-in-range",
  description: "Mowing height recommendation: must be within the valid range for the grass type (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const range = MOWING_RANGES[scenario.profile.grassType];
    if (!range) return { ruleId: this.id, pass: true, reason: "No mowing range defined for this grass type" };
    // Only inspect sentences that contain mowing-specific language to avoid matching
    // water/irrigation depths (e.g. "apply 1 inch of water", "penetrate 6 inches deep")
    const mowingWords = /\b(?:mow(?:ing)?|cut(?:ting)?|blade|deck|grass\s+height|mowing\s+height|cutting\s+height)\b/i;
    // Contexts where an inch measurement is NOT a mowing height
    const nonMowingCtx = /\b(?:water|rain|irrigat|deep|penetrat|per\s+week|per\s+day|days?|week|month|topsoil|mulch|thatch|reach(?:es)?|tall(?:er)?|grow(?:ing|s|th)?|overgrown|accumulate)\b/i;
    const sentences = response.split(/(?:[.!?]\s+|\n)/);
    for (const sentence of sentences) {
      if (!mowingWords.test(sentence)) continue;
      const matches = [...sentence.matchAll(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|")/gi)];
      for (const match of matches) {
        const num = parseFloat(match[1]);
        if (isNaN(num) || num <= 0 || num >= 12) continue;
        // Skip if the measurement appears in a non-mowing context within ±60 chars
        const idx = match.index ?? 0;
        const ctx = sentence.slice(Math.max(0, idx - 60), idx + match[0].length + 60);
        if (nonMowingCtx.test(ctx)) continue;
        if (num < range[0] || num > range[1]) {
          return {
            ruleId: this.id,
            pass: false,
            reason: `Mowing height ${num}" is outside valid range ${range[0]}–${range[1]}" for ${scenario.profile.grassType}`,
          };
        }
      }
    }
    return { ruleId: this.id, pass: true, reason: "Mowing height within valid range (or not mentioned)" };
  },
};

const fungicideNeedsHumidity: Rule = {
  id: "fungicide-needs-humidity",
  description:
    "Fungicide recommendation: must not appear unless humidity is elevated (>65%) or recent rainfall present (Source: UF/IFAS Extension)",
  check(scenario, response): RuleResult {
    const lower = response.toLowerCase();
    // Only trigger on explicit fungicide/fungal mentions — not generic "disease" mentions
    // which may be awareness notes rather than treatment recommendations
    if (!lower.includes("fungicide") && !lower.includes("fungal treatment") && !lower.includes("apply fungal")) {
      return { ruleId: this.id, pass: true, reason: "No fungicide recommendation — rule does not apply" };
    }
    const humidity = scenario.profile.weatherData?.humidity ?? 100;
    const recentRain = scenario.profile.weatherData?.recentRainfall ?? 1;
    const moisture = scenario.profile.soilMoisture;
    if (humidity >= 65 || recentRain > 0 || moisture === "moist") {
      return { ruleId: this.id, pass: true, reason: "Fungicide recommended with appropriate moisture context" };
    }
    return {
      ruleId: this.id,
      pass: false,
      reason: `Fungicide recommended but humidity is ${humidity}% with no recent rainfall — no moisture indicators`,
    };
  },
};

const overseedSoilTemp: Rule = {
  id: "overseed-soil-temp",
  description:
    "Overseeding recommendation: must reference soil temperature, not only calendar date (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const lower = response.toLowerCase();
    if (!lower.includes("overseed") && !lower.includes("over-seed")) {
      return { ruleId: this.id, pass: true, reason: "No overseeding recommendation — rule does not apply" };
    }
    if (contains(response, "soil temp", "soil temperature", "50 degree", "55 degree", "60 degree")) {
      return { ruleId: this.id, pass: true, reason: "Overseeding recommendation includes soil temperature reference" };
    }
    return { ruleId: this.id, pass: false, reason: "Overseeding recommended but no soil temperature mentioned" };
  },
};

const warmSeasonSoilTempFert: Rule = {
  id: "warm-season-spring-fert-timing",
  description:
    "Warm-season fertilization: must not recommend fertilizing before green-up (soil temp <65°F) (Source: UGA Extension)",
  check(scenario, response): RuleResult {
    const isWarm = WARM_SEASON.includes(scenario.profile.grassType);
    const temp = scenario.profile.weatherData?.temp ?? 99;
    if (!isWarm || temp >= 65) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    const lower = response.toLowerCase();
    const hasFert = lower.includes("fertilize") || lower.includes("apply nitrogen") || lower.includes("feed");
    if (!hasFert) return { ruleId: this.id, pass: true, reason: "No fertilization recommendation" };
    if (contains(response, "wait", "green up", "green-up", "soil temp", "dormant")) {
      return { ruleId: this.id, pass: true, reason: "Fertilization recommendation includes green-up/dormancy caveat" };
    }
    return {
      ruleId: this.id,
      pass: false,
      reason: `Warm-season fertilization recommended at ${temp}°F without green-up or dormancy caveat`,
    };
  },
};

export const ALL_RULES: Rule[] = [
  noHighNInHeat,
  noFertInDormancy,
  limeForLowPh,
  sulfurForHighPh,
  wateringForDrought,
  preEmergentSoilTemp,
  fertAfterSeedingWaiting,
  mowingHeightInRange,
  fungicideNeedsHumidity,
  overseedSoilTemp,
  warmSeasonSoilTempFert,
];
