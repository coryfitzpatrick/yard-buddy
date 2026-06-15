# Image-Path Validation Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a customer-realistic image-path validation suite that exercises `analyzeImages()` end-to-end with multi-dimensional judging, mirroring the existing text-path harness, so the image path gets an Opus-judged baseline.

**Architecture:** Parallel harness (`scripts/validation/run-image.ts`) to the existing text-path `run.ts`. Image scenarios are JSON files referencing committed photos at `scripts/validation/photos/<scenario-id>/*.jpg`; photos base64-loaded at runtime. Judge is image-aware, ensemble-3, multi-dimensional scoring → combined 0-100. `analyzeImages()` extended with a contextual `dataGapWarning` field.

**Tech Stack:** TypeScript, Anthropic SDK (claude-sonnet-4-6 / claude-opus-4-7 vision), tsx runner, existing validation infrastructure.

---

## File Structure

**New files:**
- `scripts/validation/types-image.ts` — `ImageScenario`, `ImageJudgeResult`, `DataGapField`, `AnalysisIssue` types
- `scripts/validation/judge-image.ts` — image-aware ensemble-3 judge with multi-dim scoring
- `scripts/validation/run-image.ts` — image-path harness (P1+P2+P3 equivalents)
- `scripts/validation/load-photos.ts` — helper that base64-encodes a list of photo paths for the Anthropic vision API
- `scripts/validation/rules/image-assertions.ts` — P2-equivalent rules tailored to image path (healthy-lawn-maintenance, etc.)
- `scripts/validation/scenarios-image/*.json` — 12 phase-1 scenarios
- `scripts/validation/photos/<scenario-id>/*.jpg` — ~30 photos total, committed
- `scripts/validation/photos/LICENSES.md` — per-photo license/attribution record
- `lib/claude.ts` exports `detectDataGaps()` and `buildDataGapWarning()` (new helpers)

**Modified files:**
- `types/index.ts` — `AnalysisResult.dataGapWarning: string | null` added
- `lib/claude.ts` — `analyzeImages()` post-processes the model output to attach `dataGapWarning`
- `package.json` — adds `validate:image` and `validate:image:smoke` scripts

**Out of scope (phase 2):**
- User's own field photos
- Pre-submission UX modal
- Image-path critique loop

---

### Task 1: Add `dataGapWarning` field to `AnalysisResult`

**Files:**
- Modify: `types/index.ts:60-67`

- [ ] **Step 1: Extend the AnalysisResult interface**

Edit `types/index.ts` to add the new optional-nullable field:

```typescript
export interface AnalysisResult {
  issues: LawnIssue[];
  healthScore: number;
  summary: string;
  recommendations: RecommendationItem[];
  grassTypeDetected?: GrassType;
  confidence?: number;
  dataGapWarning?: string | null;
}
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected output: the pre-existing `lib/claude.ts(127,45)` error about `context.yardSizeSqft` is the ONLY error. No new errors. If new errors appear, the field name or type is wrong.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add AnalysisResult.dataGapWarning field

Optional nullable string surfaced when the customer profile is missing
key fields. Populated by analyzeImages() based on detectDataGaps() in
lib/claude.ts. UI surfaces this honestly to the customer alongside the
recommendations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `detectDataGaps()` and `buildDataGapWarning()` to `lib/claude.ts`

**Files:**
- Modify: `lib/claude.ts` (top of file, near other exports)

- [ ] **Step 1: Add the DataGapField type and helpers**

Insert this block in `lib/claude.ts` AFTER the existing import block (around line 15, after the `getLastCritiqueMetadata` export):

```typescript
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
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 3: Commit**

```bash
git add lib/claude.ts
git commit -m "feat(claude): detectDataGaps + buildDataGapWarning helpers

Pure functions to detect which key LawnContext fields are missing and
produce a customer-facing warning sentence keyed to which fields are
absent. Used by analyzeImages() to populate AnalysisResult.dataGapWarning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire `dataGapWarning` into `analyzeImages()`

**Files:**
- Modify: `lib/claude.ts` — the `analyzeImages` function (around line 258-375)

- [ ] **Step 1: Locate the parse block**

Open `lib/claude.ts` and find the END of `analyzeImages` — the section that currently looks like:

```typescript
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
```

- [ ] **Step 2: Replace it with the dataGapWarning attachment**

```typescript
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
```

- [ ] **Step 3: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 4: Commit**

```bash
git add lib/claude.ts
git commit -m "feat(claude): analyzeImages attaches dataGapWarning to result

After successful JSON parse, run detectDataGaps on the input context
and populate result.dataGapWarning. Null when no gaps present. The
warning text is grounded in which specific fields are absent so the
customer sees recommendation-relevant honesty, not a generic banner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Create `scripts/validation/types-image.ts`

