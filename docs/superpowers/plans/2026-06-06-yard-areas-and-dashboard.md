# Yard → Sections Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the data model so a Yard = one property with multiple named Sections (Front, Back, Left Side, etc.), each section getting its own analysis and task list, plus a Yard→Section picker on the Analyze page.

**Architecture:** Add `Yard` (property-level: name, ZIP, location) and `YardSection` (area-level: grass type, soil, equipment) models. Migrate existing `YardProfile` data into the new structure — each old profile becomes one `Yard` + one `YardSection` — preserving all existing FK references by keeping IDs and only renaming the `yardProfileId` columns. The Analyze page gains a two-step Yard → Section picker before photo upload.

**Tech Stack:** Next.js 16 App Router, Prisma 6, PostgreSQL (Supabase SQL editor for migrations), React Hook Form + Zod, Tailwind CSS, Claude Sonnet via `lib/claude.ts`, lucide-react.

---

### Task 1: Database migration

**Files:**
- Modify: `prisma/schema.prisma`
- (SQL to run manually in Supabase SQL editor — no prisma migrate)

- [ ] **Step 1: Run the migration SQL in Supabase SQL editor**

```sql
-- 1. Create Yard table (property level)
CREATE TABLE "Yard" (
  "id"        TEXT        NOT NULL,
  "userId"    TEXT        NOT NULL,
  "name"      TEXT        NOT NULL DEFAULT 'My Property',
  "zipCode"   TEXT        NOT NULL,
  "city"      TEXT,
  "state"     TEXT,
  "latitude"  DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Yard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Yard_userId_idx" ON "Yard"("userId");
ALTER TABLE "Yard" ADD CONSTRAINT "Yard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Create YardSection table (area level)
CREATE TABLE "YardSection" (
  "id"            TEXT    NOT NULL,
  "yardId"        TEXT    NOT NULL,
  "name"          TEXT    NOT NULL DEFAULT 'Front Yard',
  "areaType"      TEXT,
  "yardSizeSqft"  INTEGER,
  "grassType"     TEXT    NOT NULL DEFAULT 'unknown',
  "soilPh"        DOUBLE PRECISION,
  "soilMoisture"  TEXT,
  "spreaderType"  TEXT,
  "spreaderModel" TEXT,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "YardSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "YardSection_yardId_idx" ON "YardSection"("yardId");

-- 3. Migrate each YardProfile → one Yard + one YardSection
--    YardSection keeps the SAME id as the old YardProfile so existing
--    LawnAnalysis and LawnTask rows still point to the right record.
DO $$
DECLARE
  rec         RECORD;
  new_yard_id TEXT;
BEGIN
  FOR rec IN SELECT * FROM "YardProfile" LOOP
    new_yard_id := gen_random_uuid()::text;
    INSERT INTO "Yard" ("id","userId","name","zipCode","city","state","latitude","longitude","createdAt","updatedAt")
    VALUES (new_yard_id, rec."userId", rec."name", rec."zipCode", rec."city", rec."state", rec."latitude", rec."longitude", rec."createdAt", rec."updatedAt");

    INSERT INTO "YardSection" ("id","yardId","name","areaType","yardSizeSqft","grassType","soilPh","soilMoisture","spreaderType","spreaderModel","notes","createdAt","updatedAt")
    VALUES (rec."id", new_yard_id, rec."name", NULL, rec."yardSizeSqft", rec."grassType", rec."soilPh", rec."soilMoisture", rec."spreaderType", rec."spreaderModel", rec."notes", rec."createdAt", rec."updatedAt");
  END LOOP;
END $$;

-- 4. Add FK on YardSection → Yard
ALTER TABLE "YardSection" ADD CONSTRAINT "YardSection_yardId_fkey"
  FOREIGN KEY ("yardId") REFERENCES "Yard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Rename yardProfileId → yardSectionId (values unchanged — same IDs)
ALTER TABLE "LawnAnalysis" RENAME COLUMN "yardProfileId" TO "yardSectionId";
ALTER TABLE "LawnTask"     RENAME COLUMN "yardProfileId" TO "yardSectionId";

-- 6. Drop old FK constraints
ALTER TABLE "LawnAnalysis" DROP CONSTRAINT IF EXISTS "LawnAnalysis_yardProfileId_fkey";
ALTER TABLE "LawnTask"     DROP CONSTRAINT IF EXISTS "LawnTask_yardProfileId_fkey";

-- 7. Add new FK constraints pointing at YardSection
ALTER TABLE "LawnAnalysis" ADD CONSTRAINT "LawnAnalysis_yardSectionId_fkey"
  FOREIGN KEY ("yardSectionId") REFERENCES "YardSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LawnTask" ADD CONSTRAINT "LawnTask_yardSectionId_fkey"
  FOREIGN KEY ("yardSectionId") REFERENCES "YardSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Drop YardProfile (data is fully migrated)
ALTER TABLE "YardProfile" DROP CONSTRAINT IF EXISTS "YardProfile_userId_fkey";
DROP TABLE "YardProfile";
```

- [ ] **Step 2: Update `prisma/schema.prisma`**

Replace the `YardProfile` model and update `LawnAnalysis` and `LawnTask`:

