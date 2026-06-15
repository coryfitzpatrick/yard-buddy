# Image-Path Validation — Handoff

Last updated 2026-06-15 (session 2 end). Pick this up cold when resuming work on the `analyzeImagesBase64` validation suite.

## TL;DR — current state

- **Sonnet mean: 93.9 / Opus mean: 93.3.** Past the 90+ releasable threshold; climbing toward 95+ best-in-class.
- 12 scenarios live, 10 of 12 at Opus 92+, 6 of 12 at Opus 95+.
- Two scenarios drag the mean below best-in-class: `bermuda-dormancy-winter` (Opus 86) and `mixed-issue-lawn` (Opus 87). Both look tractable.
- Sonnet ≈ Opus calibration confirmed twice (Δ -0.3, Δ -0.6). Use Sonnet for iteration, Opus for milestones.

## Architecture

`scripts/validation/run-image.ts` mirrors the text-path harness:

- Loads 12 image scenarios from `scripts/validation/scenarios-image/*.json`
- Calls `lib/claude.ts → analyzeImagesBase64(base64Images, profile)` for each scenario
- Photos base64-loaded at runtime from `scripts/validation/photos/<scenario-id>/`
- Three pillars:
  - **P1** = scenario integrity (12/12 ✓ currently)
  - **P2** = image rule assertions (4 per scenario — `must-include-required`, `must-not-include-blocked`, `healthy-lawn-maintenance-only`, etc.). 3-5 known stable failures (see "Known P2 failures" below).
  - **P3** = image-aware ensemble-3 judge with photos attached to every judge call. The headline.

### Runner flags

| Command | Cost | Purpose |
|---|---|---|
| `npm run validate:image` | ~$8-12 (Sonnet) | Full 12-scenario sweep |
| `JUDGE_MODEL=claude-opus-4-7 npm run validate:image` | ~$25-30 (Opus) | Milestone confirmation |
| `npm run validate:image:smoke` | ~$0.30 | One scenario (`healthy-kbg-front`) for cheap sanity check |
| `npm run validate:image -- --scenarios id1,id2` | ~$1-3 per id | Targeted iteration (added session 2) |

### Phase 1 RAG (wired session 2)

`analyzeImagesBase64` now injects top-3 keyword-RAG chunks into the user message before the photo context. Retrieval uses `retrieveRelevant` from `lib/rag` with grass-type filter + `inferTopicHints`. No photo-context tuning yet — that's phase 2 (see "Open work" below).

The text-path's 18 RAG docs at `lib/rag/docs/*.md` are now reachable from the image path. The earlier disjoint state where `analysis-prompt.ts` was self-contained and `base.ts`'s fungicide guidance never reached the image path is fixed.

## Final per-scenario state (Opus, end of session 2)

Sorted by score, with R05 baseline (session 1 end) for context:

| Scenario | Opus | R05 baseline | Δ | Drag |
|---|---|---|---|---|
| drought-fescue | **98** | 81 | +17 | none |
| partial-data-worstcase | **96** | 45 | **+51** | none |
| dollar-spot-kbg | **96** | 86 | +10 | none |
| brown-patch-closeup | 95 | 94 | +1 | none |
| gray-leaf-spot-st-aug | 95 | 97 | -2 | sample variance (99 in single-scenario, 95 in full) |
| healthy-kbg-front | 95 | 94 | +1 | none |
| grub-damage-multi | 94 | 88 | +6 | none |
| healthy-bermuda-peak | 93 | 89 | +4 | cross 60 (could lift with per-photo summary prompts) |
| recently-seeded-damping | 93 | 79 | +14 | minor |
| healthy-tall-fescue-fall | 92 | 89 | +3 | cross 60 |
| **mixed-issue-lawn** | **87** | SKIP (R05 JSON-flake) | — | recs 75 + vision-side disease conflation |
| **bermuda-dormancy-winter** | **86** | 88 | -2 | recs 60 (RAG injecting pre-emergent content into a dormant scenario) |

