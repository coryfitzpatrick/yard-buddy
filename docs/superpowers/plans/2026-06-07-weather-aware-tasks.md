# Weather-Aware Task Scheduling with Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weather-aware date windows to lawn tasks, a daily cron that refreshes those windows and emails users about overdue and upcoming tasks.

**Architecture:** Claude assigns `scheduledStartDays`/`scheduledEndDays`/`weatherCondition` at task creation time. A daily Vercel cron fetches fresh weather per ZIP, recalculates task windows with pure date math (no Claude), assesses newly-overdue tasks with one batched Claude call per section, then sends a Resend digest email per user. The dashboard shows tasks grouped by priority with date range badges and a collapsible overdue section.

**Tech Stack:** Prisma (schema changes), Anthropic SDK (existing), Resend (email), date-fns v4 (date math), Vitest (unit tests), Vercel cron

---

## File Structure

**Create:**
- `lib/cron/weather-scheduler.ts` — pure function: maps `weatherCondition` + forecast to new date windows
- `lib/cron/overdue-assessor.ts` — Claude call to assess newly-overdue tasks in batch
- `lib/cron/__tests__/weather-scheduler.test.ts` — unit tests for window recalculation
- `lib/email.ts` — Resend client, HMAC token helpers, HTML digest builder
- `app/api/cron/daily/route.ts` — orchestrates weather refresh, overdue assessment, email sends
- `app/api/notifications/unsubscribe/route.ts` — token-verified email opt-out
- `vercel.json` — cron schedule config
- `vitest.config.ts` — test runner config

**Modify:**
- `prisma/schema.prisma` — new fields on LawnTask, Yard, User
- `types/index.ts` — add `WeatherCondition` type, update `RecommendationItem` and `WeatherData`
- `lib/weather.ts` — add `precipChance` to forecast output
- `lib/claude.ts` — update both prompts to accept forecast text and return scheduling fields
- `app/api/recommendations/route.ts` — pass forecast, convert days to absolute dates
- `app/api/analyze/route.ts` — same as recommendations
- `components/dashboard/TaskList.tsx` — full rewrite: priority groups, date range badges, overdue section
- `components/dashboard/DashboardTaskSection.tsx` — add `weatherRefreshedAt` display
- `app/(dashboard)/dashboard/page.tsx` — include `weatherRefreshedAt` in query

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update schema**

Replace the entire `LawnTask`, `Yard`, and `User` models in `prisma/schema.prisma` with the following (keep all other models unchanged):

```prisma
model User {
  id                   String    @id @default(cuid())
  name                 String?
  email                String    @unique
  emailVerified        DateTime?
  image                String?
  passwordHash         String?
  notificationsEnabled Boolean   @default(true)
  lastNotifiedAt       DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  accounts             Account[]
  sessions             Session[]
  yards                Yard[]
}

model Yard {
  id                 String        @id @default(cuid())
  userId             String
  name               String        @default("My Property")
  zipCode            String
  city               String?
  state              String?
  latitude           Float?
  longitude          Float?
  weatherRefreshedAt DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  user               User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  sections           YardSection[]

  @@index([userId])
}

model LawnTask {
  id               String        @id @default(cuid())
  yardSectionId    String
  analysisId       String?
  title            String
  description      String        @db.Text
  priority         String        @default("medium")
  status           String        @default("pending")
  scheduledStart   DateTime?
  scheduledEnd     DateTime?
  weatherCondition String?
  overdueNote      String?
  stillWorthDoing  Boolean?
  completedAt      DateTime?
  product          String?
  applicationRate  String?
  spreaderSetting  String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  yardSection      YardSection   @relation(fields: [yardSectionId], references: [id], onDelete: Cascade)
  analysis         LawnAnalysis? @relation(fields: [analysisId], references: [id])

  @@index([yardSectionId])
  @@index([analysisId])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name weather-aware-task-scheduling
```

Expected: Migration created and applied, Prisma client regenerated.

- [ ] **Step 3: Verify client generated**

```bash
npx prisma generate
```

Expected: No errors. `scheduledStart`, `scheduledEnd`, `weatherCondition`, `overdueNote`, `stillWorthDoing` available on `LawnTask`; `weatherRefreshedAt` on `Yard`; `notificationsEnabled`, `lastNotifiedAt` on `User`.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add weather-aware scheduling fields to schema"
```

---

## Task 2: TypeScript Types and Weather Forecast Fix

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/weather.ts`

- [ ] **Step 1: Add WeatherCondition type and update RecommendationItem**

In `types/index.ts`, add after the `SpreadType` line and update `RecommendationItem`:

```typescript
export type WeatherCondition = "no_rain_48h" | "dry_day" | "soil_moist" | "any";
```

Update `WeatherData` to include `precipChance` in each forecast day:

```typescript
export interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  precipitationChance: number;
  location: string;
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    description: string;
    precipChance: number;
  }>;
}
```

Update `RecommendationItem` to add the three scheduling fields:

```typescript
export interface RecommendationItem {
  title: string;
  description: string;
  priority: TaskPriority;
  timing: string;
  scheduledStartDays: number;
  scheduledEndDays: number;
  weatherCondition: WeatherCondition;
  productSuggestion?: string;
  productSearchQuery?: string;
  estimatedPrice?: string;
  applicationRate?: string;
  spreaderSetting?: string;
  spreaderType?: SpreadType;
}
```

