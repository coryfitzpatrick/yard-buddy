# Facts Catalog + Draft-then-Self-Critique — Design

**Date:** 2026-06-13
**Author:** Tuning session (continuation of `docs/session-handoff.md`)
**Goal:** Lift Sonnet-judge P3 mean from current ~86 (Opus equivalent ~91) toward 90 Sonnet / 94+ Opus by attacking the two dominant remaining failure modes — fact-classification errors (Mag-I-Cal calcitic vs Ca-Mg, Speed Zone three-way vs four-way, CoAgMet for non-Colorado homeowners, Tenacity-on-bermuda) and single-pass framing slips (centipede unit-mixing, banned-product cross-contamination, dormancy fertilization deferral).

## North star

Best-in-class lawn AI. Mid-90s on Opus judge is the proxy; what it really tracks is agronomically correct, regionally specific, source-grounded advice the homeowner can trust.

## Problem statement

R39 (Sonnet, mean 86.0) judge feedback shows two recurring failure classes:

1. **Fact-classification errors** — the model assigns wrong attributes to a named product (Mag-I-Cal as calcitic when it's Ca-Mg; Speed Zone as a pure three-way when it contains carfentrazone; CoAgMet for Phoenix when AZMet is the Arizona tool). These survive the existing RAG layer because keyword retrieval may not surface the specific clarifying doc on every query.
2. **Single-pass framing slips** — the model emits internally inconsistent rate math (e.g., "0.5 lbs N/1,000 sq ft × 4,000 sq ft = 2.0 lbs total, within the 1 lb cap" — the units are valid but the framing reads as a contradiction). These survive because the model never re-reads its own output before emitting.

Knowledge-graph databases and full ReAct agentic loops solve broader problems than we have. The cheap, high-leverage interventions are (a) a typed facts catalog that injects deterministic verified attributes into the prompt, and (b) a draft-then-self-critique stage that audits the draft against the P2 rule set and a curated red-flag checklist before returning.

## Architecture

### New files

- `lib/facts/products.ts` — typed product catalog
- `lib/facts/regional-tools.ts` — typed state → extension-tool map
- `lib/facts/index.ts` — `getRelevantFacts(profile)` filter + markdown formatter
- `lib/prompts/critique.ts` — critique prompt template

### Modified files

- `lib/claude.ts` — facts injection between RAG block and profile JSON; two-stage critique loop wrapping the existing single call
- `scripts/validation/run.ts` (or `judge.ts`) — record critique flags per scenario into the result JSON for telemetry

### Components and responsibilities

| Component | Responsibility | Depends on |
|---|---|---|
| `products.ts` | Static typed catalog of ~30 product facts (lime classification, broadleaf temp minimums, centipede-banned products, Tenacity-banned-for-bermuda, pre-emergent rate windows) | nothing |
| `regional-tools.ts` | Static map of 10-15 states → soil-temperature extension tool (CoAgMet for CO, AZMet for AZ, etc.) | nothing |
| `facts/index.ts` | `getRelevantFacts(profile) → string` — filters catalogs by grass type, state, and topic hints; returns a `VERIFIED FACTS` markdown block, ~200-300 tokens | products, regional-tools |
| `prompts/critique.ts` | `buildCritiquePrompt(profile, factsBlock, draftJson) → string` — embeds the P2 assertion rules verbatim plus a curated red-flag checklist | nothing |
| `claude.ts` | Orchestrates draft → critique → conditional revise-and-resubmit; returns final JSON | facts/index, prompts/critique, prompts/index (existing) |
| Validation harness | Records `critiqueFlags: string[]` and `revised: boolean` per P3 scenario | claude.ts |

## Data: `products.ts` schema

```ts
export type GrassType =
  | 'kbg' | 'tall-fescue' | 'ryegrass' | 'fine-fescue'
  | 'bermuda' | 'zoysia' | 'st-augustine' | 'centipede' | 'buffalo' | 'unknown';

export type ProductCategory =
  | 'lime' | 'broadleaf-herbicide' | 'pre-emergent'
  | 'fertilizer' | 'fungicide' | 'insecticide';

export type Product = {
  name: string;                    // exact brand name as homeowners search
  brand?: string;
  category: ProductCategory;
  activeIngredients?: string[];    // e.g. ['2,4-D','MCPP','dicamba','carfentrazone-ethyl']

  // category-specific facts (only one block applies per entry)
  limeType?: 'calcitic' | 'dolomitic' | 'ca-mg';
  containsMg?: boolean;

  tempMinF?: number;               // herbicides: daytime-high minimum
  tempNotes?: string;              // e.g. "carfentrazone retains activity to 45°F"

  bannedFor?: GrassType[];         // e.g. Tenacity → ['bermuda']
  notesPerGrass?: Partial<Record<GrassType, string>>;

  notes?: string;
};
```

### Seed coverage (~30 entries)

- **Lime (6)**: Pennington Fast Acting Lime (calcitic), Greenview Mag-I-Cal (Ca-Mg), Jonathan Green MAG-I-CAL Pro (Ca-Mg variants), Old Castle Pelletized Dolomitic Lime (dolomitic), Hi-Yield Dolomitic Lime (dolomitic), generic pelletized calcitic lime (calcitic).
- **Broadleaf herbicides (8)**: Speed Zone (four-way w/ carfentrazone, tempMinF 45), Speed Zone Southern (same), Surge (four-way w/ sulfentrazone, tempMinF 50), Trimec Classic (three-way, tempMinF 60), Ortho Weed-B-Gon (three-way, tempMinF 60), Bayer All-In-One Lawn Weed & Crabgrass Killer (three-way, tempMinF 60), MSM Turf (metsulfuron, tempMinF 55), Tenacity (mesotrione, bannedFor: ['bermuda']).
- **Centipede-banned fertilizers (5)**: Pennington UltraGreen 30-0-4, Pennington UltraGreen 30-0-10, Lesco Stressgard, Scotts Turf Builder (any), Scotts WinterGuard 32-0-10 — all with `bannedFor: ['centipede']` and `notes` citing centipede decline / impossible to apply 0.5 lb N rate.
- **Pre-emergent (6)**: Andersons Barricade 0.5G (prodiamine 0.5%), Scotts Halts (pendimethalin 1.71%), Gallery 75 DF (isoxaben), Dimension 0.10% (dithiopyr), Lesco Stonewall (prodiamine), generic prodiamine 65 WDG — each with active ingredient, broadcast rate range per 1,000 sq ft, and a `notes` field on water-in window.
- **Soil acidifier / iron (3-5)**: Espoma Garden Sulfur (elemental S, granular), Bonide Sulfur Plant Fungicide (NOT for pH correction — `notes` warns it's fungicide-grade powder), Sequestar 6% Fe EDDHA (FeEDDHA for high pH), Southern Ag Chelated Liquid Iron (FeEDTA, ineffective above pH ~6.5).

Total ~30. Each entry hand-curated to address a specific R39 judge complaint or a recurring failure mode from prior runs.

## Data: `regional-tools.ts` schema

```ts
export type RegionalTool = {
  stateCode: string;        // 'CO', 'AZ', ...
  zipPrefixes: string[];    // ['80','81']
  soilTempTool: {
    name: string;           // 'CoAgMet'
    url: string;
    ownedBy: string;        // 'Colorado State University Extension'
  };
  fallbackPhrase: string;   // used when generating prose
};
```

Seed: CO (CoAgMet), AZ (AZMet), GA + AL + SC + NC + TN (Georgia Weather Network / UGA — GAEMN), FL (FAWN), TX (TexMesonet), OH + IN + MI (Enviroweather / OARDC), KS + MO (Kansas Mesonet / MOmesonet), NY (NEWA), CA (CIMIS), MN + WI (NDAWN / Wisconet). ~14 states.

Default for unmapped ZIPs: `"your state's cooperative extension soil-temperature network or a calibrated soil thermometer"`.

## `getRelevantFacts(profile)` filter logic

Input: the existing `LawnProfile` (already used by RAG `retrieve.ts`). Output: a single markdown block.

```
VERIFIED FACTS (deterministic; trust over general knowledge):

Products:
- Greenview Mag-I-Cal contains MAGNESIUM (Ca-Mg). Do NOT classify as calcitic.
- Speed Zone four-way (2,4-D + MCPP + dicamba + carfentrazone-ethyl). Effective at ~45°F+ daytime highs.
- Tenacity (mesotrione) is PHYTOTOXIC to bermuda — never recommend on bermuda.
[... 4-8 more entries filtered by grass type + topic hints ...]

Regional resources:
- Phoenix AZ (85xxx-86xxx): AZMet (azmet.arizona.edu) — University of Arizona Extension.
[1-2 entries based on ZIP]
```

Filter pseudocode:
1. Resolve `stateCode` from ZIP prefix.
2. Resolve `grassType` from profile (already normalized in existing code).
3. Walk `products.ts`, include if: `bannedFor` mentions `grassType`, OR `category` matches a topic hint inferred from notes (lime/pH → lime; weed/broadleaf → broadleaf-herbicide; crabgrass/Poa → pre-emergent; iron/chlorosis → soil-acidifier).
4. Walk `regional-tools.ts`, include the one matching `stateCode`.
5. Format as compact markdown bullets. Cap at ~12 facts to keep token budget bounded.

Insertion point in `claude.ts`: between the RAG block and the profile JSON, under a header that says these facts override general knowledge.

## Critique stage

### Prompt structure

`prompts/critique.ts` exports `buildCritiquePrompt({ profile, factsBlock, draftJson })` returning a single user message:

```
You are auditing a lawn-care recommendation draft for rule violations.
Do NOT rewrite the draft. Only emit a JSON list of specific violations.

PROFILE: <profile JSON>

VERIFIED FACTS: <same facts block injected into draft>

CHECKLIST (flag ANY violation):
[verbatim P2 assertion descriptions — 30-40 rules, e.g. "no fertilizer in dormancy",
 "centipede max annual N is 1 lb per 1,000 sq ft", "no Tenacity for bermuda",
 "no broadcast pre-emergent in spring on recently-seeded lawn", ...]

CURATED RED FLAGS:
- Centipede unit-mixing: any sentence that combines a per-1,000-sq-ft rate with a per-lawn total without explicit unit labels.
- Regional tool mismatch: recommending CoAgMet outside Colorado or AZMet outside Arizona.
- Lime classification: calling Mag-I-Cal calcitic, or recommending dolomitic without confirmed Mg deficiency.
- Speed Zone misclassification: treating Speed Zone as a pure three-way for cold-weather guidance.
- Dormant turf disturbance: peel test, scalping, or aeration on dormant warm-season turf.
- Banned product cross-recommendation: any product in the bannedFor list for this grass type.

DRAFT:
<draft JSON>

Output exactly: {"violations": ["<short description of each issue>", ...]}
Empty list means no violations.
```

### Loop in `claude.ts`

```ts
const draft = await sonnetCall(systemPrompt, userPrompt);          // call 1
const critique = await sonnetCall(null, buildCritiquePrompt(...));  // call 2

if (critique.violations.length === 0) {
  return { ...draft, critiqueFlags: [], revised: false };
}

const revised = await sonnetCall(systemPrompt, buildReviseUserPrompt(userPrompt, draft, critique.violations));  // call 3
return { ...revised, critiqueFlags: critique.violations, revised: true };
```

No second critique. No retry loops. Caching applies to the system prompt across all three calls so the marginal cost is the user-prompt + output tokens for calls 2 and 3.

### Revise-and-resubmit prompt

`buildReviseUserPrompt(originalUserPrompt, draft, violations)`:

```
Your previous draft for this profile had the following rule violations:

<violations bullets>

Original draft:
<draft JSON>

Re-emit the FULL JSON, identical to your draft EXCEPT where you need to fix
the listed violations. Do not introduce other changes.
```

## Telemetry

`scripts/validation/run.ts` (P3 path) records two new fields per scenario in the result JSON:

```json
{
  "scenarioId": "centipede-summer",
  "score": 92,
  "flags": [...],
  "reasoning": "...",
  "critiqueFlags": ["..."],
  "revised": false
}
```

`scripts/validation/compare.ts` extended to surface `critiqueFlags` and `revised` deltas between runs so we can measure (a) what fraction of the time the critique fires, and (b) whether revision actually moves judge scores.

## Cost and latency

- **Draft only (current)**: 1 Sonnet call. Reference cost.
- **Draft + critique, no violations (happy path)**: 2 Sonnet calls. ~1.5–1.7× cost (critique prompt is shorter than draft prompt; output is just a small JSON). ~+3-5 s latency.
- **Draft + critique + revise (violations found)**: 3 Sonnet calls. ~2.2–2.5× cost. ~+6-9 s latency.
- System-prompt and RAG-block caching reduces cost meaningfully because all three calls share the same large prefix.

For the homeowner UX, the +3-5 s happy-path latency is acceptable on a "generate plan" interaction. If/when this lands behind a streaming UI, we can stream the draft, then run critique server-side and emit a revision-or-confirm event.

## Error handling

- If the critique call itself fails or returns non-JSON: log the error, return the draft as-is with `critiqueFlags: ['critique_call_failed']`. Do not block the user on critique reliability.
- If the revise call fails: return the original draft with `critiqueFlags: critique.violations, revised: false, revisionFailed: true`. Better to ship a flagged draft than nothing.
- If the critique returns violations that the revise call doesn't actually address: out of scope for v1. We can add a post-revise diff check in v2.

## Testing strategy

1. **Unit tests** for `getRelevantFacts(profile)` — golden snapshots of the formatted block for ~5 representative profiles (KBG/Denver, bermuda/Phoenix, centipede/Charleston, tall-fescue/Atlanta, St. Augustine/Houston).
2. **Unit tests** for the catalog seed — every entry has the required category-specific fields populated; no duplicate names.
3. **P2 assertions** continue to run against the final (post-critique) JSON. If critique works as intended, P2 pass rate stays at 165/165 with fewer near-misses on individual scenarios.
4. **P3 validation** is the ultimate measure. Target: Sonnet mean ≥ 89 (which maps to Opus ≥ 93) over 3 Sonnet runs after this lands.

## Out of scope (explicitly)

- Embeddings-based facts retrieval (the catalog is small enough; deterministic filter is the point).
- Multi-pass critique loops (no iterative revision — one pass max).
- Cheap-model critique (using Haiku for critique is a v2 cost optimization once A proves out).
- Tool-use / agentic patterns (we have no live data source that would benefit from planning).
- Expanding facts beyond the categories above (we grow into them as future judge failures reveal new gaps).

## Success criteria

- Sonnet P3 mean ≥ 89 over a 3-run average (currently 86 ±2).
- Opus P3 mean ≥ 93 over a 1-run sample (currently 91.3 best clean signal).
- Validation logs show `revised: true` rate of ~20-40% (sanity check that the critique is firing meaningfully but not on every call).
- No P2 regressions (165/165 maintained).
- Latency P95 under 15 s end-to-end for a recommendation.
