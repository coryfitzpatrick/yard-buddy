# Image-Path Validation Suite — Design

**Date:** 2026-06-14
**Author:** Tuning session (continuation from `docs/superpowers/specs/2026-06-13-facts-catalog-and-critique-design.md`)
**Goal:** Build a customer-realistic validation suite for the image-analysis path (`lib/claude.ts → analyzeImages()`), parallel to the existing text-path suite (`scripts/validation/run.ts`). The text-path Opus mean stabilized at ~91 with no clear architectural lever remaining to reach 95+; meanwhile the image-path — which is what most homeowners actually use first — has zero validation coverage. This spec defines the suite that puts the image path on the same measured-iteration loop.

## North star

Best-in-class lawn AI. The text-path tuning brought `generateRecommendations` to Opus 91.3 over R26-R45. The image path (`analyzeImages`) is the customer's *first* surface — they upload photos before they fill out a profile — and is currently unmeasured. We need its mean on a scoreboard before we can responsibly ship.

## Scope

This spec defines:
- A new harness `scripts/validation/run-image.ts` mirroring the existing `run.ts` for the image path
- Per-scenario scoring across multiple dimensions, combined into a single 0-100 mean (for headline comparison against text-path 91.3)
- A 12-scenario phase-1 test set sourced from public-domain extension photos
- A small schema extension to `AnalysisResult` to support an in-response `dataGapWarning` field
- An eventual product-side blocking pre-submission modal that warns customers when key profile fields are missing (out of scope here; described as a downstream item)