- [ ] **Step 2: Add precipChance to weather forecast output**

In `lib/weather.ts`, update the `dailyMap` value type and the forecast mapping to include `precipChance`:

```typescript
const dailyMap = new Map<string, {
  high: number;
  low: number;
  description: string;
  precipChance: number;
}>();

// (existing loop body is unchanged — precipChance is already tracked in dailyMap)

// Update the forecast return to include precipChance:
forecast: Array.from(dailyMap.entries())
  .slice(0, 5)
  .map(([date, data]) => ({
    date,
    high: Math.round(data.high),
    low: Math.round(data.low),
    description: data.description,
    precipChance: Math.round(data.precipChance),
  })),
```

- [ ] **Step 3: Add forecast formatter function**

At the bottom of `lib/weather.ts`, add:

```typescript
export function formatForecastForClaude(
  forecast: WeatherData["forecast"],
  today: Date = new Date()
): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return forecast
    .map((day, i) => {
      const label = i === 0 ? "Today" : dayNames[new Date(day.date + "T12:00:00").getDay()];
      return `- ${label} ${day.date}: ${day.high}F, ${day.description}, ${day.precipChance}% rain`;
    })
    .join("\n");
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts lib/weather.ts
git commit -m "feat: add precipChance to forecast and scheduling types"
```

---

## Task 3: Weather Scheduler — Setup Vitest and Write Tests First

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/cron/__tests__/weather-scheduler.test.ts`
- Create: `lib/cron/weather-scheduler.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing tests**

Create `lib/cron/__tests__/weather-scheduler.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeNewWindow } from "../weather-scheduler";

const TODAY = new Date("2026-06-10T00:00:00.000Z");

const MIXED_FORECAST = [
  { date: "2026-06-10", precipChance: 10, high: 78, low: 65, description: "clear" },
  { date: "2026-06-11", precipChance: 15, high: 80, low: 66, description: "partly cloudy" },
  { date: "2026-06-12", precipChance: 90, high: 72, low: 63, description: "thunderstorms" },
  { date: "2026-06-13", precipChance: 80, high: 70, low: 62, description: "showers" },
  { date: "2026-06-14", precipChance: 10, high: 76, low: 64, description: "clear" },
];

const ALL_RAINY = MIXED_FORECAST.map((d) => ({ ...d, precipChance: 75 }));
const ALL_DRY = MIXED_FORECAST.map((d) => ({ ...d, precipChance: 5 }));

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

describe("computeNewWindow", () => {
  describe("dry_day", () => {
    it("returns today when today is dry (<20%)", () => {
      const result = computeNewWindow("dry_day", MIXED_FORECAST, 3, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-10");
      expect(dateStr(result!.scheduledEnd)).toBe("2026-06-12");
    });

    it("skips rainy days to find first dry day", () => {
      const forecast = [
        { ...MIXED_FORECAST[0], precipChance: 80 },
        { ...MIXED_FORECAST[1], precipChance: 10 },
        ...MIXED_FORECAST.slice(2),
      ];
      const result = computeNewWindow("dry_day", forecast, 2, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-11");
      expect(dateStr(result!.scheduledEnd)).toBe("2026-06-12");
    });

    it("returns null when all days are rainy", () => {
      expect(computeNewWindow("dry_day", ALL_RAINY, 3, TODAY)).toBeNull();
    });
  });

  describe("no_rain_48h", () => {
    it("returns first 2-day dry stretch", () => {
      const result = computeNewWindow("no_rain_48h", MIXED_FORECAST, 5, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-10");
    });

    it("finds stretch starting mid-forecast", () => {
      const forecast = [
        { ...MIXED_FORECAST[0], precipChance: 80 },
        { ...MIXED_FORECAST[1], precipChance: 10 },
        { ...MIXED_FORECAST[2], precipChance: 10 },
        ...MIXED_FORECAST.slice(3),
      ];
      const result = computeNewWindow("no_rain_48h", forecast, 3, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-11");
    });

    it("returns null when no 2-day dry stretch exists", () => {
      expect(computeNewWindow("no_rain_48h", ALL_RAINY, 5, TODAY)).toBeNull();
    });
  });

  describe("soil_moist", () => {
    it("returns day after first rainy day", () => {
      // First rainy day in MIXED_FORECAST is Jun 12 (90%), so start = Jun 13
      const result = computeNewWindow("soil_moist", MIXED_FORECAST, 2, TODAY);
      expect(result).not.toBeNull();
      expect(dateStr(result!.scheduledStart)).toBe("2026-06-13");
      expect(dateStr(result!.scheduledEnd)).toBe("2026-06-14");
    });

    it("returns null when no rainy day exists", () => {
      expect(computeNewWindow("soil_moist", ALL_DRY, 3, TODAY)).toBeNull();
    });
  });

  describe("any", () => {
    it("always returns null (caller handles)", () => {
      expect(computeNewWindow("any", MIXED_FORECAST, 5, TODAY)).toBeNull();
    });
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
npm test
```

Expected: Fail with "Cannot find module '../weather-scheduler'".

- [ ] **Step 6: Implement weather-scheduler.ts**