```prisma
model Yard {
  id        String        @id @default(cuid())
  userId    String
  name      String        @default("My Property")
  zipCode   String
  city      String?
  state     String?
  latitude  Float?
  longitude Float?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  sections  YardSection[]

  @@index([userId])
}

model YardSection {
  id            String         @id @default(cuid())
  yardId        String
  name          String         @default("Front Yard")
  areaType      String?
  yardSizeSqft  Int?
  grassType     String         @default("unknown")
  soilPh        Float?
  soilMoisture  String?
  spreaderType  String?
  spreaderModel String?
  notes         String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  yard          Yard           @relation(fields: [yardId], references: [id], onDelete: Cascade)
  analyses      LawnAnalysis[]
  tasks         LawnTask[]

  @@index([yardId])
}

model LawnAnalysis {
  id             String      @id @default(cuid())
  yardSectionId  String
  imageUrls      String[]
  healthScore    Int
  issues         String[]
  summary        String      @db.Text
  rawResponse    String      @db.Text
  createdAt      DateTime    @default(now())
  yardSection    YardSection @relation(fields: [yardSectionId], references: [id], onDelete: Cascade)
  tasks          LawnTask[]

  @@index([yardSectionId])
}

model LawnTask {
  id              String        @id @default(cuid())
  yardSectionId   String
  analysisId      String?
  title           String
  description     String        @db.Text
  priority        String        @default("medium")
  status          String        @default("pending")
  dueDate         DateTime?
  completedAt     DateTime?
  product         String?
  applicationRate String?
  spreaderSetting String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  yardSection     YardSection   @relation(fields: [yardSectionId], references: [id], onDelete: Cascade)
  analysis        LawnAnalysis? @relation(fields: [analysisId], references: [id])

  @@index([yardSectionId])
  @@index([analysisId])
}
```

Also update the `User` model — remove `yardProfiles YardProfile[]`, add `yards Yard[]`.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: replace YardProfile with Yard + YardSection data model"
```

---

### Task 2: Types and validation schemas

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/validations/yard.ts` (split into `lib/validations/yard.ts` + `lib/validations/section.ts`)

- [ ] **Step 1: Add `AreaType` to `types/index.ts`**

```typescript
export type AreaType =
  | "front"
  | "back"
  | "left_side"
  | "right_side"
  | "garden"
  | "other";
```

Remove the `YardProfile` references. The `RecommendationItem` interface stays unchanged.

- [ ] **Step 2: Replace `lib/validations/yard.ts` content**

The file now holds two schemas: Yard (property) and YardSection (area).

```typescript
import { z } from "zod";

export const yardSchema = z.object({
  name: z.string().min(1).default("My Property"),
  zipCode: z.string().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code"),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type YardInput = z.infer<typeof yardSchema>;

export const yardSectionSchema = z.object({
  name: z.string().min(1).default("Front Yard"),
  areaType: z.enum(["front", "back", "left_side", "right_side", "garden", "other"]).optional(),
  yardSizeSqft: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(100).max(100000).optional()
  ),
  grassType: z.enum([
    "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
    "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
  ]),
  soilPh: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(4).max(9).optional()
  ),
  soilMoisture: z.enum(["dry", "moderate", "moist"]).optional(),
  spreaderType: z.enum(["broadcast", "drop", "handheld", "liquid", "none"]).optional(),
  spreaderModel: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type YardSectionInput = z.infer<typeof yardSectionSchema>;
export type YardSectionFormInput = z.input<typeof yardSectionSchema>;
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: errors for files still importing `yardProfileSchema` — note them for fixing in later tasks.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts lib/validations/yard.ts
git commit -m "feat: add AreaType, Yard schema, and YardSection schema"
```

---

### Task 3: AreaTypeSelector component

**Files:**
- Create: `components/yard/AreaTypeSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { AreaType } from "@/types";
import { cn } from "@/lib/utils";
import { Home, TreePine, PanelLeft, PanelRight, Flower2, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AreaConfig { label: string; icon: LucideIcon; hint: string; }

export const AREA_CONFIG: Record<AreaType, AreaConfig> = {
  front:      { label: "Front Yard",  icon: Home,       hint: "Street-facing, high visibility" },
  back:       { label: "Back Yard",   icon: TreePine,   hint: "Private, recreational space" },
  left_side:  { label: "Left Side",   icon: PanelLeft,  hint: "Side yard, left of house" },
  right_side: { label: "Right Side",  icon: PanelRight, hint: "Side yard, right of house" },
  garden:     { label: "Garden",      icon: Flower2,    hint: "Garden or landscaped area" },
  other:      { label: "Other",       icon: MapPin,     hint: "Custom area" },
};

interface Props {
  value: AreaType | null | undefined;
  onChange: (v: AreaType) => void;
}

export function AreaTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {(Object.entries(AREA_CONFIG) as [AreaType, AreaConfig][]).map(([key, cfg]) => {
        const Icon = cfg.icon;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all hover:border-green-400",
              selected ? "border-green-600 bg-green-50" : "border-gray-200 bg-white"
            )}
          >
            <Icon className={cn("w-5 h-5", selected ? "text-green-700" : "text-gray-400")} />
            <span className="font-medium text-sm">{cfg.label}</span>
            <span className="text-xs text-gray-400 leading-tight">{cfg.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/yard/AreaTypeSelector.tsx
git commit -m "feat: add AreaTypeSelector component"
```

---

### Task 4: API routes — Yard CRUD

**Files:**
- Modify: `app/api/yard/route.ts`
- Modify: `app/api/yard/[id]/route.ts`

- [ ] **Step 1: Rewrite `app/api/yard/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSchema } from "@/lib/validations/yard";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { sections: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(yards);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = yardSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const yard = await db.yard.create({
    data: { ...parsed.data, userId: session.user.id },
  });
  return NextResponse.json(yard, { status: 201 });
}
```

- [ ] **Step 2: Rewrite `app/api/yard/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSchema } from "@/lib/validations/yard";

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await db.yard.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.yard.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/yard/route.ts app/api/yard/\[id\]/route.ts
git commit -m "feat: update Yard CRUD API routes for new schema"
```

---

### Task 5: API routes — YardSection CRUD

**Files:**
- Create: `app/api/yard/[id]/sections/route.ts`
- Create: `app/api/yard/[id]/sections/[sectionId]/route.ts`

