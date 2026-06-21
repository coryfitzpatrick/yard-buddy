# Remove "AI" Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all user-facing references to "AI" with outcome-focused copy in marketing/UI surfaces and precise neutral terms ("automated" / "automated software") in legal copy, with zero behavior change.

**Architecture:** Pure copy change. Six task groups, each one file or a tight cluster of related files, each one commit. No tests to write (no behavior change); verification is grep + `tsc --noEmit` + visual smoke. Internal observability keys, prompt files, and historical docs are intentionally untouched.

**Tech Stack:** Next.js App Router (TSX), Tailwind, plain string edits.

**Spec:** [`docs/superpowers/specs/2026-06-21-remove-ai-terminology-design.md`](../specs/2026-06-21-remove-ai-terminology-design.md)

---

## Pre-flight

- [ ] **Step 0: Confirm clean working tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (or at most this plan file untracked).

---

### Task 1: Marketing surfaces — homepage, SEO description, auth taglines

**Files:**
- Modify: `app/page.tsx:10`
- Modify: `app/page.tsx:35`
- Modify: `app/layout.tsx:20`
- Modify: `app/(auth)/login/page.tsx:15`
- Modify: `app/(auth)/register/page.tsx:13`
- Modify: `app/(auth)/forgot-password/page.tsx:12`
- Modify: `app/(auth)/reset-password/page.tsx:13`

- [ ] **Step 1: Edit `app/page.tsx`**

Change line 10:
```tsx
  "AI-powered lawn diagnosis from photos",
```
to:
```tsx
  "Lawn diagnosis from your photos",
```

Change line 35:
```tsx
          Your AI lawn expert,<br />
```
to:
```tsx
          Your lawn expert,<br />
```

- [ ] **Step 2: Edit `app/layout.tsx`**

Change line 20:
```tsx
  description: "AI-powered lawn care assistant",
```
to:
```tsx
  description: "Personalized lawn care assistant",
```

- [ ] **Step 3: Edit all four auth page taglines**

In each of `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, change:
```tsx
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
```
to:
```tsx
        <p className="text-sm text-gray-500">Your personal lawn care assistant</p>
```

- [ ] **Step 4: Verify no residual "AI" in these files**

Run:
```bash
grep -n "\bAI\b" app/page.tsx app/layout.tsx app/\(auth\)/login/page.tsx app/\(auth\)/register/page.tsx app/\(auth\)/forgot-password/page.tsx app/\(auth\)/reset-password/page.tsx
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx "app/(auth)/login/page.tsx" "app/(auth)/register/page.tsx" "app/(auth)/forgot-password/page.tsx" "app/(auth)/reset-password/page.tsx"
git commit -m "Remove AI terminology from marketing and auth copy"
```

---

### Task 2: Product surfaces — analyze, pricing, settings, components, trial email

**Files:**
- Modify: `app/(dashboard)/analyze/AnalyzeClient.tsx:149`
- Modify: `app/pricing/page.tsx:23`
- Modify: `app/pricing/page.tsx:131`
- Modify: `components/home/WhyYardAnalyzer.tsx:12`
- Modify: `components/yard/setup/GrassStep.tsx:13`
- Modify: `components/settings/NotificationPreferences.tsx:105`
- Modify: `components/yard/SectionForm.tsx:327`
- Modify: `lib/email.ts:222`

- [ ] **Step 1: Edit `app/(dashboard)/analyze/AnalyzeClient.tsx`**

Change line 149:
```tsx
      <p className="text-gray-500 mb-6">Upload photos and get AI-powered diagnosis and recommendations.</p>
```
to:
```tsx
      <p className="text-gray-500 mb-6">Upload photos and get an expert diagnosis with tailored recommendations.</p>
```

- [ ] **Step 2: Edit `app/pricing/page.tsx`**

Change line 23:
```tsx
      "All AI task recommendations",
```
to:
```tsx
      "All personalized task recommendations",
```

Change line 131 (inside the Free Trial card feature list):
```tsx
                  First AI task recommendation
```
to:
```tsx
                  Your first personalized task
```

- [ ] **Step 3: Edit `components/home/WhyYardAnalyzer.tsx`**

Change line 12:
```tsx
    body: "Other apps push their own product line. Our AI recommends what's right for your lawn, whether that's Scotts, Jonathan Green, Milorganite, generic store brand, or organic options, with price ranges so you can choose what fits your budget.",
```
to:
```tsx
    body: "Other apps push their own product line. We recommend what's right for your lawn, whether that's Scotts, Jonathan Green, Milorganite, generic store brand, or organic options, with price ranges so you can choose what fits your budget.",
```

- [ ] **Step 4: Edit `components/yard/setup/GrassStep.tsx`**

Change line 13:
```tsx
      <p className="text-sm text-gray-500">Select your grass type, or upload a photo for AI identification.</p>