Create `lib/cron/weather-scheduler.ts`:

```typescript
interface ForecastDay {
  date: string;
  precipChance: number;
  high: number;
  low: number;
  description: string;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function computeNewWindow(
  condition: string,
  forecast: ForecastDay[],
  originalWindowDays: number,
  today: Date = new Date()
): { scheduledStart: Date; scheduledEnd: Date } | null {
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  switch (condition) {
    case "dry_day": {
      const idx = forecast.findIndex((d) => d.precipChance < 20);
      if (idx === -1) return null;
      const start = addDays(base, idx);
      return { scheduledStart: start, scheduledEnd: addDays(start, originalWindowDays - 1) };
    }

    case "no_rain_48h": {
      for (let i = 0; i < forecast.length - 1; i++) {
        if (forecast[i].precipChance < 30 && forecast[i + 1].precipChance < 30) {
          const start = addDays(base, i);
          return { scheduledStart: start, scheduledEnd: addDays(start, originalWindowDays - 1) };
        }
      }
      return null;
    }

    case "soil_moist": {
      for (let i = 0; i < forecast.length - 1; i++) {
        if (forecast[i].precipChance > 50) {
          const start = addDays(base, i + 1);
          return { scheduledStart: start, scheduledEnd: addDays(start, originalWindowDays - 1) };
        }
      }
      return null;
    }

    case "any":
    default:
      return null;
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts lib/cron/ package.json
git commit -m "feat: weather scheduler with unit tests"
```

---

## Task 4: Update Claude Prompts

**Files:**
- Modify: `lib/claude.ts`

- [ ] **Step 1: Update LawnContext interface**

In `lib/claude.ts`, replace the `LawnContext` interface:

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
  forecastText?: string;
  notes?: string | null;
}
```

- [ ] **Step 2: Update generateRecommendations prompt**

Replace the `content` string inside `generateRecommendations`'s `messages` array with:

```typescript
content: `Generate lawn care recommendations for this yard. Return a JSON array only.

Grass Type: ${context.grassType.replace(/_/g, " ")}
ZIP Code: ${context.zipCode}
${context.areaType ? `Yard Area: ${context.areaType.replace(/_/g, " ")} (${
  context.areaType === "front"      ? "high visibility, aesthetics matter most" :
  context.areaType === "back"       ? "recreational use, durability matters" :
  context.areaType === "left_side" || context.areaType === "right_side"
                                    ? "narrow side yard, often shaded" :
  context.areaType === "garden"     ? "garden or landscaped area" :
  "custom area"
})` : ""}
${context.yardSizeSqft ? `Yard Size: ${context.yardSizeSqft} sq ft` : ""}
${context.spreaderType ? `Spreader: ${context.spreaderType}` : ""}
${context.soilPh ? `Soil pH: ${context.soilPh}` : ""}
${context.soilMoisture ? `Soil Moisture: ${context.soilMoisture}` : ""}
${context.forecastText ? `5-Day Weather Forecast:\n${context.forecastText}` : context.weatherSummary ? `Current Weather: ${context.weatherSummary}` : ""}
${context.notes ? `Notes: ${context.notes.slice(0, 500)}` : ""}

Return a JSON array of 3-6 recommendations. Each item must follow this exact structure:
{
  "title": "string",
  "description": "string (2-3 sentences: what to do and why)",
  "priority": "urgent" | "high" | "medium" | "low",
  "timing": "string (e.g. 'This week', 'Next 2-4 weeks', 'Wait until fall')",
  "scheduledStartDays": number (integer, days from today to start — 0 means today),
  "scheduledEndDays": number (integer, days from today for hard cutoff — must be >= scheduledStartDays),
  "weatherCondition": "no_rain_48h" | "dry_day" | "soil_moist" | "any",
  "productSuggestion": "string (brand + product name, optional)",
  "productSearchQuery": "string (concise search term for online retailers, omit if no product)",
  "estimatedPrice": "string (typical price range e.g. '$18-28', omit if unknown)",
  "applicationRate": "string (optional, e.g. '3 lbs per 1000 sq ft')",
  "spreaderSetting": "string (optional, e.g. 'Scotts: 4, Andersons: 12')",
  "spreaderType": "broadcast" | "drop" | "handheld" | "liquid" | "none" (optional)
}

For scheduledStartDays/scheduledEndDays: use the forecast to pick realistic windows. Example: if rain is Thursday-Friday, schedule a fungicide application for today-Wednesday (scheduledStartDays: 0, scheduledEndDays: 2) with weatherCondition "no_rain_48h". Use "any" only for tasks where weather does not matter (e.g. mowing, edging).`,
```

- [ ] **Step 3: Update analyzeImages prompt**

In `analyzeImages`, replace the text content string with the same weather section change and add the same three scheduling fields to the recommendations schema within that prompt:

```typescript
// In the text content of analyzeImages messages, replace the weather line:
${context.forecastText ? `- 5-Day Forecast:\n${context.forecastText}` : context.weatherSummary ? `- Weather: ${context.weatherSummary}` : ""}