- [ ] **Step 1: Create `app/api/yard/[id]/sections/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSectionSchema } from "@/lib/validations/yard";

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sections = await db.yardSection.findMany({
    where: { yardId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(sections);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const section = await db.yardSection.create({
    data: { ...parsed.data, yardId: id },
  });
  return NextResponse.json(section, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/yard/[id]/sections/[sectionId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSectionSchema } from "@/lib/validations/yard";

async function getOwnedSection(sectionId: string, userId: string) {
  return db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const section = await getOwnedSection(sectionId, session.user.id);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await db.yardSection.update({ where: { id: sectionId }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const section = await getOwnedSection(sectionId, session.user.id);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.yardSection.delete({ where: { id: sectionId } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/yard/\[id\]/sections/route.ts app/api/yard/\[id\]/sections/\[sectionId\]/route.ts
git commit -m "feat: add YardSection CRUD API routes"
```

---

### Task 6: Update analyze and recommendations APIs

**Files:**
- Modify: `app/api/analyze/route.ts`
- Modify: `app/api/recommendations/route.ts`
- Modify: `lib/claude.ts`

- [ ] **Step 1: Add `areaType` to `LawnContext` in `lib/claude.ts`**

```typescript
export interface LawnContext {
  grassType: GrassType;
  zipCode: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  spreaderType?: string | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  weatherSummary?: string;
  notes?: string | null;
}
```

In both prompts (`generateRecommendations` and `analyzeImages`), add after the Grass Type line:

```typescript
${context.areaType ? `Yard Area: ${context.areaType.replace(/_/g, " ")} (${
  context.areaType === "front"      ? "high visibility, aesthetics matter most" :
  context.areaType === "back"       ? "recreational use, durability matters" :
  context.areaType === "left_side" || context.areaType === "right_side"
                                    ? "narrow side yard, often shaded" :
  context.areaType === "garden"     ? "garden or landscaped area" :
  "custom area"
})` : ""}
```

- [ ] **Step 2: Rewrite `app/api/analyze/route.ts`**