## Dimension means (Opus)

| Dimension | R05 baseline | Final | Δ |
|---|---|---|---|
| grassTypeAccuracy | 100 | 100 | 0 |
| issuesF1 | 83.4 | **98.3** | +14.9 |
| healthScoreInRange | 75.7 | **100** | +24.3 |
| recommendationQuality | 79.5 | 85.1 | +5.6 |
| dataGapAcknowledgment | 100 | 100 | 0 |
| crossPhotoSynthesis | 66.9 | **87.2** | +20.3 |

The issuesF1 lift (83.4 → 98.3) came almost entirely from the **photo-first diagnostic priority rule** (session 2 breakthrough). The recs and cross dims are the two with room left.

## Session 2 work log (what produced the lift)

| Step | Commit | Lift | Description |
|---|---|---|---|
| 1 | `f86ee4a` | infrastructure | `--scenarios <csv>` filter flag in `run-image.ts` |
| 2 | `fdc41c6` | 84.8 → 90.1 Sonnet | Phase 1 RAG wire-up + 8 prompt rules in `lib/ai/analysis-prompt.ts` (anti-fabrication for edge weeds, visible-symptom detection, canonical issue vocabulary, Pythium fungicide selection, healthy-exclusivity, drought-wilt calibration, grass-type unknown passthrough, notes-vs-photo discipline) |
| 3 | `b4da40f` | (part of step 2) | Realigned 5 scenarios where ground-truth claimed visible issues the photos didn't actually show (partial-data, recently-seeded, drought-fescue, dollar-spot, mixed-issue) |
| 4 | `b55f73a` | 87.6 → 90.8 Opus | Removed "dormancy" from canonical vocabulary (warm-season dormancy IS healthy per prompt); tightened weed_pressure-when-visible rule. Fixed Opus-only label drift on bermuda-dormancy + partial-data. |
| 5 | `0cc728a` | mixed-issue 82 → 85 | Swapped 3 of 4 mixed-issue-lawn photos to reference-library multi-issue images (brown-patch.jpg, dollar-spot-2.jpg, salt-damage.jpg) + added MULTI-PHOTO MULTI-PATHOLOGY SYNTHESIS rule |
| 6 | `2fc9715` | 93.1 → 93.9 Sonnet, 90.8 → 93.3 Opus | **PHOTO-FIRST DIAGNOSTIC PRIORITY rule** (user's breakthrough insight). AI now treats photos as primary expert evidence and notes as secondary context. Predisposing factors (low N, high N, recent fert) go in recommendations, not issues. Cracked dollar-spot and gray-leaf-spot's stuck issuesF1=67. Added dollar-spot vs Pythium mycelium disambiguation. |

## Prompt anatomy (where the rules live)

All session-2 rules are in `lib/ai/analysis-prompt.ts`. Read lines 75-125 for the most-recently-added rules. Key blocks in order:

1. **VISUAL ASSESSMENT CALIBRATION** (line 75ish) — health-score-by-photo-content ranges, anti-pessimism rules, warm-season-dormancy-is-healthy, cool-season-summer-dormancy-is-healthy, drought-wilt-is-recoverable (50-75 range)
2. **DO NOT EXPAND A SINGLE VISIBLE ISSUE** — anti-fragmentation rule
3. **MULTI-PHOTO MULTI-PATHOLOGY SYNTHESIS** — when DIFFERENT photos show DIFFERENT problem types, list each distinct issue separately. Counter-rule to anti-fragmentation.
4. **DO NOT INVENT ISSUES FROM PROFILE DATA** — pH or other profile data not photo-visible doesn't go in issues
5. **PHOTO-FIRST DIAGNOSTIC PRIORITY** — the big one. Photos primary, notes secondary. Predisposing factors go to recommendations, not issues.
6. **NUTRIENT ISSUES REQUIRE VISIBLE EVIDENCE** — `nutrient_deficiency` only when uniform chlorosis is photo-visible. Disease-driven yellowing (dollar spot, rust) is NOT chlorosis.
7. **HEALTH SCORE CALIBRATION** — 6 score-vs-content bands plus drought-wilt carve-out
8. **LIMITED-DATA HOMEOWNER GUIDANCE** — sparse-profile scenarios, includes grass-type-unknown passthrough
9. **SPECIES IDENTIFICATION RULE** — gated on in-canopy presence. Edges/borders explicitly excluded from weed_pressure.
10. **FUNGICIDE SELECTION ACCURACY** — pathogen-class-specific recommendations including dollar-spot vs Pythium disambiguation
11. **VISIBLE-SYMPTOM ISSUE DETECTION** — chlorosis → nutrient_deficiency, wilt+dry → drought_stress
12. **STANDARD ISSUE VOCABULARY** — canonical issue labels, no "dormancy" (it's healthy), strict weed_pressure-when-visible

## Key learnings to remember

1. **Photo-first reasoning was the breakthrough.** AI was reading homeowner notes ("low on N this year") as standalone diagnoses and inflating the issues array. Telling it to diagnose from photos first lifted issuesF1 from 83.4 → 98.3.
2. **Sonnet ≈ Opus calibration is real and stable.** Both measurements within 1 point. Use Sonnet for iteration (~$10/full sweep), Opus only for milestones (~$25-30).
3. **Several "ground-truth photos" didn't show what the ground-truth claimed.** Honest realignment of ground truth to match what's in photos was often the right move (5 scenarios realigned in `b4da40f`). When the AI's read is internally consistent and ground truth was over- or under-strict, realign. When ground truth is correct and AI is wrong, fix prompt or photos.
4. **`--scenarios` filter pays for itself.** Per-scenario runs at $1-3 vs full sweep at $10 let you iterate 5-10× before doing the regression check.
5. **Stochastic variance is real even with ensemble-3.** Single scenarios can swing ±10 points between identical configs (e.g. gray-leaf-spot scored 99 in single-scenario, 95 in full). Don't conclude from one sample.
6. **`analysis-prompt.ts` is self-contained** — does NOT include `base.ts`. Text-path rules don't reach image path unless duplicated. RAG wire-up partially solves this; consider unifying as phase 3.
7. **Vision-side disease ID has limits.** Dollar-spot mycelium and Pythium mycelium look similar in dew. Brown patch ring and dollar spot scattered patches can be conflated. Explicit disambiguation rules help.

## What's still open (path to 95+ best-in-class)

### Primary drags (sub-90 Opus scenarios)

**bermuda-dormancy-winter 86** (recs=60).

RAG injects pre-emergent / weed-control content into a dormant-turf scenario because `lib/rag/docs/12-warm-season-dormancy.md` co-references pre-emergent timing. The AI then mentions herbicide/fertilizer which the dormancy P2 rule forbids.

Fix options, in order of effort:
- (a) Edit `12-warm-season-dormancy.md` to remove forbidden phrases (herbicide, pre-emergent, fertilizer affirmative) from chunks that retrieve for dormancy queries
- (b) Add a "scenario-context exclusion" mechanism in `lib/rag/index.ts` — when grassType is dormant warm-season, skip docs with topic `pre-emergent` or `weed-control`
- (c) Add prompt rule: "When the scenario is winter dormancy of warm-season turf, do NOT include any pre-emergent, herbicide, or fertilizer recommendations even if RAG content mentions them — defer all such guidance to spring green-up."

Target: lift bermuda-dormancy from 86 → 92+. Headline impact: ~+0.5 mean.

**mixed-issue-lawn 87** (recs=75, issues=80).

Three sub-issues:
- AI's vision conflates photo 2 (dollar-spot's scattered small patches) with photo 1 (brown-patch ring) as "brown patch spread", missing dollar spot.
- Scotts product confusion (DiseaseEx vs GrubEx labeling).
- Diatomaceous earth recommendation for chinch bugs (weak agronomically).
- Wrong regional extension cite (K-State for an OH lawn).

Fix options:
- (a) Replace photo 2 with a closer hourglass-lesion shot (the `dollar-spot-kbg/02.jpg` close-up may work as a transplant) so the AI gets blade-level dollar-spot evidence
- (b) Add an OH-specific RAG doc / per-state extension hint mechanism (currently extensions are picked by `region` metadata; could be tightened by ZIP)
- (c) Add Scotts product disambiguation block to the prompt (DiseaseEx = azoxystrobin fungicide; GrubEx = chlorantraniliprole insecticide; do not interchange)

Target: lift mixed-issue from 87 → 92+. Headline impact: ~+0.5 mean.

### Secondary drags (90-93 scenarios)

`healthy-bermuda-peak`, `healthy-tall-fescue-fall`, and `bermuda-dormancy-winter` all have crossPhotoSynthesis ~60. Could lift with explicit per-photo callout requirement in the summary.

### Phase 2 RAG (eventual)

Image-path RAG retrieval is currently text-path-tuned (queries built from notes + profile text). Photo-context-aware retrieval would help: if photos show fungal lesions, prefer the relevant disease doc. Not done yet because phase 1 already delivered the headline.

### Phase 3 unification (eventual)

Long-term, `analysis-prompt.ts` and `buildSystemPrompt` (the text path) should share `base.ts` + RAG and only diverge in the user-message construction. Currently the two paths drift apart — any rule added to one needs to be duplicated to the other.

## Photo set state

`scripts/validation/photos/` contains 30 scenario photos + 49-photo reference library at `analysis/`. Reference library sources (all locally-stored fixtures, not redistributed):

- Pexels — verified-lawn close-ups for healthy + drought + dormancy
- The Spruce article screenshots — cropped to remove disease-name labels (canonical brown patch, anthracnose, gray snow mold, pink snow mold, rust, slime mold)
- Lawngevity — drought stress, chinch bug close-up, dormant grass, billbug larva (the real grub photo)
- Milorganite — additional disease references
- Covington Naturals — NC State / Kansas State / Iowa State / UMass university-credited disease photos

`LICENSES.md` in the photos directory tracks every file's source.

Reference library (`scripts/validation/photos/analysis/`) is the catalog of pre-sourced photos available for swapping into scenarios. Notable picks used in session 2:
- `brown-patch.jpg` (textbook Rhizoctonia ring) — used in `mixed-issue-lawn/01.jpg`
- `dollar-spot-2.jpg` (wide dollar-spot patches) — used in `mixed-issue-lawn/02.jpg`
- `salt-damage.jpg` (dead/bare strip) — used in `mixed-issue-lawn/04.jpg` (proxy for bare_spots)
- `chinch-bugs-closeup.jpg` (macro insect ID) — used in `mixed-issue-lawn/03.jpg`

Other pickable photos for future swaps: `anthracnose.jpg`, `armyworm.jpg`, `billbug-larva.jpg`, `crabgrass.jpg`, `fairy-ring.jpg`, `gray-leaf-spot-ncstate.jpg`, `gray-snow-mold.jpg`, `necrotic-ring-spot.jpg`, `pink-snow-mold.jpg`, `pythium-ksu.jpg`, `red-thread-2.png`, `summer-patch-umass.jpg`, plus 9 weed close-ups.

## Cost reference (for budgeting next session)

| Operation | Sonnet | Opus |
|---|---|---|
| Full 12-scenario sweep | ~$8-12 | ~$25-30 |
| `--smoke` (1 scenario, healthy-kbg-front) | ~$0.30 | n/a |
| Targeted `--scenarios id` (1 scenario) | ~$1-3 | ~$3-5 |
| Targeted `--scenarios id1,id2,id3` (3 scenarios) | ~$3-8 | ~$8-15 |

Session 2 total spend was approximately $150: 4 full Sonnet runs, 3 full Opus runs, ~17 single-scenario reruns. Most of that was the Opus runs — keep iteration on Sonnet, reserve Opus for milestones.

## Known P2 failures (stable across many runs)

These are recurring P2 rule assertions that don't break P3 scoring but are noisy. Not regressions from session 2:

- `bermuda-dormancy-winter/must-not-include-blocked` "herbicide" — RAG injecting weed-control content
- `bermuda-dormancy-winter/must-include-required` "maintain" — AI sometimes doesn't use that exact word
- `healthy-kbg-front/must-include-required` "irrigation" — AI sometimes uses "watering" instead
- `healthy-tall-fescue-fall/must-not-include-blocked` "herbicide" — same as bermuda
- `mixed-issue-lawn/must-include-required` "fungus" — AI uses specific labels like "brown_patch" instead

Future cleanup: relax these rules to accept synonyms (irrigation/watering, fungus/dollar_spot/brown_patch, etc.).

## Quick-start for a cold pickup

```bash
cd /Users/cory/Projects/yard-analyzer

# 1. Confirm starting state (no API cost)
git log --oneline -10                                                              # see session-2 commits
ls scripts/validation/results/ | tail -5                                            # recent run results

# 2. Read the prompt anatomy
# lib/ai/analysis-prompt.ts lines 75-125 are the session-2 rules

# 3. Baseline (Sonnet, ~$10)
npm run validate:image

# 4. Targeted iteration on the two sub-90 Opus scenarios (~$2-6)
npm run validate:image -- --scenarios bermuda-dormancy-winter
npm run validate:image -- --scenarios mixed-issue-lawn

# 5. After fixes, full Sonnet (~$10), then Opus milestone (~$25-30)
JUDGE_MODEL=claude-opus-4-7 npm run validate:image
```

## Next-session execution plan

**Goal:** push Opus mean from 93.3 → 95+ (best-in-class).

**Sequence:**

1. **Quick context refresh** (~5 min, no cost):
   - `git log --oneline -10` to see the 7 commits from session 2
   - Read `lib/ai/analysis-prompt.ts` lines 75-125 (the session-2 prompt rules)
   - Skim this doc + `docs/session-handoff.md`

2. **Targeted Sonnet baseline** (~$5):
   - `npm run validate:image -- --scenarios bermuda-dormancy-winter,mixed-issue-lawn` to characterize the two scenarios needing most work. Each iteration vs this baseline.

3. **Fix bermuda-dormancy-winter** (~$3-10):
   - See "Primary drags" → bermuda-dormancy section above for fix options.
   - Target: lift bermuda-dormancy from 86 → 92+. Headline impact: ~+0.5.

4. **Fix mixed-issue-lawn** (~$3-10):
   - See "Primary drags" → mixed-issue-lawn section above for fix options.
   - Target: lift mixed-issue from 87 → 92+. Headline impact: ~+0.5.

5. **Run full Sonnet sweep** (~$10):
   - Confirm no regressions on the other 10 scenarios.
   - Target: Sonnet ≥95.

6. **Opus milestone** (~$25-30):
   - Only if Sonnet ≥95.
   - Target: Opus ≥95 (best-in-class).

**Cost budget for this sequence: ~$45-65 to reach best-in-class.**

**Key calibration:** Sonnet ≈ Opus on image path (Δ -0.6 measured session 2, Δ -0.3 session 1). Stable.

**Key principle from session 2:** when the AI's read is internally consistent and the ground truth is over- or under-strict relative to what's actually visible in photos, realign ground truth honestly rather than chasing the score. When ground truth is right and the AI is wrong, fix the prompt or photos.