// And in the recommendations array schema within that prompt, add after "timing":
      "scheduledStartDays": number (integer, days from today to start),
      "scheduledEndDays": number (integer, days from today for hard cutoff),
      "weatherCondition": "no_rain_48h" | "dry_day" | "soil_moist" | "any",
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts
git commit -m "feat: add scheduling fields to Claude prompts"
```

---

## Task 5: Update Task Creation API Routes

**Files:**
- Modify: `app/api/recommendations/route.ts`
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Update recommendations route**

Replace `app/api/recommendations/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

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
  let forecastText: string | undefined;
  try {
    const weather = await getWeatherByZip(section.yard.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
    forecastText = formatForecastForClaude(weather.forecast);
  } catch { /* weather is optional context */ }

  try {
    const today = new Date();
    const recommendations = await generateRecommendations({
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.spreaderType,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture ?? undefined,
      weatherSummary,
      forecastText,
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
        scheduledStart: typeof r.scheduledStartDays === "number"
          ? addDays(today, r.scheduledStartDays)
          : null,
        scheduledEnd: typeof r.scheduledEndDays === "number"
          ? addDays(today, r.scheduledEndDays)
          : null,
        weatherCondition: r.weatherCondition ?? null,
      })),
    });

    return NextResponse.json(recommendations);
  } catch (err) {
    console.error("Recommendations failed:", err);
    return NextResponse.json({ error: "Recommendations failed. Please try again." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update analyze route**

In `app/api/analyze/route.ts`, replace the weather fetch block and `analyzeImages` call:

```typescript
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";

// Replace the weather fetch block:
  let weatherSummary: string | undefined;
  let forecastText: string | undefined;
  try {
    const weather = await getWeatherByZip(section.yard.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
    forecastText = formatForecastForClaude(weather.forecast);
  } catch { /* weather is optional context */ }

// Add addDays helper at the top of the file (after imports):
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Update analyzeImages call to add forecastText:
    const result = await analyzeImages(imageUrls, {
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.spreaderType,
      soilPh: section.soilPh,
      weatherSummary,
      forecastText,
      notes: section.notes,
    });

// Update the tasks.create inside db.lawnAnalysis.create:
        tasks: {
          create: result.recommendations.map((r) => ({
            yardSectionId: sectionId,
            title: r.title,
            description: r.description,
            priority: r.priority,
            product: r.productSuggestion,
            applicationRate: r.applicationRate,
            spreaderSetting: r.spreaderSetting,
            scheduledStart: typeof r.scheduledStartDays === "number"
              ? addDays(today, r.scheduledStartDays)
              : null,
            scheduledEnd: typeof r.scheduledEndDays === "number"
              ? addDays(today, r.scheduledEndDays)
              : null,
            weatherCondition: r.weatherCondition ?? null,
          })),
        },
```

Also add `const today = new Date();` before the `analyzeImages` call.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/recommendations/route.ts app/api/analyze/route.ts
git commit -m "feat: pass full forecast to Claude and store scheduling fields on tasks"
```

---

## Task 6: Email Utilities

**Files:**
- Create: `lib/email.ts`

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```

- [ ] **Step 2: Create lib/email.ts**

```typescript
import { Resend } from "resend";
import crypto from "crypto";

export const resend = new Resend(process.env.RESEND_API_KEY!);

export function generateUnsubscribeToken(userId: string): string {
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET!);
  hmac.update(userId);
  const sig = hmac.digest("hex");
  return `${Buffer.from(userId).toString("base64url")}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  let userId: string;
  try {
    userId = Buffer.from(encoded, "base64url").toString();
  } catch {
    return null;
  }
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET!);
  hmac.update(userId);
  const expected = hmac.digest("hex");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return userId;
}

interface DigestTask {
  title: string;
  sectionName: string;
  overdueNote?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
}

function formatDateRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleString("en-US", { month: "short" });
  const endMonth = end.toLocaleString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  if (startMonth === endMonth) return `${startMonth} ${startDay} - ${endDay}`;
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export function buildDigestEmail(opts: {
  userName: string;
  overdueTasks: DigestTask[];
  upcomingTasks: DigestTask[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { userName, overdueTasks, upcomingTasks, dashboardUrl, unsubscribeUrl } = opts;

  const subject =
    overdueTasks.length > 0
      ? `You have ${overdueTasks.length} overdue lawn task${overdueTasks.length > 1 ? "s" : ""} still worth doing`
      : "Upcoming lawn tasks for the next few days";

  const overdueHtml =
    overdueTasks.length > 0
      ? `<h2 style="color:#dc2626;font-size:16px;margin:24px 0 8px;">Overdue - Still Worth Doing</h2>
        ${overdueTasks
          .map(
            (t) => `<div style="border:1px solid #fee2e2;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
            <div style="font-weight:600;color:#111;">${t.title}</div>
            ${t.overdueNote ? `<div style="color:#6b7280;font-size:14px;margin-top:4px;">${t.overdueNote}</div>` : ""}
            <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${t.sectionName}</div>
          </div>`
          )
          .join("")}`
      : "";

  const upcomingHtml =
    upcomingTasks.length > 0
      ? `<h2 style="color:#16a34a;font-size:16px;margin:24px 0 8px;">Coming Up Soon</h2>
        ${upcomingTasks
          .map((t) => {
            const dateLabel =
              t.scheduledStart && t.scheduledEnd
                ? formatDateRange(t.scheduledStart, t.scheduledEnd)
                : "";
            return `<div style="border:1px solid #dcfce7;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;color:#111;">${t.title}</div>
                ${dateLabel ? `<div style="color:#16a34a;font-size:12px;font-weight:600;">${dateLabel}</div>` : ""}
              </div>
              <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${t.sectionName}</div>
            </div>`;
          })
          .join("")}`
      : "";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Buddy</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${userName},</p>
  <p style="color:#374151;">Here is what needs attention for your lawn:</p>
  ${overdueHtml}
  ${upcomingHtml}
  <div style="text-align:center;margin:32px 0;">
    <a href="${dashboardUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View My Tasks</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:32px;">
    <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe from task reminders</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts package.json package-lock.json
git commit -m "feat: Resend email utilities and HMAC unsubscribe tokens"
```

---

## Task 7: Unsubscribe Endpoint

**Files:**
- Create: `app/api/notifications/unsubscribe/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return new NextResponse("Invalid or expired unsubscribe link.", { status: 400 });
  }

  await db.user.update({
    where: { id: userId },
    data: { notificationsEnabled: false },
  });

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;text-align:center;padding:64px 24px;color:#111;">
  <h1 style="color:#16a34a;">You are unsubscribed.</h1>
  <p style="color:#6b7280;">You will no longer receive task reminder emails from Yard Buddy.</p>
  <a href="${baseUrl}/dashboard" style="color:#16a34a;">Return to Yard Buddy</a>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications/
git commit -m "feat: email unsubscribe endpoint with HMAC token verification"
```

---

## Task 8: Overdue Assessor

**Files:**
- Create: `lib/cron/overdue-assessor.ts`

- [ ] **Step 1: Create lib/cron/overdue-assessor.ts**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface OverdueTaskInput {
  id: string;
  title: string;
  scheduledEnd: Date;
  grassType: string;
}

export interface OverdueAssessment {
  taskId: string;
  stillWorthDoing: boolean;
  overdueNote: string;
}

export async function assessOverdueTasks(
  tasks: OverdueTaskInput[],
  weatherSummary: string,
  today: Date = new Date()
): Promise<OverdueAssessment[]> {
  if (tasks.length === 0) return [];

  const todayStr = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const grassType = tasks[0].grassType.replace(/_/g, " ");

  const taskList = tasks
    .map((t, i) => {
      const closedOn = t.scheduledEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${i + 1}. Task ID: ${t.id} | Title: "${t.title}" | Window closed: ${closedOn}`;
    })
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `These lawn care tasks are past their scheduled window. For each task, decide if it is still worth doing now and write a one-sentence note explaining why. Do not use em dashes.

Today: ${todayStr}
Weather: ${weatherSummary}
Grass type: ${grassType}

Tasks:
${taskList}

Return a JSON array only:
[
  {
    "taskId": "<exact task ID from above>",
    "stillWorthDoing": true,
    "overdueNote": "Late but still effective if applied this week."
  },
  {
    "taskId": "<exact task ID>",
    "stillWorthDoing": false,
    "overdueNote": "Window closed. Pre-emergent will not work now. Wait until fall."
  }
]`,
      },
    ],
  });

  const text = (message.content[0] as Anthropic.TextBlock).text.trim();
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/^[^[{]*/s, "")
    .trim();

  return JSON.parse(cleaned) as OverdueAssessment[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cron/overdue-assessor.ts
git commit -m "feat: overdue task assessor using Claude"
```

---

## Task 9: Daily Cron Route

**Files:**
- Create: `app/api/cron/daily/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 8 * * *"
    }
  ]
}
```

This runs the cron at 8:00 AM UTC every day.

- [ ] **Step 2: Add CRON_SECRET to .env.local**

Add to `.env.local`:

```
CRON_SECRET="generate-a-random-string-here"
```

Generate a value with: `openssl rand -hex 32`

Also add `CRON_SECRET` to Vercel environment variables in the dashboard.

- [ ] **Step 3: Create app/api/cron/daily/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWeatherByZip } from "@/lib/weather";
import { computeNewWindow } from "@/lib/cron/weather-scheduler";
import { assessOverdueTasks } from "@/lib/cron/overdue-assessor";
import { resend, buildDigestEmail, generateUnsubscribeToken } from "@/lib/email";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfToday();

  // 1. Fetch yards with pending tasks
  const yards = await db.yard.findMany({
    where: {
      sections: { some: { tasks: { some: { status: "pending" } } } },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          notificationsEnabled: true,
          lastNotifiedAt: true,
        },
      },
      sections: {
        include: {
          tasks: {
            where: { status: "pending" },
            select: {
              id: true,
              title: true,
              scheduledStart: true,
              scheduledEnd: true,
              weatherCondition: true,
              stillWorthDoing: true,
              yardSection: { select: { grassType: true, areaType: true } },
            },
          },
        },
      },
    },
  });

  // 2. Fetch weather per unique ZIP
  const weatherByZip = new Map<string, Awaited<ReturnType<typeof getWeatherByZip>>>();
  const uniqueZips = [...new Set(yards.map((y) => y.zipCode))];
  await Promise.all(
    uniqueZips.map(async (zip) => {
      try {
        weatherByZip.set(zip, await getWeatherByZip(zip));
      } catch { /* skip unavailable ZIPs */ }
    })
  );

  // 3. Recalculate windows and collect newly overdue tasks
  const overdueBySection = new Map<
    string,
    { tasks: typeof yards[0]["sections"][0]["tasks"]; grassType: string; zip: string }
  >();

  for (const yard of yards) {
    const weather = weatherByZip.get(yard.zipCode);
    if (!weather) continue;

    for (const section of yard.sections) {
      const newlyOverdue: typeof section.tasks = [];

      for (const task of section.tasks) {
        const condition = task.weatherCondition ?? "any";

        // Check for newly overdue (window closed, not yet assessed)
        if (task.scheduledEnd && isBefore(task.scheduledEnd, today) && task.stillWorthDoing === null) {
          newlyOverdue.push(task);
          continue;
        }

        const windowDays =
          task.scheduledStart && task.scheduledEnd
            ? Math.max(1, Math.round((task.scheduledEnd.getTime() - task.scheduledStart.getTime()) / 86400000))
            : 7;

        const newWindow = computeNewWindow(condition, weather.forecast, windowDays, today);

        if (newWindow) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: newWindow.scheduledStart, scheduledEnd: newWindow.scheduledEnd },
          });
        } else if (condition === "any" && task.scheduledEnd && isBefore(task.scheduledEnd, today)) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: today, scheduledEnd: addDays(today, windowDays - 1) },
          });
        }
      }

      if (newlyOverdue.length > 0) {
        overdueBySection.set(section.id, {
          tasks: newlyOverdue,
          grassType: section.grassType,
          zip: yard.zipCode,
        });
      }
    }

    await db.yard.update({
      where: { id: yard.id },
      data: { weatherRefreshedAt: new Date() },
    });
  }

  // 4. Assess newly overdue tasks per section
  for (const [, { tasks, grassType, zip }] of overdueBySection) {
    const weather = weatherByZip.get(zip);
    const weatherSummary = weather
      ? `${weather.temp}F, ${weather.description}, ${weather.precipitationChance}% rain`
      : "weather unavailable";

    try {
      const assessments = await assessOverdueTasks(
        tasks
          .filter((t) => t.scheduledEnd !== null)
          .map((t) => ({
            id: t.id,
            title: t.title,
            scheduledEnd: t.scheduledEnd!,
            grassType,
          })),
        weatherSummary
      );

      for (const a of assessments) {
        await db.lawnTask.update({
          where: { id: a.taskId },
          data: { stillWorthDoing: a.stillWorthDoing, overdueNote: a.overdueNote },
        });
      }
    } catch (err) {
      console.error("Overdue assessment failed for section:", err);
    }
  }

  // 5. Send email digests
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const processedUserIds = new Set<string>();

  for (const yard of yards) {
    const user = yard.user;
    if (processedUserIds.has(user.id)) continue;
    processedUserIds.add(user.id);

    if (!user.notificationsEnabled) continue;
    if (!user.email) continue;
    if (user.lastNotifiedAt && sameDay(user.lastNotifiedAt, today)) continue;

    const allPendingTasks = await db.lawnTask.findMany({
      where: { yardSection: { yard: { userId: user.id } }, status: "pending" },
      include: { yardSection: { select: { name: true } } },
    });

    const overdueTasks = allPendingTasks.filter((t) => t.stillWorthDoing === true);
    const upcomingTasks = allPendingTasks.filter((t) => {
      if (!t.scheduledStart || t.stillWorthDoing !== null) return false;
      const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
      return daysUntilStart >= 0 && daysUntilStart <= 3;
    });

    if (overdueTasks.length === 0 && upcomingTasks.length === 0) continue;

    const unsubToken = generateUnsubscribeToken(user.id);
    const { subject, html } = buildDigestEmail({
      userName: user.name?.split(" ")[0] ?? "there",
      overdueTasks: overdueTasks.map((t) => ({
        title: t.title,
        sectionName: t.yardSection?.name ?? "",
        overdueNote: t.overdueNote,
      })),
      upcomingTasks: upcomingTasks.map((t) => ({
        title: t.title,
        sectionName: t.yardSection?.name ?? "",
        scheduledStart: t.scheduledStart,
        scheduledEnd: t.scheduledEnd,
      })),
      dashboardUrl: `${baseUrl}/dashboard`,
      unsubscribeUrl: `${baseUrl}/api/notifications/unsubscribe?token=${unsubToken}`,
    });

    try {
      await resend.emails.send({
        from: "Yard Buddy <onboarding@resend.dev>",
        to: user.email,
        subject,
        html,
      });
      await db.user.update({
        where: { id: user.id },
        data: { lastNotifiedAt: new Date() },
      });
    } catch (err) {
      console.error("Email send failed for user:", user.id, err);
    }
  }

  return NextResponse.json({ ok: true, processed: yards.length });
}
```

