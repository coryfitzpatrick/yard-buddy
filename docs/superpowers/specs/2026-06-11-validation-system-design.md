# Yard Analyzer Validation System — Design Spec

**Date:** 2026-06-11
**Status:** Approved

## Problem

The app generates AI-driven lawn care recommendations based on yard profiles (grass type, soil, weather, photos). Verifying that advice is agronomically sound without waiting years for a real lawn to respond requires a structured internal validation system.

**Goals:**
- Verify AI recommendations are agronomically correct
- Detect confident bad advice produced from bad/garbage inputs
- Runnable as a one-off script and as an automated regression

**Non-goals:**
- User-facing confidence scores or benchmarks
- Real-world A/B testing with actual user lawns
- Continuous background monitoring

---

## Architecture

Three pillars, all run from a single entry point:

```
scripts/validation/
├── run.ts                  ← entry point, runs all pillars, prints report, exits non-zero on failure
├── scenarios/              ← JSON fixtures: yard profiles + ground truth + expected behaviors
│   ├── cool-season/        ← KBG, tall fescue, ryegrass scenarios
│   ├── warm-season/        ← bermuda, zoysia, st-augustine scenarios
│   └── edge-cases/         ← mixed climate, low pH, drought, sparse profiles, bad inputs
├── rules/
│   └── assertions.ts       ← hard agronomic rule functions
├── judge.ts                ← LLM-as-judge runner (GPT-4)
├── input-quality.ts        ← bad input / bad photo tests
└── results/                ← JSON output files (gitignored)
```

**Run one-off:** `npx tsx scripts/validation/run.ts`
**Run as regression:** same command in CI; exits non-zero if overall score drops >5 points from baseline or any scenario scores <60

---

## Pillar 1: Input Guard Tests

Tests that bad inputs don't silently produce confident wrong advice. No LLM judge needed — checks are string assertions on AI output.

Each test asserts one of three acceptable outcomes:
1. Input rejected with a clear error
2. AI explicitly flags the data as suspect/unreliable
3. AI asks the user to provide better data

A test **fails** if the AI produces a specific confident recommendation from obviously garbage input.

**Value boundary tests:**
- Soil pH: 0, -1, 14, "banana"
- Nitrogen ppm: 99999
- Grass type: unknown/nonexistent enum value
- Square footage: 0, 10,000,000
- ZIP code in the ocean or outside the US

**Incomplete profile tests:**
- No grass type specified
- No soil data at all
- No location or weather available
- Completely empty profile

**Photo quality tests** (submitted to photo analysis endpoint):
- Solid black or white image
- Non-lawn subject (dog, car, kitchen)
- Visibly blurry image
- Tiny thumbnail (50×50px)

---

## Pillar 2: Rule Assertion Engine

~20 hard agronomic rules from university extension guides (Penn State, Purdue, University of Florida IFAS). Each rule is a deterministic TypeScript function — no API calls, runs on every CI push.

**Type:**
```ts
type Rule = {
  id: string
  description: string
  check: (scenario: Scenario, response: string) => { pass: boolean; reason: string }
}
```

**Rules (initial set):**
- Cool-season grass + air temp >85°F → no high-nitrogen fertilizer recommended
- Warm-season grass in dormancy season → no fertilization recommended
- Soil pH <6.0 → lime or soil acidification treatment mentioned
- Soil pH >7.5 → sulfur amendment or acidifying fertilizer mentioned
- Drought indicators (low humidity + high temp + no rain) → watering advice present
- Overseeding recommendation → must reference soil temperature, not calendar date
- Pre-emergent weed control → must mention soil temp threshold (~55°F)
- Mowing height recommendation → within known range for that grass type
- Scalping warning when mowing height drops >1/3 of blade height
- No fungicide recommendation without moisture/humidity indicators present
- Fertilization after seeding → must include appropriate waiting period

Rules are sourced from extension guides and cited inline with the source URL.

---

## Pillar 3: LLM-as-Judge

The deepest layer — catches nuanced incorrect advice that rule assertions miss.

**Golden scenario set:** 25–30 JSON fixtures.

Coverage matrix:
- All major grass types: Kentucky Bluegrass, Tall Fescue, Bermudagrass, Zoysiagrass, St. Augustine, Perennial Ryegrass
- All four seasons across multiple climate zones (Pacific NW, Upper Midwest, Southeast, Southwest, Northeast)
- Common problem states: low pH, nitrogen deficiency, drought stress, pest pressure, overwatering, compaction
- Edge cases: transitional climate zones, mixed sun/shade sections, recently seeded lawn, post-renovation profiles

**Fixture schema:**
```ts
type Scenario = {
  id: string
  description: string
  profile: LawnContext           // existing type from lib/claude.ts
  groundTruth: {
    mustInclude: string[]       // key things a correct response must address
    mustNotInclude: string[]    // things a correct response must not recommend
    source: string              // extension guide URL
  }
}
```
`LawnContext` already includes weather fields — no separate weather type needed.

**Judge prompt:** Each scenario's AI output is sent to GPT-4 with:
> "You are a turfgrass expert. Given this yard profile, weather conditions, and university extension ground truth, score this lawn care recommendation 0–100. Flag any agronomically incorrect, missing, or dangerous advice. Return JSON: `{ score: number, flags: string[], reasoning: string }`"

**Scoring:**
- Results aggregate to an overall quality score per run
- Baseline stored in `results/baseline.json` after first passing run
- Regression fails if mean score drops >5 points from baseline OR any individual scenario scores <60
- Cost per run: ~25 GPT-4 calls, ~$0.10–$0.20

---

## Test Runner Output

The `run.ts` entry point prints a structured report:

```
Yard Analyzer Validation Report — 2026-06-11
─────────────────────────────────────────────
Pillar 1: Input Guard Tests     22/22 passed
Pillar 2: Rule Assertions       18/20 passed  ← 2 failures listed below
Pillar 3: LLM-as-Judge          87.3 / 100 mean score

FAILURES:
  [rule] cool-season-july-nitrogen: AI recommended 28-0-3 fertilizer in 92°F heat
  [rule] ph-low-lime: No lime or pH correction mentioned for pH 5.4 profile

Overall: FAIL (2 rule violations)
Exit code: 1
```

Results written to `results/YYYY-MM-DD-HH-mm.json`.

---

## Dependencies

- `openai` npm package (GPT-4 judge calls)
- `OPENAI_API_KEY` env var (added to Vercel env, local `.env.local`)
- AI pipeline invoked directly via `lib/claude.ts` (`generateLawnAnalysis`) and `lib/ai/analysis-prompt.ts` — no new endpoints needed
- Test images stored in `scripts/validation/fixtures/images/`

---

## Out of Scope

- UI for browsing validation results
- Automatic nightly runs (can be added later as a Vercel cron or GitHub Actions job)
- Comparing Claude model versions against each other (future enhancement)
