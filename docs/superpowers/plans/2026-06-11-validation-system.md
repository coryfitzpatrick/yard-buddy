# Validation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-pillar internal validation system that verifies AI lawn care recommendations are agronomically correct without waiting for real-world results.

**Architecture:** A suite of TypeScript scripts under `scripts/validation/` callable with `npx tsx scripts/validation/run.ts`. Pillar 1 (Input Guard) tests bad inputs produce warnings not confident advice. Pillar 2 (Rule Assertions) checks outputs against deterministic agronomic rules. Pillar 3 (LLM-as-Judge) scores outputs against university extension ground truth using GPT-4.

**Tech Stack:** TypeScript, tsx, `openai` npm package, `@anthropic-ai/sdk` (already installed), existing `lib/claude.ts` functions, JSON scenario fixtures, dotenv

---

## File Map

| File | Purpose |
|------|---------|
| `scripts/validation/types.ts` | Shared types: `Scenario`, `Rule`, `JudgeResult`, `PillarResult`, `RunReport` |
| `scripts/validation/input-quality.ts` | Pillar 1: value boundary, incomplete profile, photo quality tests |
| `scripts/validation/rules/assertions.ts` | Pillar 2: 11 deterministic agronomic rule functions |
| `scripts/validation/judge.ts` | Pillar 3: GPT-4 judge runner |
| `scripts/validation/run.ts` | Entry point: runs all three pillars, prints report, exits with code |
| `scripts/validation/scenarios/cool-season/kbg-july-heat.json` | KBG at 92°F — no high-N rule |
| `scripts/validation/scenarios/cool-season/tall-fescue-low-ph.json` | Fescue pH 5.4 — lime rule |
| `scripts/validation/scenarios/cool-season/ryegrass-spring.json` | Ryegrass spring — pre-emergent rule |
| `scripts/validation/scenarios/warm-season/bermuda-dormancy.json` | Bermuda November — no fertilizer rule |
| `scripts/validation/scenarios/warm-season/bermuda-drought.json` | Bermuda drought stress — watering rule |
| `scripts/validation/scenarios/warm-season/st-augustine-summer.json` | St. Augustine summer — fungus/moisture rule |
| `scripts/validation/scenarios/edge-cases/high-ph.json` | pH 7.8 — sulfur rule |
| `scripts/validation/scenarios/edge-cases/recently-seeded.json` | New seed — fertilizer wait rule |
| `scripts/validation/scenarios/edge-cases/drought-cool.json` | Cool-season drought — watering rule |
| `scripts/validation/scenarios/edge-cases/sparse-profile.json` | No grass type — uncertainty acknowledgment |
| `scripts/validation/results/.gitkeep` | Keep results dir in git without tracking outputs |

---

## Task 1: Scaffolding and Shared Types