```
to:
```tsx
      <p className="text-sm text-gray-500">Select your grass type, or upload a photo and we'll identify it for you.</p>
```

- [ ] **Step 5: Edit `components/settings/NotificationPreferences.tsx`**

Change line 105:
```tsx
            Daily digest when AI-generated tasks are coming up or overdue.
```
to:
```tsx
            Daily digest when scheduled tasks are coming up or overdue.
```

- [ ] **Step 6: Edit `components/yard/SectionForm.tsx`**

Change line 327:
```tsx
            These are your own notes. They won&apos;t affect AI analysis.
```
to:
```tsx
            These are your own notes. They won&apos;t affect your lawn analysis.
```

- [ ] **Step 7: Edit `lib/email.ts`**

Change line 222 (inside the trial-ending email HTML template):
```ts
      ? "Your free trial ends <strong>tomorrow</strong>. After that you'll lose access to AI analysis and task recommendations."
```
to:
```ts
      ? "Your free trial ends <strong>tomorrow</strong>. After that you'll lose access to lawn analysis and task recommendations."
```

- [ ] **Step 8: Verify no residual "AI" in these files**

Run:
```bash
grep -n "\bAI\b" "app/(dashboard)/analyze/AnalyzeClient.tsx" app/pricing/page.tsx components/home/WhyYardAnalyzer.tsx components/yard/setup/GrassStep.tsx components/settings/NotificationPreferences.tsx components/yard/SectionForm.tsx lib/email.ts
```
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/analyze/AnalyzeClient.tsx" app/pricing/page.tsx components/home/WhyYardAnalyzer.tsx components/yard/setup/GrassStep.tsx components/settings/NotificationPreferences.tsx components/yard/SectionForm.tsx lib/email.ts
git commit -m "Remove AI terminology from product UI and trial email"
```

---

### Task 3: Privacy Policy

**Files:**
- Modify: `app/privacy/page.tsx:19`
- Modify: `app/privacy/page.tsx:38`
- Modify: `app/privacy/page.tsx:50`

- [ ] **Step 1: Bump "Last updated" date**

Change line 19:
```tsx
        <p className="text-sm text-gray-400 mb-10">Last updated: June 10, 2026</p>
```
to:
```tsx
        <p className="text-sm text-gray-400 mb-10">Last updated: June 21, 2026</p>
```

- [ ] **Step 2: Rewrite "How We Use Your Information" bullet**

Change line 38:
```tsx
              <li>To provide the Yard Analyzer service, including AI-powered lawn analysis and personalized recommendations</li>
```
to:
```tsx
              <li>To provide the Yard Analyzer service, including automated lawn analysis and personalized recommendations</li>
```

- [ ] **Step 3: Rewrite Anthropic third-party disclosure**

Change line 50:
```tsx
              <li><strong>Anthropic:</strong> photos and lawn data are sent to Anthropic&apos;s API for AI analysis. Anthropic&apos;s usage policies apply to this data.</li>
```
to:
```tsx
              <li><strong>Anthropic:</strong> photos and lawn data are sent to Anthropic&apos;s API for automated analysis. Anthropic&apos;s usage policies apply to this data.</li>
```

- [ ] **Step 4: Verify clean**

Run:
```bash
grep -n "\bAI\b\|artificial intelligence" app/privacy/page.tsx
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/privacy/page.tsx
git commit -m "Rewrite Privacy Policy to use \"automated\" instead of \"AI\""
```

---

### Task 4: Terms of Use

**Files:**
- Modify: `app/terms/page.tsx:19`
- Modify: `app/terms/page.tsx:30`
- Modify: `app/terms/page.tsx:34`
- Modify: `app/terms/page.tsx:35`
- Modify: `app/terms/page.tsx:37`
- Modify: `app/terms/page.tsx:38`
- Modify: `app/terms/page.tsx:68`
- Modify: `app/terms/page.tsx:74`
- Modify: `app/terms/page.tsx:80`

- [ ] **Step 1: Bump "Last updated" date**

Change line 19:
```tsx
        <p className="text-sm text-gray-400 mb-10">Last updated: June 10, 2026</p>
```
to:
```tsx
        <p className="text-sm text-gray-400 mb-10">Last updated: June 21, 2026</p>
```

- [ ] **Step 2: Rewrite "Description of Service"**

Change line 30:
```tsx
            <p>Yard Analyzer is an AI-assisted lawn care platform that helps homeowners diagnose lawn issues, track yard health, and receive personalized care recommendations. The service includes photo analysis, schedule management, weather integration, and email notifications.</p>
```
to:
```tsx
            <p>Yard Analyzer is an automated lawn care platform that helps homeowners diagnose lawn issues, track yard health, and receive personalized care recommendations. The service includes photo analysis, schedule management, weather integration, and email notifications.</p>
```

