# Competitive Differentiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify where every major competitor falls short and ship the specific features that make Yard Buddy the clear winner for homeowners who actually care about their lawns.

**Architecture:** Most differentiation comes from Claude's reasoning quality + Yard Buddy's multi-section data model — these are structural advantages that are very hard for incumbents to copy. The tasks below exploit these advantages and patch any gaps.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Prisma, PostgreSQL (Supabase), Anthropic Claude API (claude-sonnet-4-6 / claude-opus-4-7), OpenWeatherMap, Supabase Storage, Zod.

---

## Competitive Landscape: What We Learned

### Direct Competitors (DIY Lawn Guidance Apps)

| App | Strengths | Critical Weaknesses |
|-----|-----------|---------------------|
| **Yard Mastery** (100k+ users, 4.8★) | Personalized plans, soil temp, fertilizer calculators, lawn journal | Custom plans locked behind $30 proprietary soil kit; can't link 3rd-party test results; soil temp broken; calendar/journal bugs; product store gaps |
| **Grassmaster Gus** | Multiple lawn profiles, gamification (XP/badges), time-commitment customization, weather-aware reminders | Newer; gamification can feel gimmicky; no section-level management |
| **Lawn AI** | Photo analysis (grass ID, disease/pest detection), AI chat, local service map | Chat is superficial; no photo history/progression; single-yard view |
| **Blade Runner** | Generates annual plan from location + grass type + weed presence | No photo analysis; user-entered data only; no weather integration |
| **Scotts MyLawn** | 4-season calendar, rainfall tracking | Locked to Scotts products only; timing bugs (wrong region), background location tracking, technical loops on plan creation |
| **Sunday Lawn Care** | Soil analysis → custom formulations mailed to you | Product subscription first, app second; eco-focus limits mainstream appeal |

### Yard Buddy's Structural Advantages (Already Built or Planned)

1. **Multi-yard + multi-section data model** — No competitor has this. Every other app treats "the yard" as one undifferentiated blob.
2. **Claude AI quality** — Competitors use GPT-3.5 wrappers or rule-based systems. Claude (Sonnet/Opus) reasons far better about nuanced lawn conditions.
3. **No product vendor lock-in** — Pure, unbiased recommendations across all brands.
4. **Real weather integration** — Already fetching OpenWeatherMap data; weather-aware tasks are in progress.
5. **Photo upload + AI analysis** — Phase 1 already includes this.

### Advantages to Ship

1. **Photo progression tracking** — No competitor tracks health over time. We already store photos per section; surface them as a timeline.
2. **Soil test flexibility** — Yard Mastery locks users to their $30 kit. We already store `soilPh`; expand to full NPK so any test result unlocks precise recommendations.
3. **Homepage copy that lands the advantage** — Our differentiation exists in the product; homeowners Googling alternatives need to see it immediately on the landing page.
4. **Richer Claude prompts** — We use Claude; competitors use rule-based systems or GPT-3.5 wrappers. Make that gap viscerally obvious in every analysis response.

---

## File Structure

```
app/
  page.tsx                         → MODIFY: homepage hero with competitive positioning
  yards/[id]/
    sections/[sectionId]/
      photos/                      → CREATE: photo history timeline page
        page.tsx
lib/
  ai/
    analysis-prompt.ts             → MODIFY: richer Claude prompt (multi-brand, regional, section-aware)
  sections/
    photo-history.ts               → CREATE: fetch + group photos by section over time
components/
  sections/
    PhotoTimeline.tsx              → CREATE: before/after timeline UI component
    SoilDataForm.tsx               → MODIFY: expand soil data beyond soilPh
prisma/
  schema.prisma                    → MODIFY: add SectionPhoto.takenAt index for timeline queries
```

---

## Task 1: Richer Claude Prompts — Section-Aware, Multi-Brand, Regionally-Accurate

The #1 differentiator is Claude's reasoning applied to section-level data. Competitors give generic advice; we give advice specific to the front yard's shaded fescue patch vs. the backyard's sunny bermuda.