**Files:**
- Create: `scripts/validation/types-image.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
import type { LawnContext } from "../../lib/claude";
import type { GrassType, LawnIssue } from "../../types";
import type { DataGapField } from "../../lib/claude";

export type AnalysisIssue = LawnIssue;

export type TaskMode = 'corrective' | 'maintenance' | 'improvement';

export type ImagePhotoRef = {
  path: string;        // relative to scripts/validation/photos/<scenario-id>/
  license: 'public-domain' | 'cc-by-4.0' | 'usda-public-domain' | 'extension-educational-use';
  source: string;      // URL of original publication
  caption?: string;    // human-readable description of what's in this photo
};

export type ImageScenario = {
  id: string;
  description: string;
  photos: ImagePhotoRef[];               // 1-6 photos
  profile: LawnContext;
  dataGaps: DataGapField[];              // intentionally omitted fields
  groundTruth: {
    grassType: GrassType;
    issues: AnalysisIssue[];
    healthScoreRange: [number, number];
    mustInclude: string[];
    mustNotInclude: string[];
    photoNotes: string;
    taskModeConstraint?: TaskMode[];
  };
};

export type ImageJudgeResult = {
  scenarioId: string;
  grassTypeAccuracy: number;
  issuesF1: number;
  healthScoreInRange: number;
  recommendationQuality: number;
  dataGapAcknowledgment: number;
  crossPhotoSynthesis: number | null;
  combined: number;
  flags: string[];
  reasoning: string;
};

export type ImageRuleResult = {
  ruleId: string;
  scenarioId: string;
  pass: boolean;
  reason: string;
};

export type ImageRule = {
  id: string;
  description: string;
  check: (scenario: ImageScenario, aiResultJson: string) => ImageRuleResult;
};

export type ImageRunReport = {
  timestamp: string;
  pillar2Results: ImageRuleResult[];
  pillar3Results: ImageJudgeResult[];
  pillar3Mean: number;
  pillar3DimensionMeans: {
    grassTypeAccuracy: number;
    issuesF1: number;
    healthScoreInRange: number;
    recommendationQuality: number;
    dataGapAcknowledgment: number;
    crossPhotoSynthesis: number;
  };
  overallPass: boolean;
  failures: string[];
};

export function computeCombinedScore(r: Omit<ImageJudgeResult, 'combined' | 'scenarioId' | 'flags' | 'reasoning'>): number {
  const hasCross = r.crossPhotoSynthesis != null;
  if (hasCross) {
    return Math.round(
      0.15 * r.grassTypeAccuracy +
      0.20 * r.issuesF1 +
      0.10 * r.healthScoreInRange +
      0.35 * r.recommendationQuality +
      0.10 * r.dataGapAcknowledgment +
      0.10 * (r.crossPhotoSynthesis as number)
    );
  }
  return Math.round(
    (0.15 * r.grassTypeAccuracy +
     0.20 * r.issuesF1 +
     0.10 * r.healthScoreInRange +
     0.35 * r.recommendationQuality +
     0.10 * r.dataGapAcknowledgment) / 0.90
  );
}
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 3: Commit**

```bash
git add scripts/validation/types-image.ts
git commit -m "feat(validation): image-path types and computeCombinedScore

Defines ImageScenario, ImageJudgeResult, ImageRule, ImageRunReport.
computeCombinedScore implements the weighted-mean formula from the
design spec (15/20/10/35/10/10 with renormalization when only one
photo present).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Create `scripts/validation/load-photos.ts`

**Files:**
- Create: `scripts/validation/load-photos.ts`

- [ ] **Step 1: Write the loader**

```typescript
import * as fs from "fs";
import * as path from "path";
import type { ImagePhotoRef } from "./types-image";

const PHOTOS_ROOT = path.join(__dirname, "photos");

export type Base64Image = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
};

function inferMediaType(filePath: string): "image/jpeg" | "image/png" {
  if (filePath.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export function loadPhotosForScenario(scenarioId: string, photos: ImagePhotoRef[]): Base64Image[] {
  return photos.map((photo) => {
    const fullPath = path.join(PHOTOS_ROOT, scenarioId, photo.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing photo for ${scenarioId}: ${fullPath}`);
    }
    const data = fs.readFileSync(fullPath).toString("base64");
    return {
      type: "image",
      source: { type: "base64", media_type: inferMediaType(fullPath), data },
    };
  });
}