**Files:**
- Create: `scripts/validation/types.ts`
- Create: `scripts/validation/results/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Install openai package**

```bash
cd /path/to/yard-analyzer
npm install openai
```

Expected: `added N packages`

- [ ] **Step 2: Add results dir to .gitignore**

Open `.gitignore` and append:
```
# Validation results
scripts/validation/results/*.json
```

Do NOT add `scripts/validation/results/.gitkeep` — keep the directory tracked.

- [ ] **Step 3: Create `scripts/validation/results/.gitkeep`**

Empty file. Create it so the directory exists in git.

- [ ] **Step 4: Create `scripts/validation/types.ts`**

```ts
import type { LawnContext } from "../../lib/claude";

export type Scenario = {
  id: string;
  description: string;
  profile: LawnContext;
  groundTruth: {
    mustInclude: string[];
    mustNotInclude: string[];
    source: string;
  };
};

export type RuleResult = {
  ruleId: string;
  pass: boolean;
  reason: string;
};

export type Rule = {
  id: string;
  description: string;
  check: (scenario: Scenario, response: string) => RuleResult;
};

export type InputTestResult = {
  testId: string;
  pass: boolean;
  reason: string;
};

export type JudgeResult = {
  scenarioId: string;
  score: number;
  flags: string[];
  reasoning: string;
};

export type PillarResult =
  | { pillar: 1; results: InputTestResult[] }
  | { pillar: 2; results: RuleResult[] }
  | { pillar: 3; results: JudgeResult[]; mean: number };

export type RunReport = {
  timestamp: string;
  pillars: PillarResult[];
  overallPass: boolean;
  failures: string[];
};
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit scripts/validation/types.ts 2>&1 | head -20
```

Expected: no errors (or only "cannot find module" for lib/claude which is fine at this stage — the file itself has no syntax errors)

- [ ] **Step 6: Commit**

```bash
git add scripts/validation/types.ts scripts/validation/results/.gitkeep .gitignore package.json package-lock.json
git commit -m "chore: scaffold validation system and shared types"
```

---

## Task 2: Scenario Fixtures

**Files:**
- Create: all JSON files under `scripts/validation/scenarios/`

These fixtures are the ground truth for Pillars 2 and 3. Each profile field maps directly to `LawnContext` from `lib/claude.ts`.

- [ ] **Step 1: Create `scripts/validation/scenarios/cool-season/kbg-july-heat.json`**

```json
{
  "id": "kbg-july-heat",
  "description": "Kentucky Bluegrass in extreme July heat — must not recommend high-nitrogen fertilizer",
  "profile": {
    "grassType": "kentucky_bluegrass",
    "zipCode": "66101",
    "weatherSummary": "92°F, humidity 45%, no rain in 7 days",
    "weatherData": {
      "temp": 92,
      "humidity": 45,
      "condition": "Clear",
      "recentRainfall": 0,
      "forecast": [
        { "day": "Today", "high": 92, "low": 72, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Tomorrow", "high": 94, "low": 74, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 3", "high": 91, "low": 73, "condition": "Sunny", "chanceOfRain": 5 },
        { "day": "Day 4", "high": 88, "low": 70, "condition": "Partly Cloudy", "chanceOfRain": 10 },
        { "day": "Day 5", "high": 85, "low": 68, "condition": "Partly Cloudy", "chanceOfRain": 15 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["water", "stress", "heat"],
    "mustNotInclude": ["28-0", "32-0", "high nitrogen", "fertilize now", "apply fertilizer this week"],
    "source": "https://extension.psu.edu/lawn-fertilization-schedule"
  }
}
```

- [ ] **Step 2: Create `scripts/validation/scenarios/cool-season/tall-fescue-low-ph.json`**

```json
{
  "id": "tall-fescue-low-ph",
  "description": "Tall fescue with pH 5.4 — must recommend lime or pH correction",
  "profile": {
    "grassType": "tall_fescue",
    "zipCode": "27601",
    "soilPh": 5.4,
    "nitrogenPpm": 12,
    "weatherSummary": "68°F, spring conditions",
    "weatherData": {
      "temp": 68,
      "humidity": 60,
      "condition": "Partly Cloudy",
      "recentRainfall": 0.5,
      "forecast": [
        { "day": "Today", "high": 68, "low": 48, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Tomorrow", "high": 72, "low": 50, "condition": "Sunny", "chanceOfRain": 10 },
        { "day": "Day 3", "high": 70, "low": 49, "condition": "Sunny", "chanceOfRain": 5 },
        { "day": "Day 4", "high": 73, "low": 52, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 5", "high": 74, "low": 53, "condition": "Partly Cloudy", "chanceOfRain": 15 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["lime", "pH"],
    "mustNotInclude": [],
    "source": "https://extension.psu.edu/soil-ph-and-lime-requirements"
  }
}
```

- [ ] **Step 3: Create `scripts/validation/scenarios/cool-season/ryegrass-spring.json`**

```json
{
  "id": "ryegrass-spring",
  "description": "Perennial ryegrass in early spring — pre-emergent should cite soil temperature not calendar",
  "profile": {
    "grassType": "ryegrass",
    "zipCode": "45201",
    "weatherSummary": "52°F, early April",
    "notes": "Crabgrass was a problem last summer",
    "weatherData": {
      "temp": 52,
      "humidity": 65,
      "condition": "Partly Cloudy",
      "recentRainfall": 0.2,
      "forecast": [
        { "day": "Today", "high": 52, "low": 38, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Tomorrow", "high": 55, "low": 40, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 3", "high": 58, "low": 42, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 4", "high": 60, "low": 44, "condition": "Partly Cloudy", "chanceOfRain": 10 },
        { "day": "Day 5", "high": 57, "low": 43, "condition": "Partly Cloudy", "chanceOfRain": 25 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["soil temperature", "pre-emergent"],
    "mustNotInclude": [],
    "source": "https://www.purdue.edu/hla/sites/yardandgarden/crabgrass-control/"
  }
}
```

- [ ] **Step 4: Create `scripts/validation/scenarios/warm-season/bermuda-dormancy.json`**

```json
{
  "id": "bermuda-dormancy",
  "description": "Bermudagrass in late November dormancy — must not recommend fertilization",
  "profile": {
    "grassType": "bermuda",
    "zipCode": "30301",
    "weatherSummary": "44°F, late November, grass dormant",
    "weatherData": {
      "temp": 44,
      "humidity": 55,
      "condition": "Clear",
      "recentRainfall": 0,
      "forecast": [
        { "day": "Today", "high": 44, "low": 30, "condition": "Clear", "chanceOfRain": 0 },
        { "day": "Tomorrow", "high": 46, "low": 32, "condition": "Clear", "chanceOfRain": 0 },
        { "day": "Day 3", "high": 48, "low": 33, "condition": "Partly Cloudy", "chanceOfRain": 10 },
        { "day": "Day 4", "high": 50, "low": 35, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Day 5", "high": 47, "low": 31, "condition": "Clear", "chanceOfRain": 0 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["dormant", "dormancy"],
    "mustNotInclude": ["fertilize", "apply nitrogen", "feed your lawn"],
    "source": "https://extension.uga.edu/publications/detail.html?number=C816"
  }
}
```

- [ ] **Step 5: Create `scripts/validation/scenarios/warm-season/bermuda-drought.json`**

```json
{
  "id": "bermuda-drought",
  "description": "Bermudagrass in severe drought — must recommend irrigation",
  "profile": {
    "grassType": "bermuda",
    "zipCode": "85001",
    "soilMoisture": "dry",
    "weatherSummary": "98°F, humidity 20%, no rain in 14 days",
    "weatherData": {
      "temp": 98,
      "humidity": 20,
      "condition": "Sunny",
      "recentRainfall": 0,
      "forecast": [
        { "day": "Today", "high": 98, "low": 80, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Tomorrow", "high": 100, "low": 82, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 3", "high": 99, "low": 81, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 4", "high": 97, "low": 79, "condition": "Sunny", "chanceOfRain": 5 },
        { "day": "Day 5", "high": 96, "low": 78, "condition": "Sunny", "chanceOfRain": 5 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["water", "irrigat"],
    "mustNotInclude": ["fertilize", "weed control this week"],
    "source": "https://extension.arizona.edu/sites/extension.arizona.edu/files/pubs/az1569-2011.pdf"
  }
}
```

- [ ] **Step 6: Create `scripts/validation/scenarios/warm-season/st-augustine-summer.json`**

```json
{
  "id": "st-augustine-summer",
  "description": "St. Augustine in humid summer — fungicide should not be recommended without moisture stress indicators",
  "profile": {
    "grassType": "st_augustine",
    "zipCode": "77001",
    "weatherSummary": "88°F, humidity 85%, recent rain",
    "soilMoisture": "moist",
    "weatherData": {
      "temp": 88,
      "humidity": 85,
      "condition": "Partly Cloudy",
      "recentRainfall": 1.2,
      "forecast": [
        { "day": "Today", "high": 88, "low": 74, "condition": "Partly Cloudy", "chanceOfRain": 40 },
        { "day": "Tomorrow", "high": 87, "low": 73, "condition": "Thunderstorms", "chanceOfRain": 70 },
        { "day": "Day 3", "high": 86, "low": 72, "condition": "Partly Cloudy", "chanceOfRain": 50 },
        { "day": "Day 4", "high": 89, "low": 75, "condition": "Partly Cloudy", "chanceOfRain": 30 },
        { "day": "Day 5", "high": 90, "low": 76, "condition": "Sunny", "chanceOfRain": 20 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": [],
    "mustNotInclude": [],
    "source": "https://edis.ifas.ufl.edu/publication/EP006"
  }
}
```

- [ ] **Step 7: Create `scripts/validation/scenarios/edge-cases/high-ph.json`**

```json
{
  "id": "high-ph",
  "description": "High soil pH 7.8 — must recommend sulfur or acidifying amendment",
  "profile": {
    "grassType": "kentucky_bluegrass",
    "zipCode": "80202",
    "soilPh": 7.8,
    "weatherSummary": "72°F, spring",
    "weatherData": {
      "temp": 72,
      "humidity": 40,
      "condition": "Sunny",
      "recentRainfall": 0,
      "forecast": [
        { "day": "Today", "high": 72, "low": 48, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Tomorrow", "high": 74, "low": 50, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 3", "high": 75, "low": 51, "condition": "Partly Cloudy", "chanceOfRain": 10 },
        { "day": "Day 4", "high": 71, "low": 47, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Day 5", "high": 68, "low": 45, "condition": "Cloudy", "chanceOfRain": 30 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["sulfur", "pH"],
    "mustNotInclude": [],
    "source": "https://extension.psu.edu/soil-ph-and-lime-requirements"
  }
}
```

- [ ] **Step 8: Create `scripts/validation/scenarios/edge-cases/recently-seeded.json`**

```json
{
  "id": "recently-seeded",
  "description": "Recently seeded lawn — fertilization recommendation must include a waiting period",
  "profile": {
    "grassType": "tall_fescue",
    "zipCode": "39201",
    "notes": "Overseeded the lawn 2 weeks ago, seedlings just germinating",
    "weatherSummary": "65°F, fall",
    "weatherData": {
      "temp": 65,
      "humidity": 60,
      "condition": "Partly Cloudy",
      "recentRainfall": 0.3,
      "forecast": [
        { "day": "Today", "high": 65, "low": 48, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Tomorrow", "high": 67, "low": 50, "condition": "Sunny", "chanceOfRain": 10 },
        { "day": "Day 3", "high": 68, "low": 51, "condition": "Sunny", "chanceOfRain": 5 },
        { "day": "Day 4", "high": 66, "low": 49, "condition": "Partly Cloudy", "chanceOfRain": 15 },
        { "day": "Day 5", "high": 64, "low": 47, "condition": "Partly Cloudy", "chanceOfRain": 20 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["wait", "weeks", "established", "germina"],
    "mustNotInclude": ["apply fertilizer now", "fertilize immediately"],
    "source": "https://extension.psu.edu/seeding-a-new-lawn"
  }
}
```

- [ ] **Step 9: Create `scripts/validation/scenarios/edge-cases/drought-cool.json`**

```json
{
  "id": "drought-cool",
  "description": "Cool-season grass in drought — watering advice must be present",
  "profile": {
    "grassType": "tall_fescue",
    "zipCode": "64101",
    "soilMoisture": "dry",
    "weatherSummary": "84°F, humidity 30%, no rain in 10 days",
    "weatherData": {
      "temp": 84,
      "humidity": 30,
      "condition": "Sunny",
      "recentRainfall": 0,
      "forecast": [
        { "day": "Today", "high": 84, "low": 62, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Tomorrow", "high": 86, "low": 64, "condition": "Sunny", "chanceOfRain": 0 },
        { "day": "Day 3", "high": 87, "low": 65, "condition": "Sunny", "chanceOfRain": 5 },
        { "day": "Day 4", "high": 85, "low": 63, "condition": "Partly Cloudy", "chanceOfRain": 10 },
        { "day": "Day 5", "high": 82, "low": 60, "condition": "Partly Cloudy", "chanceOfRain": 20 }
      ]
    }
  },
  "groundTruth": {
    "mustInclude": ["water", "irrigat"],
    "mustNotInclude": [],
    "source": "https://extension.psu.edu/watering-the-lawn"
  }
}
```

- [ ] **Step 10: Create `scripts/validation/scenarios/edge-cases/sparse-profile.json`**

```json
{
  "id": "sparse-profile",
  "description": "Minimal profile with unknown grass type — AI must acknowledge uncertainty",
  "profile": {
    "grassType": "unknown",
    "zipCode": "10001",
    "weatherSummary": "70°F, partly cloudy"
  },
  "groundTruth": {
    "mustInclude": ["unknown", "identify", "uncertain", "not sure", "cannot determine"],
    "mustNotInclude": [],
    "source": "internal"
  }
}
```

- [ ] **Step 11: Commit all scenario fixtures**

```bash
git add scripts/validation/scenarios/
git commit -m "feat: add validation scenario fixtures (10 scenarios across cool/warm/edge)"
```

---

## Task 3: Rule Assertion Engine (Pillar 2)

**Files:**
- Create: `scripts/validation/rules/assertions.ts`

- [ ] **Step 1: Create `scripts/validation/rules/assertions.ts`**

```ts
import type { Rule, RuleResult, Scenario } from "../types";

// Helper: case-insensitive search in response text
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

// Mowing height ranges by grass type (inches) — source: Purdue Extension
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

// Source: https://extension.psu.edu/lawn-fertilization-schedule
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
    const found = highNPatterns.find((p) => response.toLowerCase().includes(p.toLowerCase()));
    if (found) {
      return { ruleId: this.id, pass: false, reason: `Found high-N indicator "${found}" for cool-season grass at ${temp}°F` };
    }
    return { ruleId: this.id, pass: true, reason: "No high-N recommendation found during heat stress" };
  },
};

// Source: https://extension.uga.edu/publications/detail.html?number=C816
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

// Source: https://extension.psu.edu/soil-ph-and-lime-requirements
const limeForLowPh: Rule = {
  id: "lime-for-low-ph",
  description: "Soil pH <6.0: lime or acidification treatment must be mentioned (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const ph = scenario.profile.soilPh;
    if (ph == null || ph >= 6.0) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    if (contains(response, "lime", "limestone", "dolomite", "calcitic")) {
      return { ruleId: this.id, pass: true, reason: "Lime recommendation found for low pH" };
    }
    return { ruleId: this.id, pass: false, reason: `pH is ${ph} but no lime recommendation found` };
  },
};

// Source: https://extension.psu.edu/soil-ph-and-lime-requirements
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

// Source: https://extension.psu.edu/watering-the-lawn
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

// Source: https://www.purdue.edu/hla/sites/yardandgarden/crabgrass-control/
const preEmergentSoilTemp: Rule = {
  id: "pre-emergent-soil-temp",
  description:
    "Pre-emergent weed control recommendation: must mention soil temperature threshold, not only calendar date (Source: Purdue Extension)",
  check(scenario, response): RuleResult {
    const lower = response.toLowerCase();
    if (!lower.includes("pre-emergent") && !lower.includes("preemergent")) {
      return { ruleId: this.id, pass: true, reason: "No pre-emergent recommendation — rule does not apply" };
    }
    if (contains(response, "soil temp", "soil temperature", "55", "50 degree", "55 degree")) {
      return { ruleId: this.id, pass: true, reason: "Pre-emergent recommendation includes soil temperature reference" };
    }
    return { ruleId: this.id, pass: false, reason: "Pre-emergent recommended but no soil temperature threshold mentioned" };
  },
};

// Source: https://extension.psu.edu/seeding-a-new-lawn
const fertAfterSeedingWaiting: Rule = {
  id: "fert-after-seeding-waiting",
  description:
    "Fertilization on recently seeded lawn: must include appropriate waiting period (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const notes = (scenario.profile.notes ?? "").toLowerCase();
    const isRecentlySeedled =
      notes.includes("seed") || notes.includes("overseed") || notes.includes("germina");
    if (!isRecentlySeedled) return { ruleId: this.id, pass: true, reason: "Rule does not apply" };
    const lower = response.toLowerCase();
    const hasFert = lower.includes("fertilize") || lower.includes("fertilizer");
    if (!hasFert) return { ruleId: this.id, pass: true, reason: "No fertilization recommended — rule not triggered" };
    if (contains(response, "wait", "weeks", "established", "germina", "mow", "first mow")) {
      return { ruleId: this.id, pass: true, reason: "Fertilization recommendation includes waiting period" };
    }
    return { ruleId: this.id, pass: false, reason: "Fertilization recommended for new seed without waiting period" };
  },
};

// Source: https://extension.psu.edu/mowing-the-lawn
const mowingHeightInRange: Rule = {
  id: "mowing-height-in-range",
  description: "Mowing height recommendation: must be within the valid range for the grass type (Source: Penn State Extension)",
  check(scenario, response): RuleResult {
    const range = MOWING_RANGES[scenario.profile.grassType];
    if (!range) return { ruleId: this.id, pass: true, reason: "No mowing range defined for this grass type" };
    // Extract numbers followed by " inch" or `"`
    const matches = response.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|'|in\b)/gi) ?? [];
    for (const match of matches) {
      const num = parseFloat(match);
      if (!isNaN(num) && num > 0 && num < 12) {
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

// Source: https://edis.ifas.ufl.edu/publication/PP321
const fungicideNeedsHumidity: Rule = {
  id: "fungicide-needs-humidity",
  description:
    "Fungicide recommendation: must not appear unless humidity is elevated (>65%) or recent rainfall present (Source: UF/IFAS Extension)",
  check(scenario, response): RuleResult {
    const lower = response.toLowerCase();
    if (!lower.includes("fungicide") && !lower.includes("fungal") && !lower.includes("disease")) {
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

// Source: https://extension.psu.edu/overseeding-a-lawn
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

// Source: https://extension.uga.edu/publications/detail.html?number=C816
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
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

```bash
cd /path/to/yard-analyzer
npx tsx --tsconfig tsconfig.json -e "import './scripts/validation/rules/assertions'" 2>&1
```

Expected: no output (successful import, no errors)

- [ ] **Step 3: Commit**

```bash
git add scripts/validation/rules/assertions.ts
git commit -m "feat: add rule assertion engine with 11 agronomic rules"
```

---

## Task 4: Input Guard Tests (Pillar 1)

**Files:**
- Create: `scripts/validation/input-quality.ts`

- [ ] **Step 1: Create `scripts/validation/input-quality.ts`**

```ts
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { generateRecommendations } from "../../lib/claude";
import type { LawnContext } from "../../lib/claude";
import type { InputTestResult } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Minimal valid 1×1 pixel PNGs for photo quality tests (base64-encoded)
// Black pixel PNG
const BLACK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// White pixel PNG
const WHITE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

// Calls Claude Haiku directly with base64 image data — same logic as validateLawnImages in lib/claude.ts
async function validateBase64Images(
  images: Array<{ data: string; mediaType: "image/png" | "image/jpeg" }>
): Promise<{ valid: boolean; feedback: string | null }> {
  const imageContent = images.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
  }));
  const message = await anthropic.messages.create({
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
1. SUBJECT: Do the images show lawn, grass, or outdoor ground cover?
2. QUALITY: Are the images clear and in focus, well-lit, and close enough to see the grass condition?
3. VARIETY: If multiple images, do they show different angles or areas?

Return JSON only, no other text:
{
  "valid": true or false,
  "feedback": null or "explanation"
}`,
          },
        ],
      },
    ],
  });
  try {
    const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    const json = JSON.parse(text.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
    return { valid: json.valid === true, feedback: json.feedback ?? null };
  } catch {
    return { valid: true, feedback: null };
  }
}

async function runInputTest(
  testId: string,
  run: () => Promise<string | null>
): Promise<InputTestResult> {
  try {
    const response = await run();
    return { testId, pass: true, reason: response ?? "OK" };
  } catch (err) {
    return { testId, pass: false, reason: String(err) };
  }
}

// Assert that a response contains uncertainty flags, not confident specific advice
function assertUncertain(response: string, context: string): void {
  const lower = response.toLowerCase();
  const confidentPatterns = [
    /apply \d+ lb/i,
    /fertilize (now|this week|immediately)/i,
    /use \d+-\d+-\d+/i,
  ];
  const uncertainPatterns = [
    "unknown", "unable to", "cannot", "don't know", "not sure",
    "please provide", "would help to know", "unclear", "uncertain",
    "not specified", "insufficient", "more information",
  ];
  const isConfident = confidentPatterns.some((p) => p.test(response));
  const isUncertain = uncertainPatterns.some((p) => lower.includes(p));
  if (isConfident && !isUncertain) {
    throw new Error(`Confident specific advice for ${context} without acknowledging uncertainty`);
  }
}

export async function runInputGuardTests(): Promise<InputTestResult[]> {
  const results: InputTestResult[] = [];

  // --- Value boundary tests ---

  // pH boundary: pH 0
  results.push(
    await runInputTest("boundary-ph-zero", async () => {
      const ctx: LawnContext = { grassType: "tall_fescue", zipCode: "27601", soilPh: 0 };
      const recs = await generateRecommendations(ctx);
      const text = JSON.stringify(recs);
      assertUncertain(text, "pH=0");
      return "pH=0 handled with uncertainty";
    })
  );

  // pH boundary: pH 14 (impossible)
  results.push(
    await runInputTest("boundary-ph-fourteen", async () => {
      const ctx: LawnContext = { grassType: "tall_fescue", zipCode: "27601", soilPh: 14 };
      const recs = await generateRecommendations(ctx);
      const text = JSON.stringify(recs);
      assertUncertain(text, "pH=14");
      return "pH=14 handled with uncertainty";
    })
  );

  // Nitrogen: impossible value
  results.push(
    await runInputTest("boundary-nitrogen-extreme", async () => {
      const ctx: LawnContext = {
        grassType: "tall_fescue",
        zipCode: "27601",
        nitrogenPpm: 99999,
      };
      const recs = await generateRecommendations(ctx);
      const text = JSON.stringify(recs);
      assertUncertain(text, "nitrogen=99999");
      return "nitrogen=99999 handled with uncertainty";
    })
  );

  // Square footage: 0
  results.push(
    await runInputTest("boundary-sqft-zero", async () => {
      const ctx: LawnContext = {
        grassType: "kentucky_bluegrass",
        zipCode: "66101",
        yardSizeSqft: 0,
      };
      const recs = await generateRecommendations(ctx);
      const text = JSON.stringify(recs);
      assertUncertain(text, "sqft=0");
      return "sqft=0 handled";
    })
  );

  // --- Incomplete profile tests ---

  // Unknown grass type
  results.push(
    await runInputTest("incomplete-unknown-grass", async () => {
      const ctx: LawnContext = { grassType: "unknown", zipCode: "10001" };
      const recs = await generateRecommendations(ctx);
      const text = JSON.stringify(recs);
      const lower = text.toLowerCase();
      const hasAcknowledgment =
        lower.includes("unknown") ||
        lower.includes("identify") ||
        lower.includes("grass type") ||
        lower.includes("unable to determine");
      if (!hasAcknowledgment) {
        throw new Error("Unknown grass type did not produce acknowledgment of uncertainty");
      }
      return "Unknown grass type acknowledged";
    })
  );

  // No location at all (empty zip)
  results.push(
    await runInputTest("incomplete-no-location", async () => {
      const ctx: LawnContext = { grassType: "bermuda", zipCode: "" };
      // Should either handle gracefully or note missing location
      const recs = await generateRecommendations(ctx);
      if (!recs || recs.length === 0) {
        throw new Error("Returned empty recommendations with no error message");
      }
      return `Got ${recs.length} recommendations with empty ZIP (graceful)`;
    })
  );

  // Completely empty profile (minimum required fields only)
  results.push(
    await runInputTest("incomplete-empty-profile", async () => {
      const ctx: LawnContext = { grassType: "unknown", zipCode: "00000" };
      const recs = await generateRecommendations(ctx);
      if (!recs || recs.length === 0) {
        throw new Error("Returned empty recommendations for empty profile");
      }
      return `Got ${recs.length} recommendations for minimal profile`;
    })
  );

  // --- Photo quality tests ---

  // Solid black image — should return valid=false
  results.push(
    await runInputTest("photo-solid-black", async () => {
      const result = await validateBase64Images([{ data: BLACK_PNG, mediaType: "image/png" }]);
      if (result.valid) {
        throw new Error("Solid black 1×1 PNG was accepted as a valid lawn photo");
      }
      return `Correctly rejected: ${result.feedback}`;
    })
  );

  // Solid white image — should return valid=false
  results.push(
    await runInputTest("photo-solid-white", async () => {
      const result = await validateBase64Images([{ data: WHITE_PNG, mediaType: "image/png" }]);
      if (result.valid) {
        throw new Error("Solid white 1×1 PNG was accepted as a valid lawn photo");
      }
      return `Correctly rejected: ${result.feedback}`;
    })
  );

  return results;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsx --tsconfig tsconfig.json -e "console.log('types ok')" 2>&1
```

Expected: `types ok`

- [ ] **Step 3: Commit**

```bash
git add scripts/validation/input-quality.ts
git commit -m "feat: add input guard tests (Pillar 1)"
```

---

## Task 5: LLM-as-Judge Runner (Pillar 3)

**Files:**
- Create: `scripts/validation/judge.ts`

- [ ] **Step 1: Create `scripts/validation/judge.ts`**

```ts
import "dotenv/config";
import OpenAI from "openai";
import { generateRecommendations } from "../../lib/claude";
import type { Scenario, JudgeResult } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JUDGE_SYSTEM = `You are a turfgrass expert with 20+ years of experience and deep knowledge of university extension recommendations. You evaluate AI-generated lawn care advice for agronomic accuracy.`;

async function judgeScenario(scenario: Scenario): Promise<JudgeResult> {
  // Step 1: get Claude's recommendation for this scenario
  const recs = await generateRecommendations(scenario.profile);
  const responseText = JSON.stringify(recs, null, 2);

  // Step 2: ask GPT-4 to score it against ground truth
  const prompt = `A homeowner's AI lawn care advisor produced the following recommendations.

## Yard Profile
${JSON.stringify(scenario.profile, null, 2)}

## AI Recommendations
${responseText}

## Ground Truth (from university extension research)
Things the recommendation SHOULD address: ${JSON.stringify(scenario.groundTruth.mustInclude)}
Things the recommendation MUST NOT include: ${JSON.stringify(scenario.groundTruth.mustNotInclude)}
Source: ${scenario.groundTruth.source}

## Your Task
Score this recommendation 0–100 for agronomic correctness given the yard profile above.
- 90–100: Excellent. Accurate, specific, safe, matches extension guidance.
- 70–89: Good. Mostly correct with minor omissions or imprecise language.
- 50–69: Acceptable but has notable gaps or vague advice.
- Below 50: Contains incorrect, unsafe, or missing critical guidance.

Return ONLY valid JSON, no other text:
{
  "score": <number 0-100>,
  "flags": ["<specific issue 1>", "<specific issue 2>"],
  "reasoning": "<2-3 sentence explanation>"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(raw) as { score?: number; flags?: string[]; reasoning?: string };
  return {
    scenarioId: scenario.id,
    score: parsed.score ?? 0,
    flags: parsed.flags ?? [],
    reasoning: parsed.reasoning ?? "",
  };
}

export async function runJudge(scenarios: Scenario[]): Promise<{ results: JudgeResult[]; mean: number }> {
  const results: JudgeResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  Judging ${scenario.id}... `);
    const result = await judgeScenario(scenario);
    process.stdout.write(`${result.score}/100\n`);
    results.push(result);
  }
  const mean = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  return { results, mean };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/validation/judge.ts
git commit -m "feat: add LLM-as-judge runner (Pillar 3)"
```

---

## Task 6: Run.ts Entry Point

**Files:**
- Create: `scripts/validation/run.ts`

- [ ] **Step 1: Create `scripts/validation/run.ts`**

```ts
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { generateRecommendations } from "../../lib/claude";
import { ALL_RULES } from "./rules/assertions";
import { runInputGuardTests } from "./input-quality";
import { runJudge } from "./judge";
import type { Scenario, RunReport, PillarResult } from "./types";

const SCENARIOS_DIR = path.join(__dirname, "scenarios");
const RESULTS_DIR = path.join(__dirname, "results");
const BASELINE_FILE = path.join(RESULTS_DIR, "baseline.json");
const SCORE_THRESHOLD = 60;
const REGRESSION_DELTA = 5;

function loadScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) {
        scenarios.push(JSON.parse(fs.readFileSync(full, "utf8")) as Scenario);
      }
    }
  };
  walk(SCENARIOS_DIR);
  return scenarios;
}

function printHeader(date: string) {
  console.log(`\nYard Analyzer Validation Report — ${date}`);
  console.log("─".repeat(60));
}

function printPillar1(results: { testId: string; pass: boolean; reason: string }[]) {
  const passed = results.filter((r) => r.pass).length;
  console.log(`Pillar 1: Input Guard Tests     ${passed}/${results.length} passed`);
  results.filter((r) => !r.pass).forEach((r) => {
    console.log(`  FAIL [input] ${r.testId}: ${r.reason}`);
  });
}

function printPillar2(results: { ruleId: string; pass: boolean; reason: string }[]) {
  const passed = results.filter((r) => r.pass).length;
  console.log(`Pillar 2: Rule Assertions       ${passed}/${results.length} passed`);
  results.filter((r) => !r.pass).forEach((r) => {
    console.log(`  FAIL [rule] ${r.ruleId}: ${r.reason}`);
  });
}

function printPillar3(results: { scenarioId: string; score: number; flags: string[] }[], mean: number) {
  console.log(`Pillar 3: LLM-as-Judge          ${mean.toFixed(1)} / 100 mean score`);
  results.filter((r) => r.score < SCORE_THRESHOLD).forEach((r) => {
    console.log(`  LOW [judge] ${r.scenarioId}: score=${r.score} flags=${r.flags.join(", ")}`);
  });
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  printHeader(date);

  const scenarios = loadScenarios();
  console.log(`Loaded ${scenarios.length} scenarios\n`);

  const failures: string[] = [];
  const pillars: PillarResult[] = [];

  // --- Pillar 1: Input Guard ---
  console.log("Running Pillar 1: Input Guard Tests...");
  const inputResults = await runInputGuardTests();
  pillars.push({ pillar: 1, results: inputResults });
  printPillar1(inputResults);
  inputResults.filter((r) => !r.pass).forEach((r) => failures.push(`[input] ${r.testId}`));

  // --- Pillar 2: Rule Assertions ---
  console.log("\nRunning Pillar 2: Rule Assertions...");
  const ruleResults: { ruleId: string; pass: boolean; reason: string }[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.id}... `);
    const recs = await generateRecommendations(scenario.profile);
    const responseText = JSON.stringify(recs);
    for (const rule of ALL_RULES) {
      const result = rule.check(scenario, responseText);
      ruleResults.push(result);
    }
    process.stdout.write("done\n");
  }
  pillars.push({ pillar: 2, results: ruleResults });
  printPillar2(ruleResults);
  ruleResults.filter((r) => !r.pass).forEach((r) => failures.push(`[rule] ${r.ruleId}`));

  // --- Pillar 3: LLM-as-Judge ---
  if (!process.env.OPENAI_API_KEY) {
    console.log("\nPillar 3: LLM-as-Judge         SKIPPED (no OPENAI_API_KEY)");
  } else {
    console.log("\nRunning Pillar 3: LLM-as-Judge...");
    const { results: judgeResults, mean } = await runJudge(scenarios);
    pillars.push({ pillar: 3, results: judgeResults, mean });
    printPillar3(judgeResults, mean);
    judgeResults.filter((r) => r.score < SCORE_THRESHOLD).forEach((r) =>
      failures.push(`[judge-low] ${r.scenarioId}`)
    );

    // Regression check against baseline
    if (fs.existsSync(BASELINE_FILE)) {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as { mean: number };
      if (mean < baseline.mean - REGRESSION_DELTA) {
        failures.push(`[regression] mean score dropped from ${baseline.mean.toFixed(1)} to ${mean.toFixed(1)}`);
      }
    } else {
      // First run — save baseline
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(BASELINE_FILE, JSON.stringify({ mean, date }, null, 2));
      console.log(`\nBaseline saved: ${mean.toFixed(1)}/100`);
    }
  }

  // --- Report ---
  const report: RunReport = {
    timestamp: new Date().toISOString(),
    pillars,
    overallPass: failures.length === 0,
    failures,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, `${date}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log("\n" + "─".repeat(60));
  if (failures.length === 0) {
    console.log("Overall: PASS");
    console.log(`Results written to ${outFile}`);
    process.exit(0);
  } else {
    console.log(`Overall: FAIL (${failures.length} issue${failures.length > 1 ? "s" : ""})`);
    failures.forEach((f) => console.log(`  ${f}`));
    console.log(`Results written to ${outFile}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Validation runner crashed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add convenience script to package.json**

In `package.json`, add to the `"scripts"` block:
```json
"validate": "tsx scripts/validation/run.ts"
```

- [ ] **Step 3: Add OPENAI_API_KEY to .env.local**

```bash
vercel env add OPENAI_API_KEY preview production
```

When prompted, paste your OpenAI API key. Then:

```bash
vercel env pull .env.local --yes
```

- [ ] **Step 4: Run the validation suite (Pillar 1 + 2 only first, no OpenAI key needed)**

```bash
OPENAI_API_KEY="" npx tsx scripts/validation/run.ts 2>&1 | head -60
```

Expected output structure:
```
Yard Analyzer Validation Report — 2026-XX-XX
────────────────────────────────────────────────────────────
Loaded 10 scenarios

Running Pillar 1: Input Guard Tests...
Pillar 1: Input Guard Tests     N/9 passed
...
Running Pillar 2: Rule Assertions...
Pillar 2: Rule Assertions       N/M passed
...
Pillar 3: LLM-as-Judge         SKIPPED (no OPENAI_API_KEY)
```

Investigate any failures — a failure here means the AI produces confident bad advice for a bad input, or a rule is violated.

- [ ] **Step 5: Run full suite including GPT-4 judge**

```bash
npx tsx scripts/validation/run.ts 2>&1
```

This costs ~$0.10–$0.20 in OpenAI credits. Expected: a baseline.json is created in `scripts/validation/results/`.

- [ ] **Step 6: Commit**

```bash
git add scripts/validation/run.ts scripts/validation/judge.ts package.json
git commit -m "feat: add validation runner and LLM-as-judge (Pillar 3) — completes validation system"
```

---

## Self-Review Notes

- All `LawnContext` fields used in fixtures are actual fields from `lib/claude.ts` — verified against the type definition
- `generateRecommendations` and `validateLawnImages` are the actual exported function names from `lib/claude.ts`
- Photo tests bypass `validateLawnImages` (which expects HTTPS URLs) by calling the Anthropic client directly with base64 — avoids needing external image hosting
- Pillar 3 is skippable without `OPENAI_API_KEY` so Pillars 1+2 can run cheaply in CI
- All 10 scenario fixtures have `grassType` values that are valid `GrassType` literals from `types/index.ts`
- The `__dirname` approach in `run.ts` works with `tsx` — verified pattern from existing scripts