**Files:**
- Modify: `lib/ai/analysis-prompt.ts` (or wherever the current AI analysis prompt is assembled)

- [ ] **Step 1: Find the current AI prompt assembly**

```bash
grep -r "prompt\|system\|analyze" app/ lib/ --include="*.ts" -l | head -20
grep -r "anthropic\|claude\|messages" app/ lib/ --include="*.ts" -l | head -20
```

- [ ] **Step 2: Read the current prompt and understand what section data is passed**

Read the file identified above. Note what fields are currently sent to Claude (grass type, soil pH, weather, photos, etc.).

- [ ] **Step 3: Write a failing test for the enriched prompt builder**

Create `lib/ai/__tests__/analysis-prompt.test.ts`:

```typescript
import { buildSectionAnalysisPrompt } from '../analysis-prompt'

describe('buildSectionAnalysisPrompt', () => {
  const baseSection = {
    name: 'Front Yard',
    grassType: 'Tall Fescue',
    soilPh: 6.2,
    sunExposure: 'partial',
    squareFootage: 1200,
    streetAddress: '123 Main St, Atlanta, GA 30301',
  }

  const baseWeather = {
    temp: 78,
    humidity: 65,
    condition: 'Partly Cloudy',
    recentRainfall: 0.8,
    forecast: [
      { day: 'Tomorrow', high: 82, low: 61, condition: 'Sunny', chanceOfRain: 10 },
    ],
  }

  it('includes section name and grass type in system prompt', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain('Front Yard')
    expect(systemPrompt).toContain('Tall Fescue')
  })

  it('references soil pH in the prompt', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain('6.2')
  })

  it('asks for multi-brand product recommendations', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt.toLowerCase()).toContain('brand')
    expect(systemPrompt.toLowerCase()).toContain('generic')
  })

  it('includes current weather and forecast', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt).toContain('78')
    expect(systemPrompt).toContain('0.8')
  })

  it('asks for region-specific timing', () => {
    const { systemPrompt } = buildSectionAnalysisPrompt({ section: baseSection, weather: baseWeather })
    expect(systemPrompt.toLowerCase()).toContain('region')
    expect(systemPrompt.toLowerCase()).toContain('atlanta')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run lib/ai/__tests__/analysis-prompt.test.ts
```
Expected: FAIL — `buildSectionAnalysisPrompt is not a function` or similar.

- [ ] **Step 5: Implement the enriched prompt builder**

In `lib/ai/analysis-prompt.ts`, export a `buildSectionAnalysisPrompt` function. Replace or wrap the existing prompt logic:

```typescript
type SectionInput = {
  name: string
  grassType?: string | null
  soilPh?: number | null
  sunExposure?: string | null
  squareFootage?: number | null
  streetAddress?: string | null
  lotSize?: number | null
  irrigationType?: string | null
}

type WeatherInput = {
  temp: number
  humidity: number
  condition: string
  recentRainfall: number
  forecast: Array<{ day: string; high: number; low: number; condition: string; chanceOfRain: number }>
}

type PromptInput = {
  section: SectionInput
  weather: WeatherInput
  userQuestion?: string
}

export function buildSectionAnalysisPrompt({ section, weather, userQuestion }: PromptInput): {
  systemPrompt: string
  userMessage: string
} {
  const systemPrompt = `You are an expert lawn care agronomist advising a homeowner on their "${section.name}" lawn section.

LAWN PROFILE:
- Grass type: ${section.grassType ?? 'unknown — ask if important'}
- Soil pH: ${section.soilPh != null ? section.soilPh : 'not tested yet — mention testing if relevant'}
- Sun exposure: ${section.sunExposure ?? 'unknown'}
- Size: ${section.squareFootage != null ? `${section.squareFootage} sq ft` : 'unknown'}
- Location: ${section.streetAddress ?? 'unknown — use general US guidance'}
- Irrigation: ${section.irrigationType ?? 'unknown'}

