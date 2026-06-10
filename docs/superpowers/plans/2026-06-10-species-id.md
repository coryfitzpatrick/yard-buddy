# Species-Level Weed & Pest ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lawn analysis output species-specific names for weeds, pests, and diseases (e.g., "crabgrass" instead of "grassy weed") by adding a SPECIES IDENTIFICATION RULE to both AI prompt paths.

**Architecture:** Pure prompt-engineering change. Two Claude call paths exist: (1) `analyzeImages` uses `buildSectionAnalysisPrompt` when enriched context is available, otherwise falls back to `SYSTEM_PROMPT`; (2) `generateRecommendations` always uses `SYSTEM_PROMPT`. Both paths need the rule. No schema, route, or UI changes.

**Tech Stack:** Vitest, `lib/claude.ts`, `lib/ai/analysis-prompt.ts`.

---

## File Structure

| File | Action | Change |
|---|---|---|
| `lib/ai/analysis-prompt.ts` | Modify | Add SPECIES IDENTIFICATION RULE to `systemPrompt` in `buildSectionAnalysisPrompt` |
| `lib/ai/__tests__/analysis-prompt.test.ts` | Modify | Add test: prompt includes species identification instruction |
| `lib/claude.ts` | Modify | Add SPECIES IDENTIFICATION RULE to `SYSTEM_PROMPT`; update `summary`, `title`, `description` field comments in `analyzeImages` user message |

---

## Task 1: Add species ID rule to `buildSectionAnalysisPrompt` + test

