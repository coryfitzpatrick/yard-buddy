# Personalized Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `WateringCard` and `RoutineCaptureCard` on the section detail page with a single collapsible "Personalized Reminders" card showing user-entered mowing and watering schedules, editable via the section edit page.

**Architecture:** Add `mowingSchedule` to the `YardSection` Prisma model and `wateringSchedule` + `mowingSchedule` to the Zod validation layer. A new static `PersonalizedRemindersCard` renders between past analyses and the task list, always visible and closed by default. Editing flows through the existing `SectionForm` via two new text inputs. All AI-driven watering/routine components and their API routes are deleted.

**Tech Stack:** Prisma (PostgreSQL), Zod, Next.js App Router server + client components, shadcn/ui (Input, Label, Button), Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Modify | `lib/validations/yard.ts` |
| Modify | `lib/__tests__/validations.test.ts` |
| **Create** | `components/sections/PersonalizedRemindersCard.tsx` |
| Modify | `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx` |
| Modify | `app/(dashboard)/yard/[id]/page.tsx` |
| Modify | `app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx` |
| Modify | `components/yard/SectionForm.tsx` |
| **Delete** | `components/sections/WateringCard.tsx` |
| **Delete** | `components/sections/RoutineCaptureCard.tsx` |
| **Delete** | `app/api/sections/[sectionId]/watering/route.ts` |
| **Delete** | `app/api/sections/[sectionId]/routine/preview/route.ts` |
| **Delete** | `app/api/sections/[sectionId]/routine/confirm/route.ts` |
| Modify | `scripts/seed-demo.ts` |

---

## Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit the YardSection model**

In `prisma/schema.prisma`, find the `YardSection` model. Locate these two lines:
```prisma
  wateringSchedule  String?
  wateringDeviates  Boolean?
```

Replace with:
```prisma
  wateringSchedule  String?
  mowingSchedule    String?
```