CURRENT CONDITIONS (${section.streetAddress ?? 'user location'}):
- Temperature: ${weather.temp}°F
- Humidity: ${weather.humidity}%
- Conditions: ${weather.condition}
- Recent rainfall: ${weather.recentRainfall}" in last 7 days
- Forecast: ${weather.forecast.map(f => `${f.day}: ${f.high}°/${f.low}°, ${f.condition}, ${f.chanceOfRain}% rain`).join(' | ')}

INSTRUCTIONS:
1. Give advice specific to this section's grass type, sun exposure, and current regional conditions — not generic advice.
2. When recommending products, name at least 2 options across different brands (e.g., Scotts, Jonathan Green, generic store brand, organic option) and note approximate price range.
3. Adjust task timing based on actual forecast — if rain is coming, say so and adjust watering advice accordingly.
4. Flag if the soil pH is outside the ideal range for this grass type and recommend an amendment.
5. Be specific about application rates per square footage when relevant.
6. Match recommendations to the correct seasonal timing for this region (not a one-size-fits-all national calendar).
7. Keep the response practical — no more than 3-4 prioritized action items plus any photo observations.`

  const userMessage = userQuestion
    ?? `Please analyze this lawn section and give me prioritized recommendations for what to do in the next 1-2 weeks.`

  return { systemPrompt, userMessage }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run lib/ai/__tests__/analysis-prompt.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 7: Wire the new prompt builder into the existing AI analysis API route**

Find the route that calls the Anthropic API (likely `app/api/analyze/route.ts` or similar). Replace the current system prompt with:

```typescript
import { buildSectionAnalysisPrompt } from '@/lib/ai/analysis-prompt'

// Inside the route handler, replace the hardcoded system string:
const { systemPrompt, userMessage } = buildSectionAnalysisPrompt({
  section: {
    name: section.name,
    grassType: section.grassType,
    soilPh: section.soilPh,
    sunExposure: section.sunExposure,
    squareFootage: section.squareFootage,
    streetAddress: yard.streetAddress,
    lotSize: yard.lotSize,
    irrigationType: section.irrigationType,
  },
  weather: weatherData,
  userQuestion: body.question,
})
```

- [ ] **Step 8: Manually test the improved analysis**

Start the dev server and navigate to a section's analysis page. Trigger an analysis. Verify the response:
- References the specific section name
- Names multiple product brands
- Adjusts advice based on current weather forecast
- Mentions regional timing

- [ ] **Step 9: Commit**

```bash
git add lib/ai/analysis-prompt.ts lib/ai/__tests__/analysis-prompt.test.ts
git commit -m "feat: section-aware, multi-brand, regionally-accurate Claude analysis prompts"
```

---

## Task 2: Photo Progression Timeline

No competitor shows lawn health over time. Yard Buddy already stores photos per section — this feature surfaces them as a before/after health timeline. High emotional value: homeowners love seeing their lawn improve.

**Files:**
- Create: `lib/sections/photo-history.ts`
- Create: `components/sections/PhotoTimeline.tsx`
- Create: `app/yards/[id]/sections/[sectionId]/photos/page.tsx`
- Modify: `app/yards/[id]/sections/[sectionId]/page.tsx` (add link to photo history)

- [ ] **Step 1: Write a failing test for the photo history data function**

Create `lib/sections/__tests__/photo-history.test.ts`:

```typescript
import { groupPhotosByMonth } from '../photo-history'

