# Species-Level Weed & Pest Identification Design

## Goal

Make the existing lawn analysis output species-specific names for weeds and pests in task titles, descriptions, and the analysis summary — replacing generic category phrases like "grassy weed" or "broadleaf weed" with actual species names like "crabgrass," "nutsedge," or "Japanese beetle grubs."

## Architecture

This is a pure prompt-engineering change. No schema migrations, no new routes, no UI changes. The richer species names flow automatically into existing `LawnTask.title`, `LawnTask.description`, and `LawnAnalysis.summary` fields.

**Tech stack:** Claude claude-sonnet-4-6 (existing), `lib/claude.ts`, `lib/ai/analysis-prompt.ts`.

---

## What Changes

### 1. `SYSTEM_PROMPT` in `lib/claude.ts`

Add a **SPECIES IDENTIFICATION RULE** block after the existing expertise list and before the DEDUPLICATION RULE:

```
SPECIES IDENTIFICATION RULE — When weeds or pests are present, always identify to the species level in task titles and descriptions. Do not use generic category names like "grassy weed," "broadleaf weed," or "pest." Instead use the specific common name: "crabgrass," "nutsedge," "dandelion," "clover," "Japanese beetle grubs," "chinch bugs," "armyworms," etc. If multiple weed or pest species are present, name the most prevalent one in the title and list others in the description. If the exact species cannot be confirmed from the image, name the most likely candidate given the grass type, region, and season — and note the uncertainty briefly (e.g., "likely crabgrass based on growth pattern"). Apply the same specificity to disease names: "brown patch," "dollar spot," "red thread" rather than "fungal disease."
```

This rule applies to both `generateRecommendations` (text-only path) and `analyzeImages` (vision path via the `SYSTEM_PROMPT` fallback).

### 2. `buildSectionAnalysisPrompt` in `lib/ai/analysis-prompt.ts`

Add the same SPECIES IDENTIFICATION RULE to the `systemPrompt` string returned by this function. This covers the enriched vision analysis path (when `context.weatherData` is present and `buildSectionAnalysisPrompt` is used instead of the base `SYSTEM_PROMPT`).

### 3. `analyzeImages` user message in `lib/claude.ts`

In the JSON structure returned by the vision analysis, update the `"summary"` field instruction to:

```
"summary": "2-3 sentence plain English description of what you see, naming specific weed/pest species observed"
```

And update the `"title"` and `"description"` field comments in the recommendations array to note species naming is expected.

---

## What Does NOT Change

- The `issues` array enum values (`weeds_broadleaf`, `weeds_grassy`, `grubs`, `pests`, etc.) — these are category keys used throughout the app for filtering and display logic. They stay as-is.
- Schema — no Prisma changes.
- API routes — no changes to `app/api/analyze/route.ts`.
- UI — no component changes. Richer text flows into existing task title and description display.
- Tests — update `lib/ai/__tests__/analysis-prompt.test.ts` to verify the prompt includes the species identification instruction.

---

## Files

| File | Change |
|---|---|
| `lib/claude.ts` | Add SPECIES IDENTIFICATION RULE to `SYSTEM_PROMPT`; update `summary`, `title`, `description` field comments in `analyzeImages` user message |
| `lib/ai/analysis-prompt.ts` | Add SPECIES IDENTIFICATION RULE to `systemPrompt` in `buildSectionAnalysisPrompt` |
| `lib/ai/__tests__/analysis-prompt.test.ts` | Add test: prompt includes species identification instruction |

---

## Error States

None — this is a prompt change. If Claude returns a generic name despite the instruction (e.g., image is too blurry to identify a species), the fallback "likely [species] based on [signal]" phrasing is acceptable and already accounted for in the rule wording.