Note: The `from` address uses Resend's test sender. Once `yardbuddy.com` is verified in Resend's dashboard, update to `"Yard Buddy <tasks@yardbuddy.com>"`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/ vercel.json .env.local
git commit -m "feat: daily cron job for weather refresh, overdue assessment, and email digests"
```

---

## Task 10: Dashboard Task List UI Rewrite

**Files:**
- Modify: `components/dashboard/TaskList.tsx`

- [ ] **Step 1: Replace TaskList.tsx**

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Package,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  overdueNote: string | null;
  stillWorthDoing: boolean | null;
  product: string | null;
  applicationRate: string | null;
  spreaderSetting: string | null;
  yardSection?: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  } | null;
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_GROUP: Record<string, "Urgent" | "High" | "Routine"> = {
  urgent: "Urgent",
  high: "High",
  medium: "Routine",
  low: "Routine",
};

const GROUP_STYLES: Record<string, { heading: string; dot: string }> = {
  Urgent: { heading: "text-red-600", dot: "bg-red-500" },
  High: { heading: "text-orange-600", dot: "bg-orange-400" },
  Routine: { heading: "text-green-700", dot: "bg-green-400" },
};

function formatDateRange(startStr: string, endStr: string): string {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const startMonth = start.toLocaleString("en-US", { month: "short" });
  const endMonth = end.toLocaleString("en-US", { month: "short" });
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
}

function isWindowActive(startStr: string, endStr: string): boolean {
  const now = new Date();
  const start = new Date(startStr);
  const end = new Date(endStr);
  return start <= now && end >= now;
}

function DateBadge({ scheduledStart, scheduledEnd }: { scheduledStart: string; scheduledEnd: string }) {
  const active = isWindowActive(scheduledStart, scheduledEnd);
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0",
        active ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
      )}
    >
      {formatDateRange(scheduledStart, scheduledEnd)}
    </span>
  );
}

function TaskCard({
  task,
  multiYard,
  onToggle,
}: {
  task: Task;
  multiYard: boolean;
  onToggle: (id: string, current: string) => void;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <button onClick={() => onToggle(task.id, task.status)} className="mt-0.5 shrink-0">
            <Circle className="w-5 h-5 text-gray-300 hover:text-green-500 transition-colors" />
          </button>
          <div className="flex-1 min-w-0">
            {multiYard && task.yardSection && (
              <div className="text-xs text-green-700 font-medium mb-1">
                {task.yardSection.yard.name === task.yardSection.name
                  ? task.yardSection.name
                  : `${task.yardSection.yard.name} > ${task.yardSection.name}`}
              </div>
            )}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-base">{task.title}</span>
              {task.scheduledStart && task.scheduledEnd && (
                <DateBadge scheduledStart={task.scheduledStart} scheduledEnd={task.scheduledEnd} />
              )}
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
            {task.product && (
              <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                <Package className="w-3 h-3" />
                <span>{task.product}</span>
                {task.applicationRate && <span>· {task.applicationRate}</span>}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverdueSection({
  tasks,
  onAction,
}: {
  tasks: Task[];
  onAction: (id: string, action: "pending" | "skipped") => void;
}) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {tasks.length} overdue task{tasks.length > 1 ? "s" : ""}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className="border-gray-200">
              <CardContent className="p-4">
                <div className="font-medium text-sm text-gray-700 mb-0.5">{task.title}</div>
                {task.overdueNote && (
                  <div className="text-xs text-gray-500 mb-3">{task.overdueNote}</div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-7 text-xs",
                      task.stillWorthDoing === false && "opacity-40"
                    )}
                    onClick={() => onAction(task.id, "pending")}
                  >
                    Do it
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-gray-500"
                    onClick={() => onAction(task.id, "skipped")}
                  >
                    Skip
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskList({
  tasks: initial,
  multiYard = false,
}: {
  tasks: Task[];
  multiYard?: boolean;
}) {
  const [tasks, setTasks] = useState(initial);

  async function patchTask(id: string, status: string) {
    const prev = tasks.find((t) => t.id === id)?.status ?? "pending";
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, status } : task)));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setTasks((t) => t.map((task) => (task.id === id ? { ...task, status: prev } : task)));
    }
  }

  // Tasks stay in pending until the cron assesses them (sets stillWorthDoing).
  // A task with a past scheduledEnd but stillWorthDoing === null remains in pending, not overdue.
  const pending = tasks.filter((t) => t.status === "pending" && t.stillWorthDoing === null);
  const overdue = tasks.filter((t) => t.status === "pending" && t.stillWorthDoing !== null);
  const completed = tasks.filter((t) => t.status === "completed");

  // Group pending tasks by priority group, preserving order within group by scheduledStart
  const groups: Array<{ label: "Urgent" | "High" | "Routine"; tasks: Task[] }> = [];
  const seen = new Set<string>();

  for (const groupLabel of ["Urgent", "High", "Routine"] as const) {
    const groupTasks = pending
      .filter((t) => (PRIORITY_GROUP[t.priority] ?? "Routine") === groupLabel)
      .sort((a, b) => {
        if (a.scheduledStart && b.scheduledStart) {
          return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
        }
        return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      });

    if (groupTasks.length > 0 && !seen.has(groupLabel)) {
      seen.add(groupLabel);
      groups.push({ label: groupLabel, tasks: groupTasks });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(({ label, tasks: groupTasks }) => {
        const styles = GROUP_STYLES[label];
        return (
          <div key={label}>
            <h3 className={cn("text-xs font-semibold uppercase tracking-wide mb-2", styles.heading)}>
              {label}
            </h3>
            <div className="space-y-2">
              {groupTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  multiYard={multiYard}
                  onToggle={(id) => patchTask(id, "completed")}
                />
              ))}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && overdue.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 className="mx-auto w-10 h-10 mb-2 text-green-300" />
          <p className="text-sm">All caught up! Analyze your lawn for new tasks.</p>
        </div>
      )}

      <OverdueSection
        tasks={overdue}
        onAction={(id, status) => patchTask(id, status)}
      />

      {completed.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-500 cursor-pointer font-medium">
            {completed.length} completed task{completed.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-2 mt-2">
            {completed.map((task) => (
              <Card key={task.id} className="opacity-60">
                <CardContent className="p-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  <span className="text-sm line-through text-gray-400 flex-1">{task.title}</span>
                  <button
                    onClick={() => patchTask(task.id, "pending")}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/TaskList.tsx
git commit -m "feat: task list with priority groups, date range badges, and overdue section"
```