export function asImageUrlsForAnalyzeImages(scenarioId: string, photos: ImagePhotoRef[]): string[] {
  // analyzeImages expects URL strings, but we're calling it via a wrapper that
  // accepts the base64 payload directly. This helper returns dummy data URIs
  // for paths the harness will translate into base64 attachments.
  return photos.map((photo) => `file://${path.join(PHOTOS_ROOT, scenarioId, photo.path)}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/validation/load-photos.ts
git commit -m "feat(validation): photo base64 loader

loadPhotosForScenario reads JPEG/PNG files from
scripts/validation/photos/<scenarioId>/ and returns the Anthropic
vision API base64 content-block shape. Throws explicitly on missing
files so the harness fails the scenario rather than silently sending
a broken request.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wrap `analyzeImages()` with a base64-capable variant for validation

**Files:**
- Modify: `lib/claude.ts` — add `analyzeImagesBase64` export
- Modify: `scripts/validation/run-image.ts` will use this in Task 11

- [ ] **Step 1: Add the variant**

Insert this function in `lib/claude.ts` AFTER the existing `analyzeImages` function (around line 376):

```typescript
import type { Base64Image } from "../scripts/validation/load-photos";

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
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 3: Commit**

```bash
git add lib/claude.ts
git commit -m "feat(claude): analyzeImagesBase64 variant for validation harness

Same flow as analyzeImages but takes pre-loaded base64 image content
blocks rather than image URLs. Used by the image-path validation
harness so test photos can be committed to the repo and loaded from
disk without external hosting.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Fetch and commit the 12 scenarios' photos

**Files:**
- Create: `scripts/validation/photos/<scenario-id>/*.jpg` (12 directories, ~30 photos)
- Create: `scripts/validation/photos/LICENSES.md`

- [ ] **Step 1: Create the photos root and per-scenario subdirectories**

```bash
mkdir -p scripts/validation/photos
for id in healthy-kbg-front healthy-bermuda-peak healthy-tall-fescue-fall \
          brown-patch-closeup gray-leaf-spot-st-aug grub-damage-multi \
          dollar-spot-kbg drought-fescue bermuda-dormancy-winter \
          recently-seeded-damping mixed-issue-lawn partial-data-worstcase; do
  mkdir -p "scripts/validation/photos/$id"
done
```

- [ ] **Step 2: Fetch photos via WebFetch + curl**

For each scenario, identify a public-domain or extension-educational-use photo from one of:
- USDA ARS image library (usda-public-domain): https://www.ars.usda.gov/oc/images/photos/
- UGA Bugwood.org (extension-educational-use): https://www.forestryimages.org/, https://www.insectimages.org/, https://www.invasive.org/
- NCSU TurfFiles (extension-educational-use): https://turffiles.ncsu.edu/
- USDA PLANTS database (usda-public-domain): https://plants.usda.gov/
- UF IFAS (extension-educational-use)

Use the WebFetch tool to identify image URLs and license info on each page, then `curl -L -o scripts/validation/photos/<scenario-id>/<n>.jpg "<url>"`.

For the 12 scenarios, target photos:
1. `healthy-kbg-front/01.jpg` — close-up of a uniformly green Kentucky bluegrass lawn
2. `healthy-bermuda-peak/01.jpg` `02.jpg` `03.jpg` — wide shot, mid shot, close blade of fully greened bermuda
3. `healthy-tall-fescue-fall/01.jpg` `02.jpg` — wide front yard tall fescue + close-up of healthy blades
4. `brown-patch-closeup/01.jpg` — Rhizoctonia solani brown patch ring damage close-up on bermuda or KBG
5. `gray-leaf-spot-st-aug/01.jpg` — gray leaf spot lesions on St. Augustine blades
6. `grub-damage-multi/01.jpg` `02.jpg` — wide shot of brown grub-damaged turf area + peeled-sod close-up showing white C-shaped larvae
7. `dollar-spot-kbg/01.jpg` `02.jpg` `03.jpg` — multi-angle dollar spot symptoms on KBG (small straw-colored spots)
8. `drought-fescue/01.jpg` `02.jpg` — drought-stressed tall fescue wide shot + blade folding close-up
9. `bermuda-dormancy-winter/01.jpg` `02.jpg` `03.jpg` — dormant bermuda lawn winter scene from multiple angles
10. `recently-seeded-damping/01.jpg` `02.jpg` `03.jpg` `04.jpg` — newly-seeded lawn with damping-off symptoms from 4 angles
11. `mixed-issue-lawn/01.jpg` `02.jpg` `03.jpg` `04.jpg` — front healthy area, back diseased area, chinch bug close-up, grass blade ID close-up
12. `partial-data-worstcase/01.jpg` `02.jpg` `03.jpg` `04.jpg` — generic lawn photos showing yellow patches without obvious clear diagnosis

If a suitable license-clear photo cannot be found for a specific scenario, document that gap in `LICENSES.md` and substitute a publicly-licensed alternative (Wikipedia Commons CC-BY photos work).

- [ ] **Step 3: Write LICENSES.md**

Create `scripts/validation/photos/LICENSES.md`:

```markdown
# Test Photo Licenses

Each photo committed under `scripts/validation/photos/<scenario-id>/` is listed here
with its source URL and license. Photos with restrictive licenses are NOT included;
all photos here are public domain, CC-BY-4.0, USDA public domain, or used under
extension educational/research permission.

| Scenario | File | Source URL | License | Notes |
|----------|------|------------|---------|-------|
| healthy-kbg-front | 01.jpg | <url> | <license> | <notes> |
| ... | ... | ... | ... | ... |
```

Fill in one row per committed photo as you fetch them.

- [ ] **Step 4: Verify total size is under 30 MB**

Run: `du -sh scripts/validation/photos/`

Expected output: `<30M scripts/validation/photos/` (typically 15-25 MB if photos are reasonably sized).

If over 30 MB: downscale large photos with `sips -Z 1600` (macOS) or `convert -resize 1600x1600 ...` (ImageMagick) to keep the repo manageable.

- [ ] **Step 5: Commit**

```bash
git add scripts/validation/photos/
git commit -m "test(validation): add 30 phase-1 test photos with license records

Public-domain and extension-educational-use lawn photos covering 12
scenarios: 3 healthy lawns, 4 disease/pest cases, 3 stress/condition,
2 real-world messy. Photos base64-loaded at runtime by the image
harness; no external hosting required. LICENSES.md documents source
and license for each.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Author the 12 scenario JSON files

**Files:**
- Create: `scripts/validation/scenarios-image/healthy-kbg-front.json`
- Create: `scripts/validation/scenarios-image/healthy-bermuda-peak.json`
- Create: `scripts/validation/scenarios-image/healthy-tall-fescue-fall.json`
- Create: `scripts/validation/scenarios-image/brown-patch-closeup.json`
- Create: `scripts/validation/scenarios-image/gray-leaf-spot-st-aug.json`
- Create: `scripts/validation/scenarios-image/grub-damage-multi.json`
- Create: `scripts/validation/scenarios-image/dollar-spot-kbg.json`
- Create: `scripts/validation/scenarios-image/drought-fescue.json`
- Create: `scripts/validation/scenarios-image/bermuda-dormancy-winter.json`
- Create: `scripts/validation/scenarios-image/recently-seeded-damping.json`
- Create: `scripts/validation/scenarios-image/mixed-issue-lawn.json`
- Create: `scripts/validation/scenarios-image/partial-data-worstcase.json`

- [ ] **Step 1: Author `healthy-kbg-front.json` as the template**

```json
{
  "id": "healthy-kbg-front",
  "description": "Single close-up photo of a healthy mid-season KBG front lawn. Tests that the AI gives maintenance recommendations (not corrective) and doesn't invent issues.",
  "photos": [
    {
      "path": "01.jpg",
      "license": "public-domain",
      "source": "<url from fetch>",
      "caption": "Uniformly green Kentucky bluegrass at ~3-inch height, no visible disease or pest damage."
    }
  ],
  "profile": {
    "grassType": "kentucky_bluegrass",
    "zipCode": "43215",
    "yardSizeSqft": 4500,
    "soilPh": 6.5,
    "soilMoisture": "moist",
    "areaType": "front",
    "weatherSummary": "75°F, partly cloudy, mid-summer",
    "notes": "Front yard, kept mowed at 3 inches, no problems noted.",
    "weatherData": {
      "temp": 75,
      "humidity": 60,
      "condition": "Partly Cloudy",
      "recentRainfall": 0.5,
      "forecast": [
        { "day": "Today", "high": 78, "low": 60, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Tomorrow", "high": 82, "low": 62, "condition": "Sunny", "chanceOfRain": 10 },
        { "day": "Day 3", "high": 80, "low": 61, "condition": "Sunny", "chanceOfRain": 5 },
        { "day": "Day 4", "high": 79, "low": 60, "condition": "Partly Cloudy", "chanceOfRain": 20 },
        { "day": "Day 5", "high": 80, "low": 60, "condition": "Sunny", "chanceOfRain": 10 }
      ]
    }
  },
  "dataGaps": [],
  "groundTruth": {
    "grassType": "kentucky_bluegrass",
    "issues": ["healthy"],
    "healthScoreRange": [85, 100],
    "mustInclude": ["maintain", "mowing", "irrigation"],
    "mustNotInclude": ["fungicide", "corrective", "this lawn has", "treat the", "apply herbicide"],
    "photoNotes": "Uniformly green KBG at 3-inch height. No visible disease, weeds, drought stress, or pest damage. Healthy appearance.",
    "taskModeConstraint": ["maintenance", "improvement"]
  }
}
```

- [ ] **Step 2: Author the remaining 11 scenarios using the same template structure**

For each scenario, define: photo list, customer profile (with intentionally-missing fields per `dataGaps`), ground-truth issue set, must-include/must-not-include phrases, photo notes describing what is actually visible, and `taskModeConstraint` for healthy scenarios.

Reference table for ground-truth values per scenario:

| id | photos | grassType | dataGaps | issues | healthScoreRange | taskModeConstraint |
|----|--------|-----------|----------|--------|------------------|-------------------|
| healthy-bermuda-peak | 3 | bermuda | [] | ['healthy'] | [88, 100] | ['maintenance', 'improvement'] |
| healthy-tall-fescue-fall | 2 | tall_fescue | [] | ['healthy'] | [80, 95] | ['maintenance', 'improvement'] |
| brown-patch-closeup | 1 | bermuda | [] | ['fungus'] | [55, 75] | (none) |
| gray-leaf-spot-st-aug | 1 | st_augustine | [] | ['fungus'] | [50, 70] | (none) |
| grub-damage-multi | 2 | kentucky_bluegrass | [] | ['grubs', 'bare_spots'] | [40, 65] | (none) |
| dollar-spot-kbg | 3 | kentucky_bluegrass | [] | ['fungus'] | [60, 80] | (none) |
| drought-fescue | 2 | tall_fescue | [] | ['drought_stress'] | [55, 75] | (none) |
| bermuda-dormancy-winter | 3 | bermuda | [] | ['healthy'] | [75, 95] | ['maintenance'] |
| recently-seeded-damping | 4 | kentucky_bluegrass | [] | ['overwatering', 'nutrient_deficiency'] | [40, 65] | (none) |
| mixed-issue-lawn | 4 | kentucky_bluegrass | [] | ['fungus', 'pests', 'bare_spots'] | [50, 70] | (none) |
| partial-data-worstcase | 4 | unknown | ['grassType', 'soilPh', 'notes', 'soilTest', 'currentRoutine'] | ['nutrient_deficiency', 'drought_stress'] | [50, 80] | (none) |

For each scenario:
- `partial-data-worstcase` profile MUST omit `soilPh`, `notes`, `nitrogenPpm/phosphorusPpm/potassiumPpm`, `currentRoutine`, and use `grassType: "unknown"`.
- Each healthy scenario's `mustNotInclude` MUST contain `"fungicide"`, `"herbicide"`, `"corrective"`.
- Each disease scenario's `mustInclude` MUST contain the specific disease name (e.g., `"brown patch"`, `"gray leaf spot"`, `"dollar spot"`).

- [ ] **Step 3: Smoke-validate the JSON files**

Run:
```bash
for f in scripts/validation/scenarios-image/*.json; do
  python3 -c "import json; json.load(open('$f'))" && echo "OK: $f"
done
```

Expected: 12 lines of `OK: scripts/validation/scenarios-image/<id>.json`. Any parse failures must be fixed before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/validation/scenarios-image/
git commit -m "test(validation): 12 phase-1 image scenarios

3 healthy lawns (KBG, bermuda, tall fescue) testing the maintenance
path; 4 disease/pest scenarios; 3 stress/condition; 2 real-world
messy including a partial-data worst-case with grass type and soil
data intentionally absent.

Each scenario carries ground-truth issues, health-score range,
must/must-not-include phrases, photo notes for judge grounding, and
(for healthy lawns) a taskModeConstraint requiring maintenance or
improvement task modes only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Implement `scripts/validation/rules/image-assertions.ts`

**Files:**
- Create: `scripts/validation/rules/image-assertions.ts`

- [ ] **Step 1: Write the rules**

```typescript
import type { ImageScenario, ImageRule, ImageRuleResult } from "../types-image";

function pass(ruleId: string, scenario: ImageScenario): ImageRuleResult {
  return { ruleId, scenarioId: scenario.id, pass: true, reason: "Rule does not apply or passed" };
}
function fail(ruleId: string, scenario: ImageScenario, reason: string): ImageRuleResult {
  return { ruleId, scenarioId: scenario.id, pass: false, reason };
}

const healthyLawnMaintenanceOnly: ImageRule = {
  id: "healthy-lawn-maintenance-only",
  description: "When ground truth says healthy, ALL recommendations must use a permitted taskMode (maintenance or improvement; corrective is forbidden).",
  check(scenario, json) {
    if (!scenario.groundTruth.issues.includes("healthy")) return pass(this.id, scenario);
    if (!scenario.groundTruth.taskModeConstraint) return pass(this.id, scenario);
    const allowed = new Set(scenario.groundTruth.taskModeConstraint);
    try {
      const result = JSON.parse(json) as { recommendations?: Array<{ taskMode?: string; title?: string }> };
      const recs = result.recommendations ?? [];
      for (const rec of recs) {
        if (!rec.taskMode || !allowed.has(rec.taskMode as 'maintenance' | 'corrective' | 'improvement')) {
          return fail(this.id, scenario, `Recommendation "${rec.title ?? '(untitled)'}" has taskMode "${rec.taskMode ?? '(unset)'}" but only ${scenario.groundTruth.taskModeConstraint.join("/")} are allowed for healthy lawns`);
        }
      }
      return pass(this.id, scenario);
    } catch {
      return fail(this.id, scenario, "AI output JSON parse failed");
    }
  },
};

const mustNotIncludeBlocked: ImageRule = {
  id: "must-not-include-blocked",
  description: "Output text must not contain any phrase in groundTruth.mustNotInclude.",
  check(scenario, json) {
    const text = json.toLowerCase();
    for (const phrase of scenario.groundTruth.mustNotInclude) {
      if (text.includes(phrase.toLowerCase())) {
        return fail(this.id, scenario, `Output contains forbidden phrase "${phrase}"`);
      }
    }
    return pass(this.id, scenario);
  },
};

const mustIncludeRequired: ImageRule = {
  id: "must-include-required",
  description: "Output text must contain every phrase in groundTruth.mustInclude.",
  check(scenario, json) {
    const text = json.toLowerCase();
    for (const phrase of scenario.groundTruth.mustInclude) {
      if (!text.includes(phrase.toLowerCase())) {
        return fail(this.id, scenario, `Output missing required phrase "${phrase}"`);
      }
    }
    return pass(this.id, scenario);
  },
};

const dataGapWarningPresent: ImageRule = {
  id: "data-gap-warning-present",
  description: "When dataGaps are non-empty, AI must emit a non-null dataGapWarning string.",
  check(scenario, json) {
    if (scenario.dataGaps.length === 0) return pass(this.id, scenario);
    try {
      const result = JSON.parse(json) as { dataGapWarning?: string | null };
      if (result.dataGapWarning && typeof result.dataGapWarning === 'string' && result.dataGapWarning.trim().length > 0) {
        return pass(this.id, scenario);
      }
      return fail(this.id, scenario, `Scenario has ${scenario.dataGaps.length} dataGaps but dataGapWarning is null/empty`);
    } catch {
      return fail(this.id, scenario, "AI output JSON parse failed");
    }
  },
};

export const IMAGE_RULES: ImageRule[] = [
  healthyLawnMaintenanceOnly,
  mustNotIncludeBlocked,
  mustIncludeRequired,
  dataGapWarningPresent,
];
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 3: Commit**

```bash
git add scripts/validation/rules/image-assertions.ts
git commit -m "test(validation): image-path P2-equivalent rule assertions

Four rules: healthy-lawn-maintenance-only (taskMode constraint),
must-not-include-blocked, must-include-required, and
data-gap-warning-present (verifies analyzeImages emitted a warning
when dataGaps were non-empty).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Implement `scripts/validation/judge-image.ts`

**Files:**
- Create: `scripts/validation/judge-image.ts`

- [ ] **Step 1: Write the judge**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult } from "../../types";
import type { ImageScenario, ImageJudgeResult } from "./types-image";
import { computeCombinedScore } from "./types-image";
import { loadPhotosForScenario, type Base64Image } from "./load-photos";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120_000,
      maxRetries: 0,
    });
  }
  return _anthropic;
}

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6";
const JUDGE_SYSTEM = `You are a turfgrass expert with 20+ years of experience and deep knowledge of university extension recommendations. You evaluate AI-generated lawn care analyses for agronomic accuracy, including visual grounding against photos.`;
const ENSEMBLE_N = 3;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [0, 2000, 5000, 10000];

function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return ["timed out","timeout","rate limit","overloaded","503","502","504","econnreset","etimedout"].some((s) => msg.includes(s));
}

async function callWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (BACKOFF_MS[i]) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (!isTransientError(e) || i === MAX_ATTEMPTS - 1) throw e;
      process.stdout.write(`\n    [retry ${i + 1}] ${label}\n  `);
    }
  }
  throw lastErr;
}

function stripControlChars(s: string): string {
  let out = "";
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    out += (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127 ? " " : s[k];
  }
  return out;
}

function buildJudgePrompt(scenario: ImageScenario, aiResult: AnalysisResult): string {
  return `You will see N photos of a lawn, then the AI's AnalysisResult and the ground truth. Score across the dimensions below.

CUSTOMER PROFILE:
${JSON.stringify(scenario.profile, null, 2)}

AI OUTPUT:
${JSON.stringify(aiResult, null, 2)}

GROUND TRUTH:
- grass type: ${scenario.groundTruth.grassType}
- visible issues: ${JSON.stringify(scenario.groundTruth.issues)}
- health score range: ${scenario.groundTruth.healthScoreRange.join("–")}
- must include phrases: ${JSON.stringify(scenario.groundTruth.mustInclude)}
- must NOT include phrases: ${JSON.stringify(scenario.groundTruth.mustNotInclude)}
- task mode constraint: ${scenario.groundTruth.taskModeConstraint ? JSON.stringify(scenario.groundTruth.taskModeConstraint) : "(none)"}
- what's visible in the photos: ${scenario.groundTruth.photoNotes}
- intentionally missing customer fields (dataGaps): ${JSON.stringify(scenario.dataGaps)}

SCORE each dimension independently:
1. grassTypeAccuracy (0 or 100): does AI.grassTypeDetected match ground truth?
2. issuesF1 (0-100): F1 of AI.issues set vs ground-truth issues set × 100.
3. healthScoreInRange (0 or 100): is AI.healthScore within ground truth range?
4. recommendationQuality (0-100): agronomically appropriate given what's visible, respects taskModeConstraint, cites extension sources, never invents issues not present.
5. dataGapAcknowledgment (0-100): if dataGaps are non-empty, did the AI emit a specific dataGapWarning? 100=specific to which recs are weakened; 60=generic; 0=silent. When dataGaps is empty, return 100.
6. crossPhotoSynthesis (0-100, only if >=2 photos; else null): integration of evidence across photos. 100=explicit per-region; 60=uses all but doesn't differentiate; 0=ignores beyond first.

Output ONLY this JSON (no markdown, no preamble):
{"grassTypeAccuracy":<int>,"issuesF1":<int>,"healthScoreInRange":<int>,"recommendationQuality":<int>,"dataGapAcknowledgment":<int>,"crossPhotoSynthesis":<int or null>,"flags":["<specific issue>","<...>"],"reasoning":"<2-3 sentences>"}`;
}

type Vote = {
  grassTypeAccuracy: number;
  issuesF1: number;
  healthScoreInRange: number;
  recommendationQuality: number;
  dataGapAcknowledgment: number;
  crossPhotoSynthesis: number | null;
  flags: string[];
  reasoning: string;
};

export async function judgeImageScenario(
  scenario: ImageScenario,
  aiResult: AnalysisResult,
  photos: Base64Image[]
): Promise<ImageJudgeResult> {
  const prompt = buildJudgePrompt(scenario, aiResult);
  const votes: Vote[] = [];

  for (let i = 0; i < ENSEMBLE_N; i++) {
    let parsed: Vote | undefined;
    let parseAttempt = 0;
    while (parseAttempt < 3 && !parsed) {
      const message = await callWithRetry(`judge-image ${scenario.id} (${i + 1}/${ENSEMBLE_N})`, () =>
        getAnthropic().messages.create({
          model: JUDGE_MODEL,
          max_tokens: 1024,
          system: JUDGE_SYSTEM,
          messages: [{
            role: "user",
            content: [
              ...photos,
              { type: "text" as const, text: prompt },
            ],
          }],
        }),
      );
      const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const cleaned = stripControlChars(jsonMatch?.[0] ?? "{}");
      try { parsed = JSON.parse(cleaned) as Vote; }
      catch (err) {
        parseAttempt += 1;
        process.stdout.write(`\n    [parse-retry ${parseAttempt}/3] ${scenario.id}: ${(err as Error).message.slice(0, 60)}\n  `);
      }
    }
    if (!parsed) throw new Error(`Judge unparseable for ${scenario.id} after 3 attempts`);
    votes.push(parsed);
  }

  const avg = (key: keyof Vote) => Math.round(votes.reduce((s, v) => s + (v[key] as number || 0), 0) / votes.length);
  const crossVotes = votes.map((v) => v.crossPhotoSynthesis).filter((n): n is number => typeof n === 'number');
  const crossAvg = crossVotes.length > 0 ? Math.round(crossVotes.reduce((s, n) => s + n, 0) / crossVotes.length) : null;

  const subScores = {
    grassTypeAccuracy: avg('grassTypeAccuracy'),
    issuesF1: avg('issuesF1'),
    healthScoreInRange: avg('healthScoreInRange'),
    recommendationQuality: avg('recommendationQuality'),
    dataGapAcknowledgment: avg('dataGapAcknowledgment'),
    crossPhotoSynthesis: crossAvg,
  };

  const median = votes[Math.floor(votes.length / 2)];
  return {
    scenarioId: scenario.id,
    ...subScores,
    combined: computeCombinedScore(subScores),
    flags: median.flags,
    reasoning: `[ensemble n=${ENSEMBLE_N} model=${JUDGE_MODEL}] ${median.reasoning}`,
  };
}

export async function runImageJudge(
  scenarios: ImageScenario[],
  aiResults: Map<string, AnalysisResult>,
  photoMap: Map<string, Base64Image[]>
): Promise<{ results: ImageJudgeResult[]; mean: number }> {
  const results: ImageJudgeResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  Judging ${scenario.id}... `);
    try {
      const ai = aiResults.get(scenario.id);
      const photos = photoMap.get(scenario.id);
      if (!ai || !photos) {
        process.stdout.write(`SKIP (missing AI result or photos)\n`);
        continue;
      }
      const r = await judgeImageScenario(scenario, ai, photos);
      process.stdout.write(`${r.combined}/100 (g${r.grassTypeAccuracy} i${r.issuesF1} h${r.healthScoreInRange} r${r.recommendationQuality} d${r.dataGapAcknowledgment}${r.crossPhotoSynthesis != null ? ` c${r.crossPhotoSynthesis}` : ''})\n`);
      results.push(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`ERROR: ${msg.slice(0, 100)}\n`);
      results.push({
        scenarioId: scenario.id,
        grassTypeAccuracy: 0, issuesF1: 0, healthScoreInRange: 0,
        recommendationQuality: 0, dataGapAcknowledgment: 0, crossPhotoSynthesis: null,
        combined: 0,
        flags: [`error: ${msg.slice(0, 200)}`],
        reasoning: "Judge error",
      });
    }
  }
  const mean = results.length > 0 ? results.reduce((s, r) => s + r.combined, 0) / results.length : 0;
  return { results, mean };
}
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 3: Commit**

```bash
git add scripts/validation/judge-image.ts
git commit -m "feat(validation): image-aware ensemble-3 judge with multi-dim scoring

judge-image.ts mirrors the text-path judge.ts pattern (4-attempt retry,
JSON parse-retry, ensemble-3 averaging) but attaches photos to every
judge call and emits structured per-dimension scores. Combined score
computed by computeCombinedScore from types-image. JUDGE_MODEL env var
overrides default Sonnet for Opus milestone runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Implement `scripts/validation/run-image.ts` harness

**Files:**
- Create: `scripts/validation/run-image.ts`

- [ ] **Step 1: Write the harness**

```typescript
import * as fs from "fs";
import * as path from "path";
import { analyzeImagesBase64 } from "../../lib/claude";
import { loadPhotosForScenario, type Base64Image } from "./load-photos";
import { IMAGE_RULES } from "./rules/image-assertions";
import { runImageJudge } from "./judge-image";
import type { ImageScenario, ImageRuleResult, ImageRunReport, ImageJudgeResult } from "./types-image";
import type { AnalysisResult } from "../../types";

const SCENARIOS_DIR = path.join(__dirname, "scenarios-image");
const RESULTS_DIR = path.join(__dirname, "results");

function loadScenarios(): ImageScenario[] {
  if (!fs.existsSync(SCENARIOS_DIR)) {
    console.error(`Scenarios directory not found: ${SCENARIOS_DIR}`);
    process.exit(1);
  }
  const out: ImageScenario[] = [];
  for (const entry of fs.readdirSync(SCENARIOS_DIR)) {
    if (entry.endsWith(".json")) {
      out.push(JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, entry), "utf8")) as ImageScenario);
    }
  }
  return out;
}

function meanByKey(results: ImageJudgeResult[], key: keyof Omit<ImageJudgeResult, 'scenarioId' | 'flags' | 'reasoning'>): number {
  const values = results
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return 0;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

async function main() {
  const smokeOnly = process.argv.includes("--smoke");
  const date = new Date().toISOString().slice(0, 10);
  console.log(`\nYard Analyzer IMAGE-PATH Validation Report — ${date}`);
  console.log("─".repeat(60));

  let scenarios = loadScenarios();
  if (smokeOnly) {
    scenarios = scenarios.filter((s) => s.id === "healthy-kbg-front").slice(0, 1);
    console.log(`SMOKE MODE: running 1 scenario only`);
  }
  console.log(`Loaded ${scenarios.length} image scenarios\n`);

  const failures: string[] = [];

  // --- P1 equivalent: scenario integrity ---
  console.log("Pillar 1: Scenario integrity checks...");
  for (const s of scenarios) {
    if (!s.photos || s.photos.length === 0) {
      failures.push(`[scenario-integrity] ${s.id}: no photos`);
      console.log(`  FAIL ${s.id}: no photos`);
    } else if (!s.groundTruth) {
      failures.push(`[scenario-integrity] ${s.id}: no groundTruth`);
      console.log(`  FAIL ${s.id}: no groundTruth`);
    }
  }
  console.log(`Pillar 1: Integrity                ${scenarios.length - failures.length}/${scenarios.length} passed\n`);

  // --- P2 equivalent: rule assertions over analyzeImages output ---
  console.log("Running Pillar 2: Image Rule Assertions...");
  const ruleResults: ImageRuleResult[] = [];
  const aiResults = new Map<string, AnalysisResult>();
  const photoMap = new Map<string, Base64Image[]>();

  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.id}... `);
    try {
      const photos = loadPhotosForScenario(scenario.id, scenario.photos);
      photoMap.set(scenario.id, photos);
      const result = await analyzeImagesBase64(photos, scenario.profile);
      aiResults.set(scenario.id, result);
      const responseText = JSON.stringify(result);
      for (const rule of IMAGE_RULES) {
        ruleResults.push(rule.check(scenario, responseText));
      }
      process.stdout.write("done\n");
    } catch (err) {
      process.stdout.write(`ERROR: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}\n`);
      failures.push(`[pillar2-error] ${scenario.id}`);
    }
  }
  const passedRules = ruleResults.filter((r) => r.pass).length;
  console.log(`Pillar 2: Rule Assertions          ${passedRules}/${ruleResults.length} passed`);
  for (const r of ruleResults.filter((x) => !x.pass)) {
    console.log(`  FAIL [rule] ${r.scenarioId}/${r.ruleId}: ${r.reason}`);
  }

  // --- P3 equivalent: image-aware judge ---
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\nPillar 3: SKIPPED (no ANTHROPIC_API_KEY)");
  } else {
    console.log("\nRunning Pillar 3: Image-aware Judge...");
    const { results: judgeResults, mean } = await runImageJudge(scenarios, aiResults, photoMap);
    console.log(`Pillar 3: Image Judge              ${mean.toFixed(1)} / 100 combined mean`);

    const dimensionMeans = {
      grassTypeAccuracy: meanByKey(judgeResults, 'grassTypeAccuracy'),
      issuesF1: meanByKey(judgeResults, 'issuesF1'),
      healthScoreInRange: meanByKey(judgeResults, 'healthScoreInRange'),
      recommendationQuality: meanByKey(judgeResults, 'recommendationQuality'),
      dataGapAcknowledgment: meanByKey(judgeResults, 'dataGapAcknowledgment'),
      crossPhotoSynthesis: meanByKey(judgeResults, 'crossPhotoSynthesis'),
    };
    console.log(`         dim means → grass=${dimensionMeans.grassTypeAccuracy} issues=${dimensionMeans.issuesF1} health=${dimensionMeans.healthScoreInRange} recs=${dimensionMeans.recommendationQuality} gap=${dimensionMeans.dataGapAcknowledgment} cross=${dimensionMeans.crossPhotoSynthesis}`);

    const report: ImageRunReport = {
      timestamp: new Date().toISOString(),
      pillar2Results: ruleResults,
      pillar3Results: judgeResults,
      pillar3Mean: mean,
      pillar3DimensionMeans: dimensionMeans,
      overallPass: failures.length === 0 && ruleResults.every((r) => r.pass),
      failures,
    };
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const outFile = path.join(RESULTS_DIR, `image-${date}-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`\nResults written to ${outFile}`);
  }

  console.log("\n" + "─".repeat(60));
  console.log(failures.length === 0 ? "Overall: PASS" : `Overall: FAIL (${failures.length} issue${failures.length > 1 ? "s" : ""})`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Image validation runner crashed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: only the pre-existing `yardSizeSqft` error.

- [ ] **Step 3: Commit**

```bash
git add scripts/validation/run-image.ts
git commit -m "feat(validation): image-path harness run-image.ts

Mirrors the text-path run.ts: scenario loading, P1 (scenario integrity),
P2 (image rule assertions), P3 (image-aware multi-dim judge). Writes
JSON output to scripts/validation/results/image-YYYY-MM-DD-<ts>.json
with per-dimension means alongside the combined headline score. The
--smoke flag runs a single scenario for cheap end-to-end smoke
verification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Add npm scripts

**Files:**
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Read package.json scripts**

Run: `grep -A 15 '"scripts"' package.json | head -20`

- [ ] **Step 2: Add validate:image and validate:image:smoke**

Edit `package.json` and add two new entries to the `"scripts"` object (keep existing scripts):

```json
{
  "scripts": {
    "validate:image": "tsx --env-file .env.local scripts/validation/run-image.ts",
    "validate:image:smoke": "tsx --env-file .env.local scripts/validation/run-image.ts --smoke"
  }
}
```

- [ ] **Step 3: Run smoke test to verify the harness boots**

Run: `npm run validate:image:smoke 2>&1 | head -30`

Expected: harness loads 1 scenario, attempts analyzeImagesBase64 call. If photos are not yet committed, the test will fail with "Missing photo for healthy-kbg-front". That's expected at this stage and verifies the load path works.

If `Missing photo` appears, the harness is wired correctly and the photo-fetch step (Task 7) completes the loop.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: add validate:image and validate:image:smoke scripts

npm run validate:image runs the full 12-scenario image-path harness.
npm run validate:image:smoke runs healthy-kbg-front only for cheap
end-to-end verification during development.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Run first Sonnet baseline + Opus milestone

**Files:**
- (No code changes; this task produces measurements + a session-handoff update)
- Modify: `docs/session-handoff.md` (create if absent or append)

- [ ] **Step 1: Run the full Sonnet image-judge baseline**

Run: `npm run validate:image 2>&1 | tee /tmp/validate-image-r01.log`

Expected: ~10-15 min, ~$8-12 spend. All 12 scenarios get a combined score and per-dimension breakdown. Results JSON saved to `scripts/validation/results/image-<date>-<ts>.json`.

- [ ] **Step 2: Inspect dimension means**

Run:
```bash
python3 -c "
import json, glob
f = sorted(glob.glob('scripts/validation/results/image-*.json'))[-1]
r = json.load(open(f))
print('combined mean:', r['pillar3Mean'])
print('dimension means:', r['pillar3DimensionMeans'])
print()
for x in sorted(r['pillar3Results'], key=lambda v: v['combined']):
    print(f'{x[\"scenarioId\"]:30s} combined={x[\"combined\"]}  recs={x[\"recommendationQuality\"]}  issues={x[\"issuesF1\"]}')
"
```

- [ ] **Step 3: Run the Opus milestone measurement**

Run: `JUDGE_MODEL=claude-opus-4-7 npm run validate:image 2>&1 | tee /tmp/validate-image-r02-opus.log`

Expected: ~20-30 min, ~$25-30 spend. Produces the Opus baseline for the image path that the spec defined as the success criterion (Opus image-judge mean ≥ 92).

- [ ] **Step 4: Document the baseline in session handoff**

Append (or create) `docs/session-handoff.md` with a section like:

```markdown
## Image-path baseline (Sonnet image-judge R01, Opus image-judge R02)

| dimension | Sonnet | Opus |
|---|---|---|
| combined mean | <fill> | <fill> |
| grassTypeAccuracy | <fill> | <fill> |
| issuesF1 | <fill> | <fill> |
| healthScoreInRange | <fill> | <fill> |
| recommendationQuality | <fill> | <fill> |
| dataGapAcknowledgment | <fill> | <fill> |
| crossPhotoSynthesis | <fill> | <fill> |

Sub-90 image scenarios (Opus): <fill list>
Next round of content investment: <fill scenario>
```

- [ ] **Step 5: Commit the handoff**

```bash
git add docs/session-handoff.md
git commit -m "docs: image-path baseline measurements (Sonnet R01, Opus R02)

First image-path validation results. Sonnet/Opus per-dimension and
combined-mean baselines documented for future sessions to track
deltas against. Identifies the sub-90 scenarios for the next round
of targeted content investment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Section "Architecture" → Tasks 4, 5, 6, 9, 10, 11 (types, loader, analyzeImagesBase64, rules, judge, harness). ✓
- Section "ImageScenario schema" → Task 4. ✓
- Section "ImageJudgeResult schema + scoring weights" → Task 4 (`computeCombinedScore`). ✓
- Section "Phase-1 test set composition" → Tasks 7 + 8 (photos + scenario JSONs). ✓
- Section "Image judge prompt" → Task 10. ✓
- Section "In-response dataGapWarning" → Tasks 1, 2, 3 (schema + helpers + wiring). ✓
- Section "P2-equivalent rule assertions" → Task 9 (includes healthy-lawn-maintenance-only). ✓
- Section "Telemetry" → Task 11 (run-image.ts writes results JSON with per-dim means). ✓
- Section "Cost and latency" → Task 13 (baseline run validates expected costs). ✓
- Section "Error handling" → Task 5 (missing-photo explicit throw), Task 10 (judge retry + parse-retry + per-scenario error capture), Task 11 (try/catch around analyzeImagesBase64 per scenario). ✓
- Section "Testing strategy" → Task 12 includes `--smoke` flag. Unit tests for `detectDataGaps` / `buildDataGapWarning` are not explicit tasks; the harness exercises them end-to-end, which is acceptable for v1. License field validation is enforced by the type system at Task 4 and JSON parse at Task 8. ✓
- Success criteria from spec → Task 13 measures against them. ✓

**Placeholder scan:** No TBD/TODO. Every code step is complete. Task 7 explicitly notes the WebFetch + curl loop with the kind of source URLs to look at and the exact directory structure; this is research-execution work, not a placeholder.

**Type consistency:** `DataGapField` defined in lib/claude.ts (Task 2), re-exported via types-image.ts (Task 4). `AnalysisIssue` aliased to `LawnIssue` from `types/index.ts`. `ImageJudgeResult` shape matches `computeCombinedScore`'s input. `analyzeImagesBase64` takes `Base64Image[]` (Task 5) and is used in run-image.ts (Task 11). `IMAGE_RULES` exported as array in Task 9 and imported in Task 11. `runImageJudge` signature matches caller in Task 11. All consistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-image-validation-suite.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
