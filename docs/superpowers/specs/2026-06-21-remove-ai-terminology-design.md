# Remove "AI" terminology from user-facing copy

**Date:** 2026-06-21
**Status:** Approved, ready for implementation plan

## Motivation

The term "AI" is a turn-off for some prospective users. Marketing positioning sells the *outcome* (a knowledgeable lawn expert in your pocket) rather than the *mechanism* (a large language model). Legal disclosures still need to clearly identify that recommendations come from non-human software, but can use precise neutral terms rather than the loaded "AI" abbreviation.

## Scope

In scope:
- All user-facing UI strings across marketing pages, auth pages, dashboard, settings, and emails.
- Legal copy: Terms of Use, Privacy Policy, and the Terms acceptance modal.
- The SEO `<meta description>` on the root layout.

Out of scope:
- Internal observability event names (`ai.call`, `ai.daily_summary` in `lib/observability/events.ts`) — never user-visible.
- The `lib/ai/` and `lib/prompts/` directories — internal prompts and model wiring.
- Test descriptions and code comments referencing "AI-generated text".
- Historical planning docs under `docs/superpowers/plans/` and `docs/superpowers/specs/`.

## Approach

**Marketing/UI copy:** outcome-focused phrasing with no tech word. The product becomes the actor ("we recommend", "your lawn expert", "personalized task").

**Legal copy:** replace "AI" with neutral, precise terms — "automated" or "automated software" for the actor, "automated recommendations" for the output. This preserves the disclaimer's substance (a non-human is producing the advice, so users assume risk) without the marketing baggage of "AI".

**Re-acceptance:** not required. App is pre-launch with no live users. The wording change is terminology, not substance. The same Anthropic API call still produces the same recommendations under the same liability cap. Bumping the "Last updated" date on both legal pages is sufficient.

## Specific Changes

### Marketing / UI (12 strings)

| File | Line | Before | After |
|---|---|---|---|
| `app/page.tsx` | 10 | `"AI-powered lawn diagnosis from photos"` | `"Lawn diagnosis from your photos"` |
| `app/page.tsx` | 35 | `Your AI lawn expert,<br />` | `Your lawn expert,<br />` |
| `app/layout.tsx` | 20 | `description: "AI-powered lawn care assistant"` | `description: "Personalized lawn care assistant"` |
| `app/(auth)/login/page.tsx` | 15 | `Your AI lawn care assistant` | `Your personal lawn care assistant` |
| `app/(auth)/register/page.tsx` | 13 | `Your AI lawn care assistant` | `Your personal lawn care assistant` |
| `app/(auth)/forgot-password/page.tsx` | 12 | `Your AI lawn care assistant` | `Your personal lawn care assistant` |
| `app/(auth)/reset-password/page.tsx` | 13 | `Your AI lawn care assistant` | `Your personal lawn care assistant` |
| `app/(dashboard)/analyze/AnalyzeClient.tsx` | 149 | `Upload photos and get AI-powered diagnosis and recommendations.` | `Upload photos and get an expert diagnosis with tailored recommendations.` |
| `app/pricing/page.tsx` | 23 | `"All AI task recommendations"` | `"All personalized task recommendations"` |
| `app/pricing/page.tsx` | 131 | `First AI task recommendation` | `Your first personalized task` |
| `components/home/WhyYardAnalyzer.tsx` | 12 | `Other apps push their own product line. Our AI recommends what's right for your lawn,` | `Other apps push their own product line. We recommend what's right for your lawn,` |
| `components/yard/setup/GrassStep.tsx` | 13 | `Select your grass type, or upload a photo for AI identification.` | `Select your grass type, or upload a photo and we'll identify it for you.` |
| `components/settings/NotificationPreferences.tsx` | 105 | `Daily digest when AI-generated tasks are coming up or overdue.` | `Daily digest when scheduled tasks are coming up or overdue.` |
| `components/yard/SectionForm.tsx` | 327 | `These are your own notes. They won't affect AI analysis.` | `These are your own notes. They won't affect your lawn analysis.` |
| `lib/email.ts` | 222 | `you'll lose access to AI analysis and task recommendations.` | `you'll lose access to lawn analysis and task recommendations.` |