---

## Task 11: Dashboard Integration

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `components/dashboard/DashboardTaskSection.tsx`
- Modify: `components/dashboard/DashboardInteractiveSection.tsx`

- [ ] **Step 1: Read DashboardInteractiveSection to understand props**

```bash
cat components/dashboard/DashboardInteractiveSection.tsx
```

- [ ] **Step 2: Update dashboard page to include new task fields and weatherRefreshedAt**

In `app/(dashboard)/dashboard/page.tsx`, update the task query to include new fields:

```typescript
  const tasks = await db.lawnTask.findMany({
    where: { yardSectionId: { in: sectionIds } },
    orderBy: { createdAt: "desc" },
    include: {
      yardSection: {
        select: { id: true, name: true, areaType: true, yard: { select: { name: true } } },
      },
    },
  });
```

Add `select` to include the new fields by updating the query to explicitly include them (Prisma returns all scalar fields by default, so the new schema fields will be returned automatically after migration — no query change needed for fields).

Update the yard query to include `weatherRefreshedAt`:

```typescript
  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
          tasks: { select: { status: true } },
        },
      },
    },
  });
```

Extract `weatherRefreshedAt` from the first yard and pass it down:

```typescript
  const weatherRefreshedAt = yards[0]?.weatherRefreshedAt?.toISOString() ?? null;
```