(`wateringDeviates` is removed; `mowingSchedule` is added.)

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_mowing_schedule_drop_watering_deviates
```

When prompted about dropping `wateringDeviates` being potentially destructive, enter `y`. Expected output ends with:
```
✔ Generated Prisma Client
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add mowingSchedule, drop wateringDeviates from YardSection"
```

---

## Task 2: Validation schema + tests (TDD)

**Files:**
- Modify: `lib/__tests__/validations.test.ts`
- Modify: `lib/validations/yard.ts`

- [ ] **Step 1: Write failing tests**

In `lib/__tests__/validations.test.ts`, inside the `describe("yardSectionSchema")` block, add after the last existing test:

```typescript
  it("accepts mowingSchedule as a short string", () => {
    const result = yardSectionSchema.safeParse({ ...base, mowingSchedule: "Weekly at 3.5 inches" });
    expect(result.success).toBe(true);
  });

  it("rejects mowingSchedule longer than 500 chars", () => {
    const result = yardSectionSchema.safeParse({ ...base, mowingSchedule: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts mowingSchedule as absent", () => {
    const result = yardSectionSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mowingSchedule).toBeUndefined();
  });

  it("accepts wateringSchedule as a short string", () => {
    const result = yardSectionSchema.safeParse({ ...base, wateringSchedule: "Mon/Wed/Fri mornings, 20 min" });
    expect(result.success).toBe(true);
  });

  it("rejects wateringSchedule longer than 500 chars", () => {
    const result = yardSectionSchema.safeParse({ ...base, wateringSchedule: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts wateringSchedule as absent", () => {
    const result = yardSectionSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wateringSchedule).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- validations
```

Expected: 6 new tests fail (Zod strips unknown keys by default, so the tests that pass a value will fail because the key is unrecognized or stripped).

- [ ] **Step 3: Add the two fields to `yardSectionSchema`**

In `lib/validations/yard.ts`, add after the `notes` line:

```typescript
  notes: z.string().max(500).optional(),
  mowingSchedule: z.string().max(500).optional(),
  wateringSchedule: z.string().max(500).optional(),
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npm test -- validations
```

Expected: all tests pass including the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/yard.ts lib/__tests__/validations.test.ts
git commit -m "feat: add mowingSchedule and wateringSchedule to yardSectionSchema"
```

---

## Task 3: PersonalizedRemindersCard component

**Files:**
- Create: `components/sections/PersonalizedRemindersCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

interface Props {
  yardId: string;
  sectionId: string;
  mowingSchedule: string | null;
  wateringSchedule: string | null;
}

export function PersonalizedRemindersCard({
  yardId,
  sectionId,
  mowingSchedule,
  wateringSchedule,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasContent = mowingSchedule || wateringSchedule;

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-6">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center justify-between w-full px-5 py-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Personalized Reminders
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {!hasContent ? (
            <p className="text-sm text-gray-500">
              <Link
                href={`/yard/${yardId}/sections/${sectionId}/edit`}
                className="text-green-600 hover:underline"
              >
                Set your schedule on the edit page →
              </Link>
            </p>
          ) : (
            <>
              {mowingSchedule && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Mowing</p>
                  <p className="text-sm text-gray-700">{mowingSchedule}</p>
                </div>
              )}
              {wateringSchedule && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Watering</p>
                  <p className="text-sm text-gray-700">{wateringSchedule}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/sections/PersonalizedRemindersCard.tsx
git commit -m "feat: add PersonalizedRemindersCard component"
```

---

## Task 4: Update section detail page

**Files:**
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx`

- [ ] **Step 1: Update the yard select in the DB query**

The `yard` select currently includes `wateringDaysPerWeek` and `wateringMinutesPerSession` (used by the removed WateringCard). Replace:

```typescript
      yard: {
        select: {
          id: true,
          name: true,
          wateringDaysPerWeek: true,
          wateringMinutesPerSession: true,
        },
      },
```

With:

```typescript
      yard: {
        select: {
          id: true,
          name: true,
        },
      },
```

- [ ] **Step 2: Swap imports**

Remove:
```typescript
import { RoutineCaptureCard } from "@/components/sections/RoutineCaptureCard";
import { WateringCard } from "@/components/sections/WateringCard";
```

Add:
```typescript
import { PersonalizedRemindersCard } from "@/components/sections/PersonalizedRemindersCard";
```

- [ ] **Step 3: Remove the WateringCard JSX block**

Delete these lines (the entire WateringCard usage):
```tsx
      <WateringCard
        sectionId={sectionId}
        yardId={yardId}
        initialSchedule={section.wateringSchedule}
        initialDeviates={section.wateringDeviates}
        hasYardSchedule={
          section.yard.wateringDaysPerWeek != null &&
          section.yard.wateringMinutesPerSession != null
        }
      />
```

- [ ] **Step 4: Add PersonalizedRemindersCard between past analyses and tasks**

Replace the comment `{/* Tasks */}` and everything that follows (through the end of the RoutineCaptureCard block) with:

```tsx
      <PersonalizedRemindersCard
        yardId={yardId}
        sectionId={sectionId}
        mowingSchedule={section.mowingSchedule ?? null}
        wateringSchedule={section.wateringSchedule ?? null}
      />

      {/* Tasks */}
      {serializedTasks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Tasks
          </h2>
          <TaskList tasks={serializedTasks} multiYard={false} />
        </div>
      )}
    </div>
  );
}
```

(This replaces the original tasks block + the conditional RoutineCaptureCard that followed it.)

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If TypeScript complains about `section.mowingSchedule` not existing, confirm the Prisma client was regenerated in Task 1 (`npx prisma generate` if needed).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/yard/[id]/sections/[sectionId]/page.tsx"
git commit -m "feat: replace WateringCard + RoutineCaptureCard with PersonalizedRemindersCard"
```

---

## Task 5: Remove wateringDeviates from yard detail page

**Files:**
- Modify: `app/(dashboard)/yard/[id]/page.tsx`

- [ ] **Step 1: Find the three references**

```bash
grep -n "wateringDeviates\|Droplets" "app/(dashboard)/yard/[id]/page.tsx"
```

Expected output shows three `wateringDeviates` lines and one `Droplets` import/usage.

- [ ] **Step 2: Remove from the section query select**

Find `wateringDeviates: true` in the sections query select and delete that line.

- [ ] **Step 3: Remove the deviation summary block**

Find and delete this block (around lines 115–117):
```typescript
const sectionsWithRecs = sections.filter(
  (s) => s.wateringDeviates !== null && s.wateringDeviates !== undefined
);
const deviating = sectionsWithRecs.filter((s) => s.wateringDeviates === true);
```

Also delete any JSX that references `sectionsWithRecs` or `deviating` (e.g., a summary banner showing how many sections deviate). If other variables depend on these, remove them too.

- [ ] **Step 4: Remove the per-section Droplets icon**

Find and delete the JSX block in the section card:
```tsx
{section.wateringDeviates === true && (
  <Droplets ... />
)}
```

Then check if `Droplets` is still imported anywhere in the file:
```bash
grep -n "Droplets" "app/(dashboard)/yard/[id]/page.tsx"
```

If no remaining usages, remove `Droplets` from the lucide-react import line.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/yard/[id]/page.tsx"
git commit -m "feat: remove wateringDeviates indicators from yard detail page"
```

---

## Task 6: Add fields to SectionForm and edit page

**Files:**
- Modify: `components/yard/SectionForm.tsx`
- Modify: `app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx`

- [ ] **Step 1: Add to useForm defaultValues**

In `components/yard/SectionForm.tsx`, in the `useForm` `defaultValues` object (around line 44), add after the `notes` entry:

```typescript
        notes: initialData?.notes ?? undefined,
        mowingSchedule: initialData?.mowingSchedule ?? undefined,
        wateringSchedule: initialData?.wateringSchedule ?? undefined,
```

- [ ] **Step 2: Add the form fields**

In the JSX, after the closing `</div>` of the "Additional Notes" block (the block ending with `{errors.notes && ...}`), insert before the error display `<div>`:

```tsx
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700">Personalized Reminders</h3>
          <div className="space-y-1">
            <Label htmlFor="mowingSchedule">Mowing schedule</Label>
            <Input
              id="mowingSchedule"
              placeholder="e.g. Weekly at 3.5 inches"
              {...register("mowingSchedule")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wateringSchedule">Watering schedule</Label>
            <Input
              id="wateringSchedule"
              placeholder="e.g. Mon/Wed/Fri mornings, 20 min per zone"
              {...register("wateringSchedule")}
            />
          </div>
          <p className="text-xs text-gray-400">
            These are your own notes — they won&apos;t affect AI analysis.
          </p>
        </div>
```

- [ ] **Step 3: Update the edit page initialData**

In `app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx`, add to the `initialData` object passed to `SectionForm` (after the `notes` line):

```typescript
          notes: section.notes ?? undefined,
          mowingSchedule: section.mowingSchedule ?? undefined,
          wateringSchedule: section.wateringSchedule ?? undefined,
```

The edit page query uses `findFirst` with no explicit `select` on the section, so all fields including `mowingSchedule` and `wateringSchedule` are already returned.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/yard/SectionForm.tsx "app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx"
git commit -m "feat: add mowing and watering schedule fields to section form"
```

---

## Task 7: Delete removed files

**Files:**
- Delete: `components/sections/WateringCard.tsx`
- Delete: `components/sections/RoutineCaptureCard.tsx`
- Delete: `app/api/sections/[sectionId]/watering/route.ts`
- Delete: `app/api/sections/[sectionId]/routine/preview/route.ts`
- Delete: `app/api/sections/[sectionId]/routine/confirm/route.ts`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -r "WateringCard\|RoutineCaptureCard\|/watering\|/routine" app/ components/ --include="*.tsx" --include="*.ts" -l
```

Expected: no output. If any files still reference these, fix them before proceeding.

- [ ] **Step 2: Delete the files and empty directories**

```bash
rm components/sections/WateringCard.tsx
rm components/sections/RoutineCaptureCard.tsx
rm "app/api/sections/[sectionId]/watering/route.ts"
rm "app/api/sections/[sectionId]/routine/preview/route.ts"
rm "app/api/sections/[sectionId]/routine/confirm/route.ts"
rmdir "app/api/sections/[sectionId]/routine/preview"
rmdir "app/api/sections/[sectionId]/routine/confirm"
rmdir "app/api/sections/[sectionId]/routine"
```

- [ ] **Step 3: Run full type-check and tests**

```bash
npx tsc --noEmit && npm test
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete WateringCard, RoutineCaptureCard, and AI watering/routine API routes"
```

---

## Task 8: Update seed data

**Files:**
- Modify: `scripts/seed-demo.ts`

- [ ] **Step 1: Add `mowingSchedule` to all seven section creates**

Add a `mowingSchedule` field to each `db.yardSection.create` call. Use the values below — match to section by name:

**Henderson — Front Yard** (bermuda, Atlanta, full sun):
```typescript
      mowingSchedule: "Every 5-7 days at 1.5 inches during growing season. Mow in early morning before peak heat.",
```

**Henderson — Back Yard** (bermuda, Atlanta, full sun):
```typescript
      mowingSchedule: "Every 5-7 days at 1.5 inches. Skip the play zone near the deck if turf is actively recovering.",
```

**Henderson — Left Side Yard** (tall fescue, shaded):
```typescript
      mowingSchedule: "Every 10-14 days at 3.5 inches. Never remove more than 1/3 of blade length — fescue in shade grows slowly.",
```

**Henderson — Back Patio Border** (st_augustine, partial shade):
```typescript
      mowingSchedule: "Every 7-10 days at 3 inches. Edge along the patio border after each mow.",
```

**Rivera — Front Yard** (zoysia, Austin, full sun):
```typescript
      mowingSchedule: "Every 7-10 days at 2 inches during growing season. Zoysia is slow-growing — avoid scalping.",
```

**Rivera — Back Yard** (st_augustine, Austin, partial shade):
```typescript
      mowingSchedule: "Every 7 days at 3.5 inches. Avoid mowing within 48 hours of insecticide application.",
```

**Rivera — Right Side** (st_augustine, narrow strip):
```typescript
      mowingSchedule: "Every 10-14 days at 3.5 inches. Use a string trimmer rather than a mower in this narrow strip.",
```

- [ ] **Step 2: Remove all `wateringDeviates` assignments**

```bash
grep -n "wateringDeviates" scripts/seed-demo.ts
```

Delete every line returned. There should be seven (one per section).

- [ ] **Step 3: Verify the seed compiles**

```bash
npx tsc --noEmit 2>&1 | grep "seed-demo" | head -10
```

Expected: no output (no errors). Fix any TypeScript complaints about the removed field before proceeding.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "chore: add mowingSchedule to demo seed, remove wateringDeviates"
```