### Legal — `app/privacy/page.tsx`

| Line | Before | After |
|---|---|---|
| 19 | `Last updated: June 10, 2026` | `Last updated: June 21, 2026` |
| 38 | `including AI-powered lawn analysis and personalized recommendations` | `including automated lawn analysis and personalized recommendations` |
| 50 | `photos and lawn data are sent to Anthropic's API for AI analysis. Anthropic's usage policies apply to this data.` | `photos and lawn data are sent to Anthropic's API for automated analysis. Anthropic's usage policies apply to this data.` |

### Legal — `app/terms/page.tsx`

| Line | Before | After |
|---|---|---|
| 19 | `Last updated: June 10, 2026` | `Last updated: June 21, 2026` |
| 30 | `Yard Analyzer is an AI-assisted lawn care platform` | `Yard Analyzer is an automated lawn care platform` |
| 34 | `3. AI-Generated Advice: Important Disclaimer` | `3. Automated Recommendations: Important Disclaimer` |
| 35 | `All recommendations generated by Yard Analyzer are produced by artificial intelligence and are provided for informational and educational purposes only.` | `All recommendations generated by Yard Analyzer are produced by automated software and are provided for informational and educational purposes only.` |
| 37 | `AI recommendations may be incorrect, incomplete, outdated, or inappropriate` | `Automated recommendations may be incorrect, incomplete, outdated, or inappropriate` |
| 38 | `Following AI-generated advice may result in lawn damage, plant death, wasted product, or financial loss.` | `Following these automated recommendations may result in lawn damage, plant death, wasted product, or financial loss.` |
| 68 | `Anthropic (AI analysis)` | `Anthropic (automated analysis)` |
| 74 | `ANY LOSS ARISING FROM YOUR RELIANCE ON AI-GENERATED CONTENT` | `ANY LOSS ARISING FROM YOUR RELIANCE ON AUTOMATED RECOMMENDATIONS` |
| 80 | `your application of any AI-generated lawn care recommendations` | `your application of any automated lawn care recommendations` |

### Legal — `app/terms/accept/page.tsx`

| Line | Before | After |
|---|---|---|
| 44 | `AI-Generated Advice` | `Automated Recommendations` |
| 45 | `Yard Analyzer's recommendations are generated by AI and are for informational purposes only.` | `Yard Analyzer's recommendations are generated by automated software and are for informational purposes only.` |
| 49 | `or reliance on AI recommendations.` | `or reliance on these automated recommendations.` |
| 73 | `including the AI advice disclaimer and limitation of liability.` | `including the automated advice disclaimer and limitation of liability.` |

## Verification

After all edits:

1. **Repo-wide check:** `grep -rin "\bAI\b\|artificial intelligence" --include="*.tsx" --include="*.ts" app/ components/ lib/email.ts` returns only the expected residual internal references in `lib/observability/`, `lib/ai/`, `lib/prompts/`, and test files. Zero hits inside user-facing strings.
2. **Type check:** `npx tsc --noEmit` clean.
3. **Tests:** the test suite still passes. Tests in `lib/__tests__/validations.test.ts` reference "AI-generated text" only in test descriptions, not asserted strings — they should continue passing untouched.
4. **Manual smoke:** load `/`, `/pricing`, `/login`, `/terms`, `/privacy`, and `/terms/accept` in the dev server and confirm no "AI" appears in rendered copy.

## Non-goals

- This is not a rename of internal modules, types, or event keys. Anything observable only to developers stays as-is.
- This is not a rewrite of the disclaimer's substance. Liability scope, retention periods, and third-party disclosures are unchanged. Only the terminology naming the recommendation engine changes.