Update the `DashboardInteractiveSection` call:

```tsx
      <DashboardInteractiveSection
        yards={yardSummaries}
        tasks={tasks}
        allSections={allSections}
        weatherRefreshedAt={weatherRefreshedAt}
      />
```

Note: `tasks` from Prisma will have `Date` fields on `scheduledStart`/`scheduledEnd`. Serialize them to ISO strings before passing to the client component by mapping:

```typescript
  const serializedTasks = tasks.map((t) => ({
    ...t,
    scheduledStart: t.scheduledStart?.toISOString() ?? null,
    scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
```

Pass `serializedTasks` instead of `tasks`.

- [ ] **Step 3: Update DashboardInteractiveSection to accept and forward weatherRefreshedAt**

Read the current file first, then add `weatherRefreshedAt: string | null` to its Props interface and forward it to `DashboardTaskSection`.

- [ ] **Step 4: Update DashboardTaskSection to show weather refresh indicator**

In `components/dashboard/DashboardTaskSection.tsx`, add `weatherRefreshedAt: string | null` to `Props` and render the indicator above the task list:

```tsx
      {weatherRefreshedAt && (
        <p className="text-xs text-gray-400 mb-3">
          Tasks updated{" "}
          {new Date(weatherRefreshedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}{" "}
          at{" "}
          {new Date(weatherRefreshedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
```