Change `profileId` → `sectionId` throughout and use `db.yardSection`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId, imageUrls } = await req.json();
  if (!sectionId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return NextResponse.json({ error: "sectionId and imageUrls[] required" }, { status: 400 });
  }
  if (imageUrls.length > 4) {
    return NextResponse.json({ error: "Maximum 4 images per analysis" }, { status: 400 });
  }

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(section.yard.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
  } catch { /* optional */ }

  try {
    const result = await analyzeImages(imageUrls, {
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.spreaderType,
      soilPh: section.soilPh,
      weatherSummary,
      notes: section.notes,
    });

    const analysis = await db.lawnAnalysis.create({
      data: {
        yardSectionId: sectionId,
        imageUrls,
        healthScore: result.healthScore,
        issues: result.issues,
        summary: result.summary,
        rawResponse: JSON.stringify(result),
        tasks: {
          create: result.recommendations.map((r) => ({
            yardSectionId: sectionId,
            title: r.title,
            description: r.description,
            priority: r.priority,
            product: r.productSuggestion,
            applicationRate: r.applicationRate,
            spreaderSetting: r.spreaderSetting,
          })),
        },
      },
      include: { tasks: true },
    });

    return NextResponse.json({ analysis, result });
  } catch (err) {
    console.error("Analysis failed:", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Rewrite `app/api/recommendations/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sectionId = req.nextUrl.searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 400 });

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(section.yard.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
  } catch { /* optional */ }

  try {
    const recommendations = await generateRecommendations({
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.spreaderType,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture ?? undefined,
      weatherSummary,
      notes: section.notes,
    });

    await db.lawnTask.createMany({
      data: recommendations.map((r) => ({
        yardSectionId: sectionId,
        title: r.title,
        description: r.description,
        priority: r.priority,
        product: r.productSuggestion,
        applicationRate: r.applicationRate,
        spreaderSetting: r.spreaderSetting,
      })),
    });

    return NextResponse.json(recommendations);
  } catch (err) {
    console.error("Recommendations failed:", err);
    return NextResponse.json({ error: "Recommendations failed. Please try again." }, { status: 500 });
  }
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts app/api/recommendations/route.ts lib/claude.ts
git commit -m "feat: update analyze and recommendations APIs to use YardSection"
```

---

### Task 7: Yard setup — combined Yard + first Section creation flow

The setup wizard creates one Yard (property) and one first Section in a single flow.

**Files:**
- Modify: `components/yard/YardSetupForm.tsx` (full rewrite)
- Modify: `app/(dashboard)/yard/setup/page.tsx` (no change expected)

- [ ] **Step 1: Rewrite `components/yard/YardSetupForm.tsx`**

```tsx
"use client";

import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { yardSectionSchema, YardSectionInput, YardSectionFormInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { AreaTypeSelector } from "./AreaTypeSelector";
import type { AreaType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, CheckCircle, Search } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";

const STEPS = ["Property", "Area Type", "Grass Type", "Soil & Equipment", "Review"];
const SQFT_PER_ACRE = 43560;

// -- helpers for yard size unit conversion --
function toDisplaySize(sqft: number | undefined | null, unit: "sqft" | "acres"): string {
  if (!sqft) return "";
  return unit === "acres" ? (sqft / SQFT_PER_ACRE).toFixed(3) : String(sqft);
}
function toSqft(display: string, unit: "sqft" | "acres"): number | undefined {
  const n = parseFloat(display);
  if (isNaN(n) || n <= 0) return undefined;
  return unit === "acres" ? Math.round(n * SQFT_PER_ACRE) : Math.round(n);
}

// -- spreader brand suggestions --
const SPREADER_BRANDS: Record<string, string[]> = {
  broadcast: ["Scotts EdgeGuard DLX", "Scotts Turf Builder EdgeGuard", "Andersons Rotary Spreader", "Lesco 80 lb Rotary", "Earthway 2600"],
  drop:      ["Scotts Snap Spreader", "Scotts Classic Drop", "Earthway 2150", "Agri-Fab 45-0462"],
  handheld:  ["Scotts Wizz", "Scotts Elite Hand Spreader", "Chapin 8701B"],
  liquid:    ["Chapin 20000", "Solo 420", "Smith Performance Sprayer", "Ortho Dial N Spray"],
  none:      [],
};

const AREA_NAME_MAP: Record<AreaType, string> = {
  front: "Front Yard", back: "Back Yard",
  left_side: "Left Side Yard", right_side: "Right Side Yard",
  garden: "Garden", other: "My Yard",
};

export function YardSetupForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Step 0 fields (Yard / property level — not in the section schema)
  const [propertyName, setPropertyName] = useState("My Property");
  const [zipCode, setZipCode] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);

  // Section form (steps 1-3 feed into this)
  const { handleSubmit, watch, setValue, trigger, formState: { errors, isSubmitting } } =
    useForm<YardSectionFormInput, unknown, YardSectionInput>({
      resolver: zodResolver(yardSectionSchema),
      defaultValues: { name: "Front Yard", grassType: "unknown" },
    });

  // Step 1 — area type
  const areaType = watch("areaType") as AreaType | undefined;

  // Step 2 — grass type + photo ID
  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;
  const photoRef = useRef<HTMLInputElement>(null);
  const uploadZoneRef = useRef<HTMLDivElement>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyPhase, setIdentifyPhase] = useState<"uploading" | "analyzing">("uploading");
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<{ confidence: string; explanation: string } | null>(null);
  const [highlightUpload, setHighlightUpload] = useState(false);

  // Step 3 — spreader, yard size
  const spreaderType = watch("spreaderType");
  const [sizeUnit, setSizeUnit] = useState<"sqft" | "acres">("sqft");
  const [sizeDisplay, setSizeDisplay] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  function handleSizeInput(raw: string) {
    setSizeDisplay(raw);
    setValue("yardSizeSqft", toSqft(raw, sizeUnit) as never);
  }
  function handleUnitChange(next: "sqft" | "acres") {
    const cur = toSqft(sizeDisplay, sizeUnit);
    setSizeUnit(next);
    if (cur) setSizeDisplay(toDisplaySize(cur, next));
  }

  async function lookupYardSize() {
    if (!streetAddress.trim()) return;
    setLookingUp(true);
    setLookupNote(null);
    try {
      const res = await fetch("/api/lookup-yard-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${streetAddress}, ${zipCode}` }),
      });
      const data = await res.json();
      if (data.sqft) {
        setValue("yardSizeSqft", data.sqft as never);
        setSizeDisplay(toDisplaySize(data.sqft, sizeUnit));
        setLookupNote(data.note ?? (data.source === "parcel" ? "Lot size from parcel data" : "Estimated from map data"));
      } else {
        setLookupNote(data.message ?? "Size not found — enter manually");
      }
    } catch {
      setLookupNote("Lookup failed — enter manually");
    } finally {
      setLookingUp(false);
    }
  }

  async function identifyGrass(file: File) {
    setIdentifying(true);
    setIdentified(null);
    setIdentifyError(null);
    setIdentifyPhase("uploading");
    try {
      const signRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!signRes.ok) {
        const b = await signRes.json().catch(() => ({}));
        setIdentifyError(`Upload failed (${signRes.status}): ${b.error ?? "unknown"}`);
        return;
      }
      const { token, path, publicUrl } = await signRes.json();
      const { error: uploadError } = await supabaseClient.storage
        .from("lawn-photos")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) { setIdentifyError(`Upload failed: ${uploadError.message}`); return; }

      setIdentifyPhase("analyzing");
      const identifyRes = await fetch("/api/identify-grass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });
      if (!identifyRes.ok) { setIdentifyError("Analysis failed — try again."); return; }
      const result = await identifyRes.json();
      setValue("grassType", result.grassType);
      setIdentified({ confidence: result.confidence, explanation: result.explanation });
    } catch {
      setIdentifyError("Something went wrong — try again.");
    } finally {
      setIdentifying(false);
    }
  }

  async function onSubmit(sectionData: YardSectionInput) {
    setError(null);
    if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); setStep(0); return; }
    try {
      // 1. Create Yard (property)
      const yardRes = await fetch("/api/yard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: propertyName, zipCode }),
      });
      if (!yardRes.ok) { setError("Failed to save property. Please try again."); return; }
      const yard = await yardRes.json();

      // 2. Create first Section
      const sectionRes = await fetch(`/api/yard/${yard.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sectionData),
      });
      if (!sectionRes.ok) { setError("Failed to save section. Please try again."); return; }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  const canAdvance = async () => {
    if (step === 0) {
      if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); return false; }
      setZipError(null);
      return true;
    }
    if (step === 2) return trigger(["grassType"]);
    return true;
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* progress bar */}
      <div className="flex gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex-1 h-2 rounded-full transition-colors ${i <= step ? "bg-green-500" : "bg-gray-200"}`} />
        ))}
      </div>
      <h2 className="text-xl font-semibold mb-1">{STEPS[step]}</h2>
      <p className="text-sm text-gray-400 mb-4">All details can be updated later.</p>

      <form onSubmit={handleSubmit(onSubmit)}>
        {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Step 0 — Property */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Property Name</Label>
              <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="My Home" />
            </div>
            <div className="space-y-1">
              <Label>ZIP Code *</Label>
              <Input placeholder="90210" maxLength={5} value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
              {zipError && <p className="text-sm text-red-500">{zipError}</p>}
            </div>
          </div>
        )}

        {/* Step 1 — Area Type */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Which part of your property are we setting up?</p>
            <AreaTypeSelector
              value={areaType}
              onChange={(v) => {
                setValue("areaType", v);
                const defaultNames = new Set(Object.values(AREA_NAME_MAP));
                const cur = watch("name");
                if (!cur || defaultNames.has(cur)) setValue("name", AREA_NAME_MAP[v]);
              }}
            />
            <div className="space-y-1">
              <Label>Section Name</Label>
              <Input placeholder="Front Yard" {...(undefined as never)} value={watch("name")} onChange={(e) => setValue("name", e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 2 — Grass Type */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Select your grass type, or upload a photo for AI identification.</p>
            <div
              ref={uploadZoneRef}
              className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors duration-300 ${highlightUpload ? "border-green-500 bg-green-50 animate-pulse" : "border-green-200"}`}
            >
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  setHighlightUpload(false);
                  if (file) identifyGrass(file);
                }}
              />
              {identifying ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                  {identifyPhase === "uploading" ? "Uploading photo…" : "Analyzing your grass…"}
                </div>
              ) : identified ? (
                <div className="text-left space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                    <CheckCircle className="w-4 h-4" /> Identified — {identified.confidence} confidence
                  </div>
                  <p className="text-sm text-gray-500">{identified.explanation}</p>
                  <button type="button" onClick={() => photoRef.current?.click()} className="text-sm text-green-600 underline">Try a different photo</button>
                </div>
              ) : identifyError ? (
                <div className="text-left space-y-2">
                  <p className="text-sm text-red-500">{identifyError}</p>
                  <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-2 text-sm text-green-600 font-medium hover:text-green-700">
                    <Camera className="w-4 h-4" /> Try again
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-2 mx-auto text-sm text-green-600 font-medium hover:text-green-700">
                  <Camera className="w-4 h-4" /> Upload a photo to identify my grass
                </button>
              )}
            </div>
            <GrassTypeSelector
              value={grassType}
              onChange={(v) => {
                setValue("grassType", v);
                setIdentified(null);
                if (v === "unknown") {
                  setHighlightUpload(true);
                  uploadZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                } else {
                  setHighlightUpload(false);
                }
              }}
            />
            {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message}</p>}
          </div>
        )}

        {/* Step 3 — Soil & Equipment */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Street Address (optional — used to look up yard size)</Label>
              <div className="flex gap-2">
                <Input placeholder="123 Main St" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupYardSize(); } }} />
                <Button type="button" variant="outline" size="sm" disabled={!streetAddress.trim() || lookingUp} onClick={lookupYardSize} className="shrink-0">
                  {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {lookupNote && <p className="text-sm text-gray-500">{lookupNote}</p>}
            </div>
            <div className="space-y-1">
              <Label>Section Size</Label>
              <div className="flex gap-2">
                <Input type="number" placeholder={sizeUnit === "sqft" ? "5000" : "0.115"} value={sizeDisplay}
                  onChange={(e) => handleSizeInput(e.target.value)} min="0" step={sizeUnit === "acres" ? "0.001" : "1"} />
                <Select value={sizeUnit} onValueChange={(v) => handleUnitChange(v as "sqft" | "acres")}>
                  <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sqft">sq ft</SelectItem>
                    <SelectItem value="acres">acres</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-gray-400">Optional — helps calculate product amounts</p>
            </div>
            <div className="space-y-1">
              <Label>Soil pH</Label>
              <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...(undefined as never)} />
              <p className="text-sm text-gray-400">Test with a soil kit from your local hardware store</p>
            </div>
            <div className="space-y-1">
              <Label>Soil Moisture</Label>
              <Select onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
                <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dry">Dry — cracks easily, water beads</SelectItem>
                  <SelectItem value="moderate">Moderate — moist 1 inch down</SelectItem>
                  <SelectItem value="moist">Moist — stays damp, possible overwatering</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-400">Push a screwdriver 6" into soil: slides in = moist, resistance = moderate, very hard = dry.</p>
            </div>
            <div className="space-y-1">
              <Label>Spreader Type</Label>
              <Select onValueChange={(v) => setValue("spreaderType", v as YardSectionInput["spreaderType"])}>
                <SelectTrigger><SelectValue placeholder="Select spreader" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">Broadcast / Rotary</SelectItem>
                  <SelectItem value="drop">Drop Spreader</SelectItem>
                  <SelectItem value="handheld">Handheld Spreader</SelectItem>
                  <SelectItem value="liquid">Liquid / Hose-end Sprayer</SelectItem>
                  <SelectItem value="none">None / Hand Apply</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Spreader Model (optional)</Label>
              <Input placeholder="e.g. Scotts EdgeGuard DLX" {...(undefined as never)} />
              {spreaderType && SPREADER_BRANDS[spreaderType]?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {SPREADER_BRANDS[spreaderType].map((brand) => (
                    <button key={brand} type="button" onClick={() => setValue("spreaderModel", brand)}
                      className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
                      {brand}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Additional Notes</Label>
              <Textarea placeholder="Shady areas, problem spots, recent treatments…" {...(undefined as never)} />
            </div>
          </div>
        )}

        {/* Step 4 — Review */}
        {step === 4 && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">Review before saving.</p>
            <div className="rounded-lg bg-gray-50 p-4 space-y-2">
              <div><span className="font-medium">Property:</span> {propertyName} ({zipCode})</div>
              <div><span className="font-medium">Section:</span> {watch("name")}</div>
              <div><span className="font-medium">Area:</span> {watch("areaType") ?? "Not specified"}</div>
              <div><span className="font-medium">Grass:</span> {watch("grassType")?.replace(/_/g, " ")}</div>
              {!!watch("yardSizeSqft") && (
                <div><span className="font-medium">Size:</span> {String(watch("yardSizeSqft"))} sq ft</div>
              )}
              {!!watch("spreaderType") && (
                <div><span className="font-medium">Spreader:</span> {String(watch("spreaderType"))}</div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={async () => { if (await canAdvance()) setStep((s) => s + 1); }}
              className="bg-green-600 hover:bg-green-700">Next</Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
```

> **Note:** The `{...(undefined as never)}` placeholders in step 3 must be replaced with proper `register("fieldName")` calls during implementation — they are shown this way to keep the listing concise, not as final code.

- [ ] **Step 2: Fix the `register()` calls in Step 3**

Replace each `{...(undefined as never)}` with the correct `{...register("fieldName")}`:
- Soil pH input → `{...register("soilPh")}`
- Spreader Model input → `{...register("spreaderModel")}`
- Notes textarea → `{...register("notes")}`

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/yard/YardSetupForm.tsx
git commit -m "feat: rewrite setup form for Yard + first Section creation"
```

---

### Task 8: Yard management page — Yard → Sections view

**Files:**
- Modify: `app/(dashboard)/yard/page.tsx`
- Create: `components/yard/SectionCard.tsx`
- Modify: `app/(dashboard)/yard/[id]/edit/page.tsx` (now edits a Section, not a Yard)
- Modify: `components/yard/YardEditForm.tsx` (update to use `yardSectionSchema`)

- [ ] **Step 1: Create `components/yard/SectionCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, MapPin, Ruler, Sprout } from "lucide-react";
import { AREA_CONFIG } from "./AreaTypeSelector";
import type { AreaType } from "@/types";

interface Section {
  id: string;
  yardId: string;
  name: string;
  areaType: string | null;
  grassType: string;
  yardSizeSqft: number | null;
  spreaderType: string | null;
  spreaderModel: string | null;
}

export function SectionCard({ section }: { section: Section }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
  const AreaIcon = areaCfg?.icon;

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/yard/${section.yardId}/sections/${section.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">{section.name}</div>
          {areaCfg && AreaIcon && (
            <div className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
              <AreaIcon className="w-3.5 h-3.5" /> {areaCfg.label}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/yard/${section.yardId}/sections/${section.id}/edit`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-green-600">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
          {confirmDelete ? (
            <>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-red-600 hover:bg-red-50 px-2" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Confirm"}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5" />
          <span className="capitalize">{section.grassType.replace(/_/g, " ")}</span>
        </div>
        {section.yardSizeSqft && (
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5" />
            <span>{section.yardSizeSqft.toLocaleString()} sq ft</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/(dashboard)/yard/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/yard/SectionCard";

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { sections: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Yards</h1>
        <Link href="/yard/setup">
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Add Yard
          </Button>
        </Link>
      </div>

      {yards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">No yards yet. Add your first to get started.</p>
          <Link href="/yard/setup">
            <Button className="bg-green-600 hover:bg-green-700"><Plus className="w-4 h-4 mr-1" /> Add Yard</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {yards.map((yard) => (
            <div key={yard.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{yard.name}</h2>
                  <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
                </div>
                <Link href={`/yard/${yard.id}/sections/new`}>
                  <Button variant="outline" size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                  </Button>
                </Link>
              </div>
              {yard.sections.length === 0 ? (
                <p className="text-sm text-gray-400 pl-1">No sections yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {yard.sections.map((section) => (
                    <SectionCard key={section.id} section={section} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create add-section page at `app/(dashboard)/yard/[id]/sections/new/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionForm } from "@/components/yard/SectionForm";

export default async function NewSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const yard = await db.yard.findFirst({ where: { id, userId: session.user.id } });
  if (!yard) notFound();

  return (
    <div className="px-4 py-8">
      <Link href="/yard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> {yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Section to {yard.name}</h1>
      <SectionForm yardId={yard.id} zipCode={yard.zipCode} />
    </div>
  );
}
```

- [ ] **Step 4: Create `components/yard/SectionForm.tsx`**

This is a single-page version of the section fields (no multi-step), used for both new sections and editing:

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { yardSectionSchema, YardSectionInput, YardSectionFormInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { AreaTypeSelector } from "./AreaTypeSelector";
import type { AreaType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  yardId: string;
  zipCode: string;
  initialData?: Partial<YardSectionFormInput & { id: string }>;
}

const AREA_NAME_MAP: Record<AreaType, string> = {
  front: "Front Yard", back: "Back Yard",
  left_side: "Left Side Yard", right_side: "Right Side Yard",
  garden: "Garden", other: "My Yard",
};

export function SectionForm({ yardId, zipCode, initialData }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initialData?.id;

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<YardSectionFormInput, unknown, YardSectionInput>({
      resolver: zodResolver(yardSectionSchema),
      defaultValues: {
        name: initialData?.name ?? "Front Yard",
        areaType: initialData?.areaType as AreaType | undefined,
        grassType: (initialData?.grassType as YardSectionInput["grassType"]) ?? "unknown",
        soilMoisture: initialData?.soilMoisture as YardSectionInput["soilMoisture"] | undefined,
        spreaderType: initialData?.spreaderType as YardSectionInput["spreaderType"] | undefined,
        spreaderModel: initialData?.spreaderModel ?? undefined,
        notes: initialData?.notes ?? undefined,
      },
    });

  const grassType = watch("grassType") as YardSectionInput["grassType"] | undefined;
  const areaType = watch("areaType") as AreaType | undefined;

  async function onSubmit(data: YardSectionInput) {
    setError(null);
    try {
      const url = isEdit
        ? `/api/yard/${yardId}/sections/${initialData!.id}`
        : `/api/yard/${yardId}/sections`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { setError("Failed to save. Please try again."); return; }
      router.push("/yard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="space-y-2">
        <Label>Area Type</Label>
        <AreaTypeSelector
          value={areaType}
          onChange={(v) => {
            setValue("areaType", v);
            const defaultNames = new Set(Object.values(AREA_NAME_MAP));
            if (!watch("name") || defaultNames.has(watch("name"))) setValue("name", AREA_NAME_MAP[v]);
          }}
        />
      </div>

      <div className="space-y-1">
        <Label>Section Name</Label>
        <Input placeholder="Front Yard" {...register("name")} />
      </div>

      <div className="space-y-2">
        <Label>Grass Type *</Label>
        <GrassTypeSelector value={grassType} onChange={(v) => setValue("grassType", v)} />
        {errors.grassType && <p className="text-sm text-red-500">{errors.grassType.message}</p>}
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Yard Size (sq ft)</Label>
          <Input type="number" placeholder="5000" {...register("yardSizeSqft")} />
        </div>
        <div className="space-y-1">
          <Label>Soil pH</Label>
          <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
        </div>
        <div className="space-y-1">
          <Label>Soil Moisture</Label>
          <Select defaultValue={initialData?.soilMoisture ?? undefined} onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
            <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dry">Dry</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="moist">Moist</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Spreader Type</Label>
          <Select defaultValue={initialData?.spreaderType ?? undefined} onValueChange={(v) => setValue("spreaderType", v as YardSectionInput["spreaderType"])}>
            <SelectTrigger><SelectValue placeholder="Select spreader" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="broadcast">Broadcast / Rotary</SelectItem>
              <SelectItem value="drop">Drop Spreader</SelectItem>
              <SelectItem value="handheld">Handheld Spreader</SelectItem>
              <SelectItem value="liquid">Liquid / Hose-end Sprayer</SelectItem>
              <SelectItem value="none">None / Hand Apply</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Additional Notes</Label>
          <Textarea placeholder="Shady areas, problem spots…" {...register("notes")} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push("/yard")}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Section"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Create section edit page at `app/(dashboard)/yard/[id]/sections/[sectionId]/edit/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionForm } from "@/components/yard/SectionForm";

export default async function EditSectionPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, sectionId } = await params;
  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { id, userId: session.user.id } },
    include: { yard: { select: { name: true, zipCode: true } } },
  });
  if (!section) notFound();

  return (
    <div className="px-4 py-8">
      <Link href="/yard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> {section.yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit {section.name}</h1>
      <SectionForm yardId={id} zipCode={section.yard.zipCode} initialData={section} />
    </div>
  );
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add components/yard/SectionCard.tsx components/yard/SectionForm.tsx app/\(dashboard\)/yard/page.tsx app/\(dashboard\)/yard/\[id\]/sections/
git commit -m "feat: yard management page with section cards, add/edit section flows"
```

---

### Task 9: Analyze page — Yard → Section picker

**Files:**
- Modify: `app/(dashboard)/analyze/page.tsx`

- [ ] **Step 1: Rewrite `app/(dashboard)/analyze/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import { AnalysisResults } from "@/components/analysis/AnalysisResults";
import { AnalysisResult } from "@/types";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface YardSection { id: string; name: string; areaType: string | null; grassType: string; }
interface Yard { id: string; name: string; zipCode: string; sections: YardSection[]; }