- [ ] **Step 3: Rewrite section 3 heading**

Change line 34:
```tsx
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. AI-Generated Advice: Important Disclaimer</h2>
```
to:
```tsx
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Automated Recommendations: Important Disclaimer</h2>
```

- [ ] **Step 4: Rewrite section 3 lede paragraph**

Change line 35:
```tsx
            <p className="font-medium text-gray-900">All recommendations generated by Yard Analyzer are produced by artificial intelligence and are provided for informational and educational purposes only. They are not professional horticultural, agricultural, landscaping, or agronomic advice.</p>
```
to:
```tsx
            <p className="font-medium text-gray-900">All recommendations generated by Yard Analyzer are produced by automated software and are provided for informational and educational purposes only. They are not professional horticultural, agricultural, landscaping, or agronomic advice.</p>
```

- [ ] **Step 5: Rewrite disclaimer bullets**

Change line 37:
```tsx
              <li>AI recommendations may be incorrect, incomplete, outdated, or inappropriate for your specific lawn, soil, climate, or conditions.</li>
```
to:
```tsx
              <li>Automated recommendations may be incorrect, incomplete, outdated, or inappropriate for your specific lawn, soil, climate, or conditions.</li>
```

Change line 38:
```tsx
              <li>Following AI-generated advice may result in lawn damage, plant death, wasted product, or financial loss. You assume all risk.</li>
```
to:
```tsx
              <li>Following these automated recommendations may result in lawn damage, plant death, wasted product, or financial loss. You assume all risk.</li>
```

- [ ] **Step 6: Rewrite Anthropic disclosure in section 8**

Change line 68:
```tsx
            <p>Yard Analyzer integrates with third-party providers including Anthropic (AI analysis), OpenWeatherMap (weather data), Supabase (data storage), and Resend (email delivery). Use of these services is subject to their own terms and privacy policies.</p>
```
to:
```tsx
            <p>Yard Analyzer integrates with third-party providers including Anthropic (automated analysis), OpenWeatherMap (weather data), Supabase (data storage), and Resend (email delivery). Use of these services is subject to their own terms and privacy policies.</p>
```

- [ ] **Step 7: Rewrite limitation-of-liability clause**

Change line 74:
```tsx
            <p className="mt-2">YARD ANALYZER AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY DAMAGE TO YOUR LAWN, GARDEN, PROPERTY, OR PLANTS; ANY FINANCIAL LOSS FROM PRODUCT PURCHASES MADE BASED ON APP RECOMMENDATIONS; ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES; OR ANY LOSS ARISING FROM YOUR RELIANCE ON AI-GENERATED CONTENT, WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
```
to:
```tsx
            <p className="mt-2">YARD ANALYZER AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY DAMAGE TO YOUR LAWN, GARDEN, PROPERTY, OR PLANTS; ANY FINANCIAL LOSS FROM PRODUCT PURCHASES MADE BASED ON APP RECOMMENDATIONS; ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES; OR ANY LOSS ARISING FROM YOUR RELIANCE ON AUTOMATED RECOMMENDATIONS, WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
```

- [ ] **Step 8: Rewrite indemnification clause**

Change line 80:
```tsx
            <p>You agree to indemnify and hold harmless Yard Analyzer and its operators from any claims, damages, or expenses (including reasonable legal fees) arising from your use of the service, your violation of these terms, or your application of any AI-generated lawn care recommendations.</p>
```
to:
```tsx
            <p>You agree to indemnify and hold harmless Yard Analyzer and its operators from any claims, damages, or expenses (including reasonable legal fees) arising from your use of the service, your violation of these terms, or your application of any automated lawn care recommendations.</p>
```

- [ ] **Step 9: Verify clean**

Run:
```bash
grep -n "\bAI\b\|artificial intelligence" app/terms/page.tsx
```
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add app/terms/page.tsx
git commit -m "Rewrite Terms of Use to use \"automated\" instead of \"AI\""
```

---

### Task 5: Terms acceptance modal

**Files:**
- Modify: `app/terms/accept/page.tsx:44`
- Modify: `app/terms/accept/page.tsx:45`
- Modify: `app/terms/accept/page.tsx:49`
- Modify: `app/terms/accept/page.tsx:73`

- [ ] **Step 1: Rewrite the "Advice" callout header**

Change line 44:
```tsx
              <p className="font-semibold text-gray-900 mb-1">AI-Generated Advice</p>
```
to:
```tsx
              <p className="font-semibold text-gray-900 mb-1">Automated Recommendations</p>
```

- [ ] **Step 2: Rewrite the "Advice" callout body**

Change line 45:
```tsx
              <p>Yard Analyzer&rsquo;s recommendations are generated by AI and are for informational purposes only. They are not professional lawn care advice. Following them may result in lawn damage or financial loss. You assume all risk.</p>