Also update the `TaskList` call to pass the new task shape (the `Task` interface in `TaskList.tsx` must match what the dashboard provides — `scheduledStart`, `scheduledEnd`, `overdueNote`, `stillWorthDoing` as strings/nulls/booleans).

- [ ] **Step 5: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Start the dev server and verify the dashboard renders**

```bash
npm run dev
```

Open http://localhost:3000/dashboard. Confirm:
- Task list renders with priority group headings (Urgent / High / Routine)
- No console errors
- Completed tasks still collapse correctly
- Weather refresh indicator is hidden (cron hasn't run yet — that's expected)

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx components/dashboard/DashboardTaskSection.tsx components/dashboard/DashboardInteractiveSection.tsx
git commit -m "feat: dashboard shows priority-grouped tasks with date badges and weather refresh indicator"
```

---

## Manual End-to-End Test

After all tasks are complete:

- [ ] Run `npm run dev`, log in, and go to `/analyze`. Upload a photo. Confirm the new tasks appear with date range badges in the correct priority groups.
- [ ] Test the cron locally by calling it directly:

```bash
curl -H "Authorization: Bearer <your-CRON_SECRET>" http://localhost:3000/api/cron/daily
```

Expected response: `{"ok":true,"processed":1}` (or however many yards you have).

- [ ] Test unsubscribe: Copy the token generated in the cron output (add a `console.log` temporarily) and visit `http://localhost:3000/api/notifications/unsubscribe?token=<token>`. Confirm the confirmation page renders and `notificationsEnabled` is set to `false` in the DB.

- [ ] Run full test suite one final time:

```bash
npm test
```

Expected: All tests pass.