**Files:**
- Modify: `lib/ai/analysis-prompt.ts`
- Modify: `lib/ai/__tests__/analysis-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Open `lib/ai/__tests__/analysis-prompt.test.ts` and add this test inside the existing `describe('buildSectionAnalysisPrompt', ...)` block, after the last existing test:

```typescript
it("includes species identification rule in system prompt", () => {
  const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
  expect(systemPrompt).toContain("SPECIES IDENTIFICATION RULE")
  expect(systemPrompt.toLowerCase()).toContain("crabgrass")
  expect(systemPrompt.toLowerCase()).toContain("nutsedge")
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/ai/__tests__/analysis-prompt.test.ts
```

Expected: FAIL — `expect(systemPrompt).toContain("SPECIES IDENTIFICATION RULE")` fails.

- [ ] **Step 3: Add the SPECIES IDENTIFICATION RULE to `buildSectionAnalysisPrompt`**

In `lib/ai/analysis-prompt.ts`, the `systemPrompt` string ends at line 70 with the closing backtick after the HEALTHY LAWN MODE block. Insert the following block before that closing backtick, after the HEALTHY LAWN MODE section:

```typescript
// Change the end of the systemPrompt template literal from:
//   - Phrase maintenance tasks positively: "Continue your..." / "Keep up your..." / "Maintain your..." framing.`
// To:
//   - Phrase maintenance tasks positively: "Continue your..." / "Keep up your..." / "Maintain your..." framing.

SPECIES IDENTIFICATION RULE — When weeds or pests are present, always identify to the species level in task titles and descriptions. Do not use generic category names like "grassy weed," "broadleaf weed," or "pest." Instead use the specific common name: "crabgrass," "nutsedge," "dandelion," "clover," "Japanese beetle grubs," "chinch bugs," "armyworms," etc. If multiple weed or pest species are present, name the most prevalent one in the title and list others in the description. If the exact species cannot be confirmed from the image, name the most likely candidate given the grass type, region, and season — and note the uncertainty briefly (e.g., "likely crabgrass based on growth pattern"). Apply the same specificity to disease names: "brown patch," "dollar spot," "red thread" rather than "fungal disease."\``
```

The full final lines of the `systemPrompt` template literal should look like:

```typescript
  - Phrase maintenance tasks positively: "Continue your..." / "Keep up your..." / "Maintain your..." framing.

SPECIES IDENTIFICATION RULE — When weeds or pests are present, always identify to the species level in task titles and descriptions. Do not use generic category names like "grassy weed," "broadleaf weed," or "pest." Instead use the specific common name: "crabgrass," "nutsedge," "dandelion," "clover," "Japanese beetle grubs," "chinch bugs," "armyworms," etc. If multiple weed or pest species are present, name the most prevalent one in the title and list others in the description. If the exact species cannot be confirmed from the image, name the most likely candidate given the grass type, region, and season — and note the uncertainty briefly (e.g., "likely crabgrass based on growth pattern"). Apply the same specificity to disease names: "brown patch," "dollar spot," "red thread" rather than "fungal disease."`
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/ai/__tests__/analysis-prompt.test.ts
```

Expected: all tests pass (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/analysis-prompt.ts lib/ai/__tests__/analysis-prompt.test.ts
git commit -m "feat: add species-level ID rule to buildSectionAnalysisPrompt"
```

---

## Task 2: Add species ID rule to `SYSTEM_PROMPT` and update `analyzeImages` message

**Files:**
- Modify: `lib/claude.ts`

This file has no automated tests — `SYSTEM_PROMPT` is an unexported constant. The changes are verified by running the full test suite to confirm nothing broke, not by new tests.

- [ ] **Step 1: Add the SPECIES IDENTIFICATION RULE to `SYSTEM_PROMPT`**

In `lib/claude.ts`, `SYSTEM_PROMPT` currently ends the expertise/instruction section with:

```
Always give specific, actionable advice. When recommending products, suggest the active ingredient AND a common brand example. Always consider the season, grass type, and local climate when making recommendations. Be direct and practical — homeowners want to know exactly what to do and when.

DEDUPLICATION RULE — never recommend the same type of treatment more than once.
```

Insert the SPECIES IDENTIFICATION RULE block between those two paragraphs so it reads:

```typescript
Always give specific, actionable advice. When recommending products, suggest the active ingredient AND a common brand example. Always consider the season, grass type, and local climate when making recommendations. Be direct and practical — homeowners want to know exactly what to do and when.

SPECIES IDENTIFICATION RULE — When weeds or pests are present, always identify to the species level in task titles and descriptions. Do not use generic category names like "grassy weed," "broadleaf weed," or "pest." Instead use the specific common name: "crabgrass," "nutsedge," "dandelion," "clover," "Japanese beetle grubs," "chinch bugs," "armyworms," etc. If multiple weed or pest species are present, name the most prevalent one in the title and list others in the description. If the exact species cannot be confirmed from the image, name the most likely candidate given the grass type, region, and season — and note the uncertainty briefly (e.g., "likely crabgrass based on growth pattern"). Apply the same specificity to disease names: "brown patch," "dollar spot," "red thread" rather than "fungal disease."

DEDUPLICATION RULE — never recommend the same type of treatment more than once.
```

- [ ] **Step 2: Update `analyzeImages` user message field comments**

In `lib/claude.ts`, inside the `analyzeImages` function, the user message JSON structure has these field definitions (around line 219–230):

```
"summary": "2-3 sentence plain English description of what you see",
```

and in the recommendations array:

```
"title": "string",
"description": "string",
```

Update them to:

```
"summary": "2-3 sentence plain English description of what you see, naming specific weed/pest/disease species observed",
```

```
"title": "string (name specific weed/pest species if applicable, not generic categories)",
"description": "string (include species name and why it's a problem for this grass type)",
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all 212 tests pass. No failures.

- [ ] **Step 4: Commit**

```bash
git add lib/claude.ts
git commit -m "feat: add species-level ID rule to SYSTEM_PROMPT and analyzeImages prompt"
```

---

## Self-Review

**Spec coverage:**
- ✅ SPECIES IDENTIFICATION RULE added to `SYSTEM_PROMPT` — Task 2
- ✅ SPECIES IDENTIFICATION RULE added to `buildSectionAnalysisPrompt` — Task 1
- ✅ `summary` field updated to request species names — Task 2
- ✅ `title` and `description` field comments updated — Task 2
- ✅ `issues` enum unchanged — no task needed (prompt-only changes don't touch issue keys)
- ✅ Test added for `analysis-prompt.ts` — Task 1
- ✅ No schema, route, or UI changes — correct per spec

**Placeholder scan:** No TBDs, no vague steps. Every change shows the exact text before and after.

**Type consistency:** No new types introduced. Both tasks modify string constants only.