```
to:
```tsx
              <p>Yard Analyzer&rsquo;s recommendations are generated by automated software and are for informational purposes only. They are not professional lawn care advice. Following them may result in lawn damage or financial loss. You assume all risk.</p>
```

- [ ] **Step 3: Rewrite the liability callout**

Change line 49:
```tsx
              <p>Yard Analyzer is not liable for any damage to your lawn, garden, plants, or property arising from your use of the service or reliance on AI recommendations. Always verify product amounts against the manufacturer&rsquo;s label before applying.</p>
```
to:
```tsx
              <p>Yard Analyzer is not liable for any damage to your lawn, garden, plants, or property arising from your use of the service or reliance on these automated recommendations. Always verify product amounts against the manufacturer&rsquo;s label before applying.</p>
```

- [ ] **Step 4: Rewrite the checkbox label**

Change line 73:
```tsx
              , including the AI advice disclaimer and limitation of liability.
```
to:
```tsx
              , including the automated advice disclaimer and limitation of liability.
```

- [ ] **Step 5: Verify clean**

Run:
```bash
grep -n "\bAI\b\|artificial intelligence" app/terms/accept/page.tsx
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/terms/accept/page.tsx
git commit -m "Rewrite Terms acceptance modal to use \"automated\" instead of \"AI\""
```

---

### Task 6: Repo-wide verification + visual smoke

This task confirms scope was complete and nothing else slipped in.

- [ ] **Step 1: Sweep entire user-facing tree for residual "AI"**

Run:
```bash
grep -rin "\bAI\b\|artificial intelligence" --include="*.tsx" --include="*.ts" app/ components/ lib/email.ts
```
Expected: only these residual hits (all are explicitly out of scope per the spec):
- `lib/observability/events.ts` — `"ai.call"`, `"ai.daily_summary"` event keys
- `lib/observability/__tests__/events.test.ts` — assertions on those event keys
- `lib/__tests__/validations.test.ts` — test descriptions ("AI-generated text") referring to the validation behavior, not asserted strings
- `lib/ai/*` — internal prompts and model wiring
- `lib/prompts/base.ts` — references to fertilizer active ingredient ("AI" = active ingredient percentage, not artificial intelligence)
- `lib/facts/products.ts` — string about "AI confusion" inside an internal product fact

If anything else appears, edit it now and amend the appropriate prior commit. Do not create a new commit for stragglers — they belong to the topic they cover.

- [ ] **Step 2: Type check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run the test suite**

Run:
```bash
npm test
```
Expected: same result as on `main` before this branch (per `docs/app-store-handoff.md` line 53: 412/412 passing). No new failures.

- [ ] **Step 4: Boot the dev server**

Run:
```bash
npm run dev
```
Then visit each of these URLs in a browser and confirm zero "AI" in rendered copy:
- `http://localhost:3000/` — hero, features list, "why Yard Analyzer" cards
- `http://localhost:3000/pricing` — Free Trial card + plan feature lists
- `http://localhost:3000/login` — tagline under logo
- `http://localhost:3000/register` — tagline under logo
- `http://localhost:3000/forgot-password` — tagline under logo
- `http://localhost:3000/reset-password` — tagline under logo
- `http://localhost:3000/privacy` — full page scroll
- `http://localhost:3000/terms` — full page scroll, especially sections 2, 3, 8, 9, 10
- `http://localhost:3000/terms/accept` — three callouts + checkbox label
- After logging in: `/analyze` — page subtitle, and the grass setup wizard step
- Settings → Notification Preferences — the daily digest description
- Yard section edit form — the "your own notes" footnote

If any "AI" appears, fix it and amend the relevant commit.

- [ ] **Step 5: Confirm the SEO `<meta description>`**

In the browser DevTools, inspect `<head>` on the homepage and confirm:
```html
<meta name="description" content="Personalized lawn care assistant"/>
```

- [ ] **Step 6: No new commit needed**

This task is verification only. If everything passes, the branch is ready to merge or PR.

---

## Self-Review Notes

**Spec coverage:** Every row in the spec's "Specific Changes" tables has a corresponding step in tasks 1–5. Task 6 covers the spec's "Verification" section.

**Placeholder scan:** No TBD/TODO/"similar to". Every code block contains the literal string change.

**Type/string consistency:** Replacement strings are quoted identically to the originals (preserving `&apos;`, `&rsquo;`, `<br />`, Tailwind classes, etc.) so diffs are minimal and won't break HTML entity rendering.

**Out-of-scope guard:** Task 6 Step 1 explicitly enumerates the residual `\bAI\b` hits that should remain so the verifying engineer doesn't "fix" them by mistake. The `lib/prompts/base.ts` and `lib/facts/products.ts` hits are particularly important to leave alone — there "AI" stands for *active ingredient* (a pesticide chemistry term), not artificial intelligence.