export default function AnalyzePage() {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    fetch("/api/yard")
      .then((r) => r.json())
      .then((data: Yard[]) => {
        if (!Array.isArray(data)) return;
        setYards(data);
        if (data.length > 0) {
          setSelectedYardId(data[0].id);
          if (data[0].sections.length > 0) setSelectedSectionId(data[0].sections[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const selectedYard = yards.find((y) => y.id === selectedYardId);
  const sections = selectedYard?.sections ?? [];

  function handleYardChange(yardId: string) {
    setSelectedYardId(yardId);
    setSelectedSectionId("");
    setResult(null);
    const yard = yards.find((y) => y.id === yardId);
    if (yard?.sections.length) setSelectedSectionId(yard.sections[0].id);
  }

  async function handleUploaded(urls: string[]) {
    if (!selectedSectionId) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: selectedSectionId, imageUrls: urls }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setResult(data.result);
    } finally {
      setAnalyzing(false);
    }
  }

  const hasNoYards = yards.length === 0;
  const hasNoSections = !hasNoYards && sections.length === 0;
  const readyToAnalyze = !!selectedSectionId;

  return (
    <div className="container max-w-2xl py-8 px-4">
      <h1 className="text-3xl font-bold text-green-700 mb-1">Analyze Your Lawn</h1>
      <p className="text-gray-500 mb-6">Upload photos and get AI-powered diagnosis and recommendations.</p>

      {hasNoYards ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>Set up a yard first before analyzing.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {yards.length > 1 && (
              <div className="space-y-1">
                <Label>Property</Label>
                <Select value={selectedYardId} onValueChange={handleYardChange}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {yards.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Yard Section</Label>
              {hasNoSections ? (
                <p className="text-sm text-gray-400">No sections in this yard. Add one first.</p>
              ) : (
                <Select value={selectedSectionId} onValueChange={(v) => { setSelectedSectionId(v); setResult(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.areaType ? `(${s.areaType.replace(/_/g, " ")})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {readyToAnalyze && <PhotoUpload onUploaded={handleUploaded} />}

          {analyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              <span>Analyzing… this takes about 10 seconds</span>
            </div>
          )}
          {result && <div className="mt-6"><AnalysisResults result={result} /></div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/analyze/page.tsx
git commit -m "feat: Analyze page — Yard → Section picker before photo upload"
```

---

### Task 10: Dashboard — show all yards with their sections, tasks grouped

**Files:**
- Create: `components/dashboard/YardOverviewCard.tsx`
- Modify: `components/dashboard/TaskList.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create `components/dashboard/YardOverviewCard.tsx`**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { Camera } from "lucide-react";

interface SectionSummary {
  id: string;
  name: string;
  areaType: string | null;
  grassType: string;
  latestHealthScore: number | null;
  pendingTaskCount: number;
}

interface YardSummary {
  id: string;
  name: string;
  zipCode: string;
  sections: SectionSummary[];
}

export function YardOverviewCard({ yard }: { yard: YardSummary }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">{yard.name}</h3>
        <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {yard.sections.map((section) => {
          const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
          const AreaIcon = areaCfg?.icon;
          const scoreColor =
            section.latestHealthScore == null ? "text-gray-300" :
            section.latestHealthScore >= 70    ? "text-green-600" :
            section.latestHealthScore >= 40    ? "text-yellow-600" : "text-red-600";

          return (
            <div key={section.id} className="flex items-center justify-between py-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {AreaIcon && <AreaIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{section.name}</div>
                  <div className="text-xs text-gray-400 capitalize">{section.grassType.replace(/_/g, " ")}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {section.latestHealthScore != null && (
                  <span className={`text-sm font-bold ${scoreColor}`}>{section.latestHealthScore}</span>
                )}
                {section.pendingTaskCount > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">
                    {section.pendingTaskCount}
                  </span>
                )}
                <Link href={`/analyze?sectionId=${section.id}`}>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                    <Camera className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `Task` interface in `components/dashboard/TaskList.tsx`**

Add optional yard/section info to the `Task` interface:

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  product?: string | null;
  applicationRate?: string | null;
  spreaderSetting?: string | null;
  yardSection?: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  } | null;
}
```

Update `TaskList` to accept and display a `multiYard` flag:

```typescript
export function TaskList({
  tasks: initial,
  multiYard = false,
}: {
  tasks: Task[];
  multiYard?: boolean;
}) {
```

Inside the task card, after the priority dot row, add:

```tsx
{multiYard && task.yardSection && (
  <div className="text-xs text-green-700 font-medium mb-1">
    {task.yardSection.yard.name} › {task.yardSection.name}
  </div>
)}
```

- [ ] **Step 3: Rewrite `app/(dashboard)/dashboard/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { TaskList } from "@/components/dashboard/TaskList";
import { YardOverviewCard } from "@/components/dashboard/YardOverviewCard";
import { Plus, Camera } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
          _count: { select: { tasks: { where: { status: { not: "completed" } } } } },
        },
      },
    },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const sectionIds = yards.flatMap((y) => y.sections.map((s) => s.id));

  const tasks = await db.lawnTask.findMany({
    where: { yardSectionId: { in: sectionIds } },
    orderBy: { createdAt: "desc" },
    include: {
      yardSection: {
        select: { id: true, name: true, areaType: true, yard: { select: { name: true } } },
      },
    },
  });

  const yardSummaries = yards.map((yard) => ({
    id: yard.id,
    name: yard.name,
    zipCode: yard.zipCode,
    sections: yard.sections.map((s) => ({
      id: s.id,
      name: s.name,
      areaType: s.areaType,
      grassType: s.grassType,
      latestHealthScore: s.analyses[0]?.healthScore ?? null,
      pendingTaskCount: s._count.tasks,
    })),
  }));

  const multiYard = yards.length > 1 || yards.some((y) => y.sections.length > 1);
  const primaryZip = yards[0].zipCode;

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {session.user.name?.split(" ")[0]}!
        </h1>
        <Link href="/yard/setup">
          <Button size="sm" className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Yard
          </Button>
        </Link>
      </div>

      <WeatherWidget zip={primaryZip} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">My Yards</h2>
          <Link href="/yard" className="text-sm text-green-700 hover:underline">Manage →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {yardSummaries.map((yard) => <YardOverviewCard key={yard.id} yard={yard} />)}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">{multiYard ? "All Tasks" : "Your Tasks"}</h2>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 mb-3">No tasks yet. Analyze a section to get started.</p>
              <Link href="/analyze">
                <Button className="bg-green-600 hover:bg-green-700">
                  <Camera className="mr-2 w-4 h-4" /> Analyze My Lawn
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <TaskList tasks={tasks} multiYard={multiYard} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/YardOverviewCard.tsx components/dashboard/TaskList.tsx app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: multi-yard dashboard with section overview cards and labeled tasks"
```

---

### Task 11: Typography/readability pass

**Files:**
- Modify: `components/dashboard/TaskList.tsx`
- Modify: `components/analysis/AnalysisResults.tsx`
- Modify: `components/yard/GrassTypeSelector.tsx`

- [ ] **Step 1: TaskList — description `text-xs` → `text-sm`, title `text-sm` → `text-base`**

```tsx
// Change:
<span className="font-medium text-sm">{task.title}</span>
// To:
<span className="font-medium text-base">{task.title}</span>

// Change:
<p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
// To:
<p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
```

- [ ] **Step 2: AnalysisResults — description `text-sm` → `text-base`, product box `text-xs` → `text-sm`**

```tsx
// Change:
<p className="text-sm text-gray-600 mb-2">{rec.description}</p>
// To:
<p className="text-base text-gray-600 mb-2">{rec.description}</p>

// Change:
<div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
// To:
<div className="mt-2 text-sm bg-gray-50 rounded p-2 space-y-1">
```

- [ ] **Step 3: GrassTypeSelector — bump all text sizes**

```tsx
// Change:
<div className="font-medium text-sm">{grass.label}</div>
<div className="text-xs text-gray-500 mt-0.5">{grass.zone} season</div>
<div className="text-xs text-gray-400 mt-0.5">{grass.description}</div>
// To:
<div className="font-medium text-base">{grass.label}</div>
<div className="text-sm text-gray-500 mt-0.5">{grass.zone} season</div>
<div className="text-sm text-gray-400 mt-0.5">{grass.description}</div>
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/TaskList.tsx components/analysis/AnalysisResults.tsx components/yard/GrassTypeSelector.tsx
git commit -m "style: bump text-xs → text-sm and text-sm → text-base for readability"
```

---

## Self-Review

**Spec coverage:**
- ✅ Yard = property (name, ZIP), Section = area within it → Tasks 1–2
- ✅ Front / back / left side / right side / garden / other area types → Task 3
- ✅ Each section has its own grassType, soil, equipment → Tasks 1, 7
- ✅ Each section has its own analysis and tasks → Tasks 6
- ✅ Analyze page: pick Yard → pick Section before upload → Task 9
- ✅ Dashboard shows all yards + sections with health scores and task counts → Task 10
- ✅ Tasks labeled by yard › section when multiple sections exist → Task 10
- ✅ Multiple yards supported; premium gating deferred → no artificial limit in routes
- ✅ Text readability pass → Task 11

**Premium gating hook (future):** To limit free users to 1 yard, add this check to `POST /api/yard`:
```typescript
const count = await db.yard.count({ where: { userId: session.user.id } });
if (count >= 1) return NextResponse.json({ error: "Upgrade to add more yards" }, { status: 403 });
```
No schema changes needed.