This spec does NOT cover:
- Phase-2 test photos from the user's own field collection (added later as the harness proves stable)
- Pre-submission UX modal implementation (product-side; will reuse the harness's missing-field detection logic)
- Changing the text-path validation suite

## Problem statement

`analyzeImages(imageUrls, context)` runs Sonnet 4.6 with up to 4 image attachments plus a context block. It returns `AnalysisResult` containing detected grass type, an issues array, a health score, a summary, and recommendations. None of this is currently exercised by the validation suite — the suite calls `generateRecommendations(context)` only.

Three classes of failure that the text suite cannot catch:
1. **Visual misclassification** — claiming gray leaf spot when the photo shows brown patch; misidentifying grass type from the photo.
2. **Cross-photo synthesis errors** — diagnosing only the wide shot and ignoring close-ups, or treating multiple photos as if they showed the same area.
3. **Healthy-lawn confabulation** — inventing problems on a lawn the photos show as healthy, recommending corrective treatments where maintenance is appropriate.

The image path is also where the customer-facing experience starts, so its mean drives perceived product quality. Mid-95s Opus on the image path is the actual ship gate, not text-path mid-95s.

## Architecture

### New files

- `scripts/validation/run-image.ts` — image-path harness. Loads image scenarios, calls `analyzeImages()` for each, runs P2-style rule assertions (subset relevant to image path), then the image-aware P3 judge.
- `scripts/validation/judge-image.ts` — image-aware judge. Sonnet 4.6 by default, Opus via `JUDGE_MODEL` env var. Each judge call attaches all photos for the scenario and emits a structured multi-dimensional score.
- `scripts/validation/types-image.ts` — `ImageScenario`, `ImageJudgeResult`, `ImageRuleResult` types.
- `scripts/validation/scenarios-image/*.json` — 12 phase-1 scenario files.
- `scripts/validation/photos/<scenario-id>/*.jpg` — base64-loaded image set, committed to repo. Total expected size ~15-25 MB.

### Modified files

- `lib/claude.ts` — `analyzeImages()` extended to emit `dataGapWarning: string | null` keyed to which fields were missing from the provided `LawnContext`.
- `types.ts` (project root, if `AnalysisResult` lives there; otherwise wherever it's currently exported) — `AnalysisResult.dataGapWarning: string | null`.

### Components and responsibilities

| Component | Responsibility | Depends on |
|---|---|---|
| `run-image.ts` | Orchestrate scenario loading, base64 image encoding, harness execution, result aggregation, JSON output. Mirrors `run.ts` structure. | `analyzeImages`, `judge-image`, `types-image` |
| `judge-image.ts` | For each scenario: attach the photos, present `AnalysisResult` + ground truth + scoring rubric, get back structured multi-dim scores. Uses ensemble-3 (same as text judge). | Anthropic SDK |
| Scenario schemas | JSON with profile + photo paths + data gap flags + ground truth | — |
| Photo set | Base64-loadable JPGs committed to `scripts/validation/photos/` | — |
| `lib/claude.ts` `analyzeImages` | Detect missing fields in the input context; emit a contextual `dataGapWarning` keyed to which fields are gone and which recommendations are weakened by their absence. | — |

## Data: ImageScenario schema

```ts
type ImageScenario = {
  id: string;
  description: string;

  photoPaths: string[];                  // 1-6 paths, base64-loaded at runtime
  profile: LawnContext;                  // same shape as text scenarios
  dataGaps: DataGapField[];              // explicit list of intentionally-omitted fields

  groundTruth: {
    grassType: GrassType;                // canonical answer
    issues: AnalysisIssue[];             // canonical issue set; judge does F1 vs detected
    healthScoreRange: [number, number];  // acceptable range for the AI's health score
    mustInclude: string[];               // phrases recommendations must mention
    mustNotInclude: string[];            // phrases that disqualify (e.g., fungicide on healthy lawn)
    photoNotes: string;                  // what's visible in each photo (judge grounding)
    taskModeConstraint?: ('maintenance' | 'corrective' | 'improvement')[];
                                          // when set, ALL recommendations must use one of these taskModes
  };
};

type DataGapField = 'soilPh' | 'grassType' | 'notes' | 'soilTest' | 'currentRoutine' | 'yardSizeSqft';
type AnalysisIssue = 'grubs' | 'weeds_broadleaf' | 'weeds_grassy' | 'fungus' | 'drought_stress'
                   | 'overwatering' | 'bare_spots' | 'thatch' | 'compaction' | 'nutrient_deficiency'
                   | 'pests' | 'healthy';
```

## Data: ImageJudgeResult schema

```ts
type ImageJudgeResult = {
  scenarioId: string;

  // Per-dimension sub-scores (judge emits each independently)
  grassTypeAccuracy: number;       // 0 or 100 (binary; correct match against ground truth)
  issuesF1: number;                // F1 × 100 of detected issues vs ground-truth issues set
  healthScoreInRange: number;      // 0 or 100 (binary; within ground-truth range)
  recommendationQuality: number;   // 0-100, same rubric as text-path P3 judge
  dataGapAcknowledgment: number;   // 0-100 (was the AI honest about what it didn't have?)
  crossPhotoSynthesis?: number;    // 0-100, only when photoPaths.length >= 2; otherwise undefined

  // Weighted combined headline score
  combined: number;                // 0-100; reweighted when crossPhotoSynthesis is absent

  flags: string[];                 // judge's specific complaints (verbatim)
  reasoning: string;               // ensemble votes + brief justification
};
```

### Combined score weights

| dimension | weight (multi-photo) | weight (single-photo) |
|---|---|---|
| `grassTypeAccuracy` | 15% | 17% |
| `issuesF1` | 20% | 22% |
| `healthScoreInRange` | 10% | 11% |
| `recommendationQuality` | 35% | 39% |
| `dataGapAcknowledgment` | 10% | 11% |
| `crossPhotoSynthesis` | 10% | — |

Single-photo: renormalize the other five to sum to 100% (each gets `weight / 0.9`).

## Phase-1 test set composition (12 scenarios)

Each scenario carries 1-4 photos sourced from public-domain university extension publications (UGA, NCSU, Texas A&M, UF, CSU) or USDA databases. Licenses verified before commit.

| # | id | photos | category | profile | data gaps | key constraints |
|---|---|---|---|---|---|---|
| 1 | healthy-kbg-front | 1 | Healthy | KBG, full, OH | none | maintenance recs only; mustNotInclude fungicide/corrective |
| 2 | healthy-bermuda-peak | 3 | Healthy | bermuda, full, GA | none | maintenance + improvement only |
| 3 | healthy-tall-fescue-fall | 2 | Healthy | TF, full, NC | none | maintenance + improvement only; can include fall fert/overseed |
| 4 | brown-patch-closeup | 1 | Disease | bermuda, full, NC | none | issue=fungus; rec must include fungicide |
| 5 | gray-leaf-spot-st-aug | 1 | Disease | st_augustine, full, TX | none | issue=fungus; rec must address gray leaf spot specifically |
| 6 | grub-damage-multi | 2 | Pest | KBG, full, IN | none | issue=grubs+bare_spots; peel-test photo present |
| 7 | dollar-spot-kbg | 3 | Disease | KBG, full, KS | none | issue=fungus; multi-angle synthesis |
| 8 | drought-fescue | 2 | Stress | TF, partial, KS | none | issue=drought_stress; wide + blade close |
| 9 | bermuda-dormancy-winter | 3 | Condition | bermuda, full, GA | none | issue=healthy (dormant); mustNotInclude fertilizer/herbicide |
| 10 | recently-seeded-damping | 4 | Stress | KBG, full, MN | none | issue=overwatering(damping-off); synthesis across 4 photos |
| 11 | mixed-issue-lawn | 4 | Real-world | KBG, full, OH | none | front healthy, back diseased, chinch close, grass ID — synthesis test |
| 12 | partial-data-worstcase | 4 | Real-world | unknown, ZIP only, vague notes | grassType, soilPh, notes detail | dataGapAcknowledgment heavily weighted |

Cool-vs-warm split: 7 cool-season, 5 warm-season — roughly matches likely customer distribution and our 18-doc RAG coverage.

## Image judge prompt

```
You are a lawn-care recommendation auditor. You will:
1. See N photos of a lawn
2. See the customer profile that was given to the lawn AI
3. See the AI's AnalysisResult output
4. See the ground truth (what the test author knows is correct)
5. Score the AI's output across 5-6 dimensions

PHOTOS: <N images attached>

CUSTOMER PROFILE: <profile JSON>

AI OUTPUT: <AnalysisResult JSON>

GROUND TRUTH:
- grass type: <ground truth grassType>
- visible issues: <ground truth issues set>
- health score range: <ground truth range>
- recommendations must mention: <mustInclude list>
- recommendations must NOT mention: <mustNotInclude list>
- task mode constraint (if any): <taskModeConstraint>
- what's actually visible in each photo: <photoNotes>

SCORE these dimensions independently:

1. grassTypeAccuracy (0 or 100): does AI.grassTypeDetected match ground truth?
2. issuesF1 (0-100): compute F1 of AI.issues set vs ground-truth issues set, ×100.
3. healthScoreInRange (0 or 100): is AI.healthScore within ground truth range?
4. recommendationQuality (0-100): are the recommendations agronomically appropriate
   given what's visible? Use the same standards as the text-path P3 judge: cite
   extension sources, use realistic product rates, respect taskMode constraint,
   never invent issues not present in photos.
5. dataGapAcknowledgment (0-100): if the customer profile is missing key fields,
   does the AI honestly emit a dataGapWarning that's specific (not generic)?
   100 = specific to which recommendations are weakened by which gap;
   60 = generic acknowledgment; 0 = silent about missing data.
6. crossPhotoSynthesis (0-100, only if N >= 2): did the AI integrate evidence
   across all photos, or only attend to one? 100 = explicit per-region/per-photo
   reasoning; 60 = uses all photos but doesn't differentiate; 0 = ignores
   photos beyond the first.

Output ONLY this JSON:
{
  "grassTypeAccuracy": <int>,
  "issuesF1": <int>,
  "healthScoreInRange": <int>,
  "recommendationQuality": <int>,
  "dataGapAcknowledgment": <int>,
  "crossPhotoSynthesis": <int or null if single-photo>,
  "flags": ["<specific issue 1>", "<specific issue 2>", ...],
  "reasoning": "<2-3 sentence justification>"
}
```

Ensemble-3: three independent judge calls per scenario; combined score is mean across the three. Same hardening as text judge: 4-attempt retry, 90s timeout, JSON parse-retry.

## In-response `dataGapWarning`

`analyzeImages()` is extended:

```ts
// inside analyzeImages, after the model returns:
function detectDataGaps(context: LawnContext): DataGapField[] { ... }

const gaps = detectDataGaps(context);
const aiResult = JSON.parse(cleaned) as AnalysisResult;

if (gaps.length > 0) {
  aiResult.dataGapWarning = buildDataGapWarning(gaps, aiResult.recommendations);
} else {
  aiResult.dataGapWarning = null;
}

return aiResult;
```

`buildDataGapWarning` returns a sentence keyed to which gaps exist AND which recommendations they affect:
- "Soil pH wasn't shared. The lime/sulfur recommendation is based on visible chlorosis only — confirm with a soil test before applying."
- "Grass type wasn't shared, so this assumes Kentucky bluegrass based on blade appearance. Verify before applying species-specific treatments (e.g., grass-specific pre-emergent rates)."
- "You only shared photos and your ZIP. These recommendations are general for your climate zone; sharing a soil test, grass type, or notes about specific problems would tighten them considerably."

The function lives in `lib/claude.ts` alongside `analyzeImages` and is exported so the pre-submission modal (product-side) can use the same gap detection logic for its UI warning.

## P2-equivalent rule assertions for image path

A subset of the text-path rules apply to the image path:
- `no-fert-in-dormancy`: still valid; if AI claims dormancy in summary, must not recommend fertilization
- `mowing-height-in-range`: still valid; per grass type
- `pre-emergent-incompatibility-with-seeding`: still valid
- `healthy-lawn-maintenance-only` (NEW): when ground truth says healthy, `recommendations[].taskMode` must be in `taskModeConstraint`

The full set is invoked the same way as the text-path P2 in `run-image.ts`.

## Telemetry

`run-image.ts` writes JSON to `scripts/validation/results/image-YYYY-MM-DD-<ts>.json` with the same `RunReport`-like shape. `pillars[3]` (the P3-equivalent) holds the `ImageJudgeResult[]` with per-dimension sub-scores plus `combined`.

`scripts/validation/compare.ts` is extended to detect image-suite results and surface per-dimension deltas (not just mean) so we know whether a regression is in grass-type detection vs issues F1 vs recommendation quality.

## Cost and latency

Per-run (15-image-attachment-equivalent — the 12 scenarios carry ~30 photos total):
- Image analysis (12 calls, varies in photo count): ~$1.20–$1.80
- Sonnet image judge (ensemble-3 × 12, all photos attached each time): ~$6–$10
- **Phase-1 Sonnet iteration run: ~$8–$12**
- **Opus image judge milestone run: ~$25–$30**

The cost per analysis call in production is unaffected by validation. Cache hits help (system prompt cached across scenarios).

## Error handling

- Photo file missing: harness fails the scenario with explicit `[image-missing] <scenario-id>` failure, continues with the rest.
- Anthropic vision call fails (image too large, content policy, etc.): retry once with downsized image; if still failing, record `scenarioError` and continue.
- Judge call returns malformed JSON: retry with `Output ONLY the JSON object` reminder; if still bad, score the scenario as 0 with `judge_parse_failed` flag.
- The `analyzeImages` call timing out: 120s per-call timeout (longer than text path because vision processing is slower).

## Testing strategy

- **Unit tests** for `detectDataGaps(context)` and `buildDataGapWarning(gaps, recs)` — 5-6 golden cases (no gaps, all gaps, common partial combinations).
- **Smoke test** for the harness: a `--smoke` flag that runs scenario 1 (healthy-kbg-front) only, useful for verifying the harness during development without paying for a full run.
- **Image fixture commit hygiene**: pre-commit hook or CI check that fails if any photo exceeds 2 MB (keeps repo size manageable).
- **License check**: each scenario JSON's photo entries include a `license` field (`"public-domain"`, `"cc-by-4.0"`, `"usda-public-domain"`, etc.) that's validated on harness start.

## Phase 2 (out of scope here, documented as the next-next thing)

After phase 1 stabilizes (mean Sonnet ≥ 88 / Opus ≥ 92 on a 3-run average):
1. Replace ~5 of the textbook scenarios with user-provided real photos that capture the messy-customer distribution: weird angles, mixed lighting, partial coverage, unclear focus.
2. Grow the suite from 12 → 20 with more partial-data and worst-case scenarios.
3. Pre-submission UX modal product-side, reusing `detectDataGaps` logic.

## Success criteria

Phase 1 ships when:
- Sonnet image-judge mean ≥ 88 over a 3-run average
- Opus image-judge mean ≥ 92 on a 1-run sample
- `healthy-kbg-front` and the other 3 healthy scenarios never trigger any P2-equivalent corrective-treatment rule violation
- `partial-data-worstcase` scenario shows `dataGapAcknowledgment` ≥ 80 (AI is honest about its limitations)
- No P2-equivalent regressions over 3 consecutive runs

## Out of scope (explicit)

- Phase-2 user-provided photos.
- Pre-submission UX modal implementation.
- Image-path critique loop (the text-path's draft-then-critique pattern). The image path's analyzer call is more expensive than the text path's; adding a critique pass roughly doubles per-call cost. Defer until we see whether single-pass image analysis can hit mid-90s.
- Image-aware facts catalog injection. The current text-facts catalog is grass-type and topic-keyed; whether the image analyzer benefits from the same injection is an empirical question for after phase 1.
- Changes to the existing text-path validation harness.