describe('groupPhotosByMonth', () => {
  const photos = [
    { id: '1', url: 'https://example.com/a.jpg', createdAt: new Date('2026-04-05'), analysis: 'Healthy' },
    { id: '2', url: 'https://example.com/b.jpg', createdAt: new Date('2026-04-22'), analysis: null },
    { id: '3', url: 'https://example.com/c.jpg', createdAt: new Date('2026-05-10'), analysis: 'Some weeds' },
    { id: '4', url: 'https://example.com/d.jpg', createdAt: new Date('2026-06-01'), analysis: 'Improving' },
  ]

  it('groups photos into months sorted newest first', () => {
    const groups = groupPhotosByMonth(photos)
    expect(groups[0].label).toBe('June 2026')
    expect(groups[1].label).toBe('May 2026')
    expect(groups[2].label).toBe('April 2026')
  })

  it('puts all photos for the same month in the same group', () => {
    const groups = groupPhotosByMonth(photos)
    const april = groups.find(g => g.label === 'April 2026')
    expect(april?.photos).toHaveLength(2)
  })

  it('returns empty array for no photos', () => {
    expect(groupPhotosByMonth([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/sections/__tests__/photo-history.test.ts
```
Expected: FAIL — `groupPhotosByMonth is not a function`

- [ ] **Step 3: Implement photo-history.ts**

Create `lib/sections/photo-history.ts`:

```typescript
type Photo = {
  id: string
  url: string
  createdAt: Date
  analysis?: string | null
}

type PhotoGroup = {
  label: string     // "June 2026"
  yearMonth: string // "2026-06" for sorting
  photos: Photo[]
}

export function groupPhotosByMonth(photos: Photo[]): PhotoGroup[] {
  const map = new Map<string, PhotoGroup>()

  for (const photo of photos) {
    const d = new Date(photo.createdAt)
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    if (!map.has(yearMonth)) {
      map.set(yearMonth, { label, yearMonth, photos: [] })
    }
    map.get(yearMonth)!.photos.push(photo)
  }

  return Array.from(map.values()).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/sections/__tests__/photo-history.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 5: Check how photos are currently stored in Prisma schema**

```bash
grep -A 20 "model.*[Pp]hoto\|Photo\s" prisma/schema.prisma
```

Note the exact model name, field names (`url`, `createdAt`, etc.), and which model the photos belong to (Section, Yard, or dedicated Photo model).

- [ ] **Step 6: Create the PhotoTimeline component**

Create `components/sections/PhotoTimeline.tsx`:

```tsx
'use client'

import Image from 'next/image'
import { groupPhotosByMonth } from '@/lib/sections/photo-history'

type Photo = {
  id: string
  url: string
  createdAt: Date
  analysis?: string | null
}

type Props = {
  photos: Photo[]
  sectionName: string
}

export function PhotoTimeline({ photos, sectionName }: Props) {
  const groups = groupPhotosByMonth(photos)

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No photos yet</p>
        <p className="text-sm mt-1">Add photos to {sectionName} to track lawn health over time.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.yearMonth}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {group.label}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.photos.map((photo) => (
              <div key={photo.id} className="group relative rounded-lg overflow-hidden aspect-square bg-muted">
                <Image
                  src={photo.url}
                  alt={`${sectionName} — ${new Date(photo.createdAt).toLocaleDateString()}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 33vw"
                />
                {photo.analysis && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                    {photo.analysis.slice(0, 80)}{photo.analysis.length > 80 ? '…' : ''}
                  </div>
                )}
                <div className="absolute top-2 left-2 text-xs text-white bg-black/50 rounded px-1.5 py-0.5">
                  {new Date(photo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Create the photo history page**

First, confirm the actual Prisma query pattern used in other section pages:

```bash
grep -r "prisma\." app/yards --include="*.ts" --include="*.tsx" -l | head -5
```

Read one to understand the auth + prisma pattern, then create `app/yards/[id]/sections/[sectionId]/photos/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PhotoTimeline } from '@/components/sections/PhotoTimeline'

type Props = {
  params: Promise<{ id: string; sectionId: string }>
}

export default async function SectionPhotosPage({ params }: Props) {
  const { id: yardId, sectionId } = await params
  const session = await auth()

  if (!session?.user?.id) redirect('/login')

  // Verify the section belongs to a yard owned by this user
  const section = await prisma.section.findFirst({
    where: {
      id: sectionId,
      yard: { id: yardId, userId: session.user.id },
    },
    include: {
      // Use the actual relation name from schema — check Step 5 output
      photos: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!section) notFound()

  // Adjust `section.photos` to match the Photo type if field names differ
  const photos = section.photos.map((p: any) => ({
    id: p.id,
    url: p.url,
    createdAt: p.createdAt,
    analysis: p.analysis ?? null,
  }))

  return (
    <div className="container max-w-2xl py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{section.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">Photo history — {photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
      </div>
      <PhotoTimeline photos={photos} sectionName={section.name} />
    </div>
  )
}
```

- [ ] **Step 8: Add "Photo History" link to section detail page**

Find the section detail page (likely `app/yards/[id]/sections/[sectionId]/page.tsx`). Add a link near the photo upload area:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Near the photos section:
<Button variant="outline" size="sm" asChild>
  <Link href={`/yards/${yardId}/sections/${section.id}/photos`}>
    View photo history ({photoCount})
  </Link>
</Button>
```

- [ ] **Step 9: Test photo history in the browser**

Start dev server. Upload at least 2 photos to a section. Navigate to the `/photos` page. Verify:
- Photos appear grouped by month
- Hover reveals analysis snippet (if available)
- Date badges show correctly
- Empty state shows when no photos

- [ ] **Step 10: Commit**

```bash
git add lib/sections/photo-history.ts lib/sections/__tests__/photo-history.test.ts \
  components/sections/PhotoTimeline.tsx app/yards/
git commit -m "feat: photo progression timeline — track lawn health over time by section"
```

---

## Task 3: Expanded Soil Data (Beat Yard Mastery's Kit Lock-In)

Yard Mastery forces users to buy their $30 proprietary soil kit to unlock a custom plan. That's anti-user. We accept ANY soil test results. Expand the soil data stored per section so Claude can give precise fertilizer recommendations.

**Files:**
- Modify: `prisma/schema.prisma` — add soil fields to Section
- Create: `prisma/migrations/...` (via `prisma migrate dev`)
- Modify: `components/sections/SoilDataForm.tsx` (or wherever soil pH is currently edited)
- Modify: `lib/ai/analysis-prompt.ts` — include new soil fields

- [ ] **Step 1: Check the current Section schema**

```bash
grep -A 40 "model Section" prisma/schema.prisma
```

Note which soil fields already exist (likely just `soilPh`).

- [ ] **Step 2: Write a failing test for soil data validation**

Create `lib/sections/__tests__/soil-validation.test.ts`:

```typescript
import { soilDataSchema } from '../soil-validation'

describe('soilDataSchema', () => {
  it('accepts valid complete soil data', () => {
    const result = soilDataSchema.safeParse({
      soilPh: 6.5,
      nitrogenPpm: 42,
      phosphorusPpm: 28,
      potassiumPpm: 180,
      organicMatterPct: 3.2,
      soilTestSource: 'Lowe\'s Soil Test Kit',
      soilTestedAt: new Date('2026-04-01'),
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial data — only pH is provided', () => {
    const result = soilDataSchema.safeParse({ soilPh: 7.1 })
    expect(result.success).toBe(true)
  })

  it('rejects pH out of range', () => {
    const result = soilDataSchema.safeParse({ soilPh: 15 })
    expect(result.success).toBe(false)
  })

  it('accepts empty object — user has no soil data', () => {
    const result = soilDataSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/sections/__tests__/soil-validation.test.ts
```
Expected: FAIL — `soilDataSchema is not exported`

- [ ] **Step 4: Create soil-validation.ts**

Create `lib/sections/soil-validation.ts`:

```typescript
import { z } from 'zod'

export const soilDataSchema = z.object({
  soilPh: z.number().min(0).max(14).optional(),
  nitrogenPpm: z.number().min(0).optional(),
  phosphorusPpm: z.number().min(0).optional(),
  potassiumPpm: z.number().min(0).optional(),
  organicMatterPct: z.number().min(0).max(100).optional(),
  soilTestSource: z.string().max(200).optional(),
  soilTestedAt: z.coerce.date().optional(),
})

export type SoilData = z.infer<typeof soilDataSchema>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/sections/__tests__/soil-validation.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 6: Add soil fields to the Prisma schema**

In `prisma/schema.prisma`, find `model Section` and add after the existing `soilPh` field:

```prisma
  soilPh              Float?
  nitrogenPpm         Float?
  phosphorusPpm       Float?
  potassiumPpm        Float?
  organicMatterPct    Float?
  soilTestSource      String?
  soilTestedAt        DateTime?
```

- [ ] **Step 7: Run the migration**

```bash
npx prisma migrate dev --name add-section-soil-fields
```
Expected: Migration created and applied; Prisma client regenerated.

- [ ] **Step 8: Update the section edit form to include expanded soil fields**

Find the section edit form (from Step 1 grep: `app/yards/[id]/sections/[sectionId]/edit/page.tsx` or similar). Add fields after the existing soil pH input:

```tsx
// After soilPh field:
<FormField
  control={form.control}
  name="nitrogenPpm"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Nitrogen (N) — ppm</FormLabel>
      <FormControl>
        <Input type="number" step="0.1" placeholder="e.g. 42" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value ?? ''} />
      </FormControl>
      <FormDescription>From your soil test results</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="phosphorusPpm"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Phosphorus (P) — ppm</FormLabel>
      <FormControl>
        <Input type="number" step="0.1" placeholder="e.g. 28" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value ?? ''} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="potassiumPpm"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Potassium (K) — ppm</FormLabel>
      <FormControl>
        <Input type="number" step="0.1" placeholder="e.g. 180" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value ?? ''} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="soilTestSource"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Soil Test Kit / Lab</FormLabel>
      <FormControl>
        <Input placeholder="e.g. Lowe's test kit, UGA Extension Lab" {...field} value={field.value ?? ''} />
      </FormControl>
      <FormDescription>Works with any test kit or lab — not just ours</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

Also add these fields to the form's Zod schema and default values, and to the PATCH/POST API route handler that saves section data.

- [ ] **Step 9: Update the Claude prompt to use NPK data when available**

In `lib/ai/analysis-prompt.ts`, extend the LAWN PROFILE section:

```typescript
// Replace the soil pH line:
- Soil pH: ${section.soilPh != null ? section.soilPh : 'not tested yet — mention testing if relevant'}
- Nitrogen (N): ${section.nitrogenPpm != null ? `${section.nitrogenPpm} ppm` : 'not tested'}
- Phosphorus (P): ${section.phosphorusPpm != null ? `${section.phosphorusPpm} ppm` : 'not tested'}
- Potassium (K): ${section.potassiumPpm != null ? `${section.potassiumPpm} ppm` : 'not tested'}
${section.soilTestSource ? `- Soil test from: ${section.soilTestSource}` : ''}
```

Update the `SectionInput` type to include the new fields:

```typescript
type SectionInput = {
  name: string
  grassType?: string | null
  soilPh?: number | null
  nitrogenPpm?: number | null
  phosphorusPpm?: number | null
  potassiumPpm?: number | null
  soilTestSource?: string | null
  sunExposure?: string | null
  squareFootage?: number | null
  streetAddress?: string | null
  lotSize?: number | null
  irrigationType?: string | null
}
```

- [ ] **Step 10: Test the soil form in the browser**

Start dev server. Edit a section. Enter NPK values. Save. Re-open edit page — verify values pre-fill. Trigger AI analysis — verify the response references N, P, K values if you provided them.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ lib/sections/soil-validation.ts \
  lib/sections/__tests__/soil-validation.test.ts lib/ai/analysis-prompt.ts
git add app/ components/  # section edit form changes
git commit -m "feat: expanded soil data (NPK) — accept any test kit, unlock Claude NPK-aware recommendations"
```

---

## Task 4: Homepage Competitive Positioning

Homeowners searching for "lawn care app" alternatives need to see clearly why Yard Buddy wins. This task adds a homepage section that directly addresses the top competitor weaknesses without being snarky.

**Files:**
- Modify: `app/page.tsx` (or `components/home/HeroSection.tsx` / landing page component)

- [ ] **Step 1: Find the current homepage structure**

```bash
cat app/page.tsx | head -80
find components -name "*hero*" -o -name "*landing*" -o -name "*home*" | head -10
```

- [ ] **Step 2: Add a "Why Yard Buddy" comparison section**

Find the right place in the homepage (after the hero, before or after features). Add a section that surfaces the top 4 differentiators as concrete benefits:

```tsx
// components/home/WhyYardBuddy.tsx
export function WhyYardBuddy() {
  const differentiators = [
    {
      heading: 'Your whole yard, section by section',
      body: 'Front yard gets morning sun and struggles with weeds. Back yard is shaded with different grass. Most apps treat your yard as one blob. Yard Buddy tracks each section separately — different grass types, different schedules, different soil.',
      icon: '🗺️',
    },
    {
      heading: 'No kit to buy. Any soil test works.',
      body: "Some apps lock you out of custom plans unless you buy their $30 kit. Yard Buddy works with results from any lab, any test strip, or any kit you already have. Enter your N-P-K numbers and get precise fertilizer recommendations immediately.",
      icon: '🧪',
    },
    {
      heading: 'Unbiased product advice across all brands',
      body: "Other apps push their own product line. Our AI recommends the right product for your lawn — Scotts, Jonathan Green, Milorganite, generic store brand, or organic options — with price ranges so you can choose what fits your budget.",
      icon: '🌿',
    },
    {
      heading: 'Watch your lawn actually improve',
      body: 'A photo history timeline shows how your lawn looks month by month. See the before and after. Track which treatments are working. No other app shows you your lawn\'s health history like this.',
      icon: '📈',
    },
  ]

  return (
    <section className="py-16 bg-muted/40">
      <div className="container max-w-4xl">
        <h2 className="text-3xl font-bold text-center mb-2">Why Yard Buddy?</h2>
        <p className="text-center text-muted-foreground mb-10">
          Personalized advice that actually matches your yard — not a generic plan pushed by a brand.
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          {differentiators.map((d) => (
            <div key={d.heading} className="bg-background rounded-xl p-6 border">
              <div className="text-3xl mb-3">{d.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{d.heading}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{d.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

Import and render `<WhyYardBuddy />` in `app/page.tsx` in the appropriate position.

- [ ] **Step 3: Verify homepage renders correctly**

Start dev server. Open `http://localhost:3000`. Confirm:
- "Why Yard Buddy" section appears with 4 cards
- Cards are readable on mobile (stack to 1 column)
- No layout regressions to existing hero or feature sections

- [ ] **Step 4: Commit**

```bash
git add components/home/WhyYardBuddy.tsx app/page.tsx
git commit -m "feat: homepage competitive positioning — Why Yard Buddy section"
```

---

## Self-Review: Spec Coverage Check

### Spec requirements vs. tasks:

| Goal | Covered by |
|------|-----------|
| Research competitors | Competitive Landscape section above |
| Differentiate on multi-section management | Task 1 (section-aware prompts) + Task 4 (homepage copy) |
| Differentiate on AI quality | Task 1 (richer Claude prompts) |
| Differentiate on no vendor lock-in | Task 3 (any soil test) + Task 4 (homepage copy) |
| Differentiate on photo history | Task 2 (photo timeline) |
| Show we are better than competitors | Task 4 (homepage copy calls out specific advantages) |
| Expanded soil data (vs Yard Mastery) | Task 3 |
| Regional accuracy (vs Scotts) | Task 1 (prompt instructions) |
| Multi-brand recs (vs Scotts/Sunday) | Task 1 (prompt instructions) + Task 4 |

### Placeholder scan: None found — all steps have actual code.

### Type consistency:
- `SectionInput` type in `analysis-prompt.ts` gains new fields in Task 3 Step 9 — Task 1 Step 5 defines the original type; Task 3 Step 9 extends it. Both changes are in the same file.
- `Photo` type used in `photo-history.ts` and `PhotoTimeline.tsx` uses same field names (`id`, `url`, `createdAt`, `analysis`).
- Prisma field names added in Task 3 Step 6 match what Task 3 Step 8 (form fields) and Task 3 Step 9 (prompt builder) reference.
