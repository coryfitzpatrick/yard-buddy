# Weather Widget Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `WeatherWidget` collapsible with a global DB-persisted preference, and add a dynamic background (photo + gradient overlay) keyed to the OpenWeatherMap icon code that encodes both weather condition and day/night.

**Architecture:** A new `lib/weatherTheme.ts` utility maps OWM icon codes to named theme slots. The widget gains an `initialCollapsed` prop fed by a server-side DB read; client-side toggle fires a fire-and-forget `PATCH /api/user/preferences`. Background is a CSS `background-image` from `/public/weather/{slot}.jpg` with a Tailwind gradient overlay layered on top — the overlay alone renders when no photo exists yet.

**Tech Stack:** Next.js 15 App Router (server + client components), Prisma ORM, Zod, Tailwind CSS, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/weatherTheme.ts` | Maps OWM icon → `{ slot, gradient, textClass }` |
| Create | `lib/__tests__/weather-theme.test.ts` | Unit tests for `getWeatherTheme` |
| Create | `lib/validations/userPreferences.ts` | Zod schema for `PATCH /api/user/preferences` |
| Create | `lib/__tests__/user-preferences-validation.test.ts` | Unit tests for schema |
| Create | `app/api/user/preferences/route.ts` | `PATCH` endpoint persisting `weatherWidgetCollapsed` |
| Modify | `prisma/schema.prisma` | Add `weatherWidgetCollapsed Boolean @default(false)` to User |
| Modify | `components/dashboard/WeatherWidget.tsx` | Full redesign: collapsible + themed background |
| Modify | `app/(dashboard)/yard/[id]/page.tsx` | Fetch `weatherWidgetCollapsed`, pass as `initialCollapsed` |
| Modify | `app/(dashboard)/dashboard/page.tsx` | Fetch `weatherWidgetCollapsed`, pass to `DashboardInteractiveSection` |
| Modify | `components/dashboard/DashboardInteractiveSection.tsx` | Accept + forward `initialCollapsed` to `WeatherWidget` |

---

### Task 1: Weather theme utility

**Files:**
- Create: `lib/weatherTheme.ts`
- Create: `lib/__tests__/weather-theme.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/weather-theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getWeatherTheme } from "../weatherTheme";

describe("getWeatherTheme", () => {
  it("returns sunny-day theme for clear sky day (01d)", () => {
    const theme = getWeatherTheme("01d");
    expect(theme.slot).toBe("sunny-day");
    expect(theme.textClass).toBe("text-white");
    expect(theme.gradient).toContain("from-");
  });

  it("returns clear-night theme for clear sky night (01n)", () => {
    const theme = getWeatherTheme("01n");
    expect(theme.slot).toBe("clear-night");
    expect(theme.textClass).toBe("text-white");
  });

  it("returns partly-cloudy-day for few clouds day (02d)", () => {
    expect(getWeatherTheme("02d").slot).toBe("partly-cloudy-day");
  });

  it("returns partly-cloudy-night for scattered clouds night (03n)", () => {
    expect(getWeatherTheme("03n").slot).toBe("partly-cloudy-night");
  });

  it("returns cloudy for broken clouds day (04d)", () => {
    expect(getWeatherTheme("04d").slot).toBe("cloudy");
  });

  it("returns cloudy-night for broken clouds night (04n)", () => {
    expect(getWeatherTheme("04n").slot).toBe("cloudy-night");
  });

  it("returns rainy for shower rain day (09d)", () => {
    expect(getWeatherTheme("09d").slot).toBe("rainy");
  });

  it("returns rainy-night for rain night (10n)", () => {
    expect(getWeatherTheme("10n").slot).toBe("rainy-night");
  });

  it("returns storm for thunderstorm day (11d)", () => {
    expect(getWeatherTheme("11d").slot).toBe("storm");
    expect(getWeatherTheme("11d").textClass).toBe("text-white");
  });

  it("returns storm-night for thunderstorm night (11n)", () => {
    expect(getWeatherTheme("11n").slot).toBe("storm-night");
  });

  it("returns snow for snow day (13d)", () => {
    const theme = getWeatherTheme("13d");
    expect(theme.slot).toBe("snow");
    expect(theme.textClass).toBe("text-gray-800");
  });

  it("returns snow-night for snow night (13n)", () => {
    const theme = getWeatherTheme("13n");
    expect(theme.slot).toBe("snow-night");
    expect(theme.textClass).toBe("text-white");
  });

  it("returns foggy for mist (50d and 50n)", () => {
    expect(getWeatherTheme("50d").slot).toBe("foggy");
    expect(getWeatherTheme("50n").slot).toBe("foggy");
    expect(getWeatherTheme("50d").textClass).toBe("text-gray-800");
  });

  it("falls back to sunny-day for unknown day icon", () => {
    expect(getWeatherTheme("99d").slot).toBe("sunny-day");
  });

  it("falls back to clear-night for unknown night icon", () => {
    expect(getWeatherTheme("99n").slot).toBe("clear-night");
  });

  it("falls back to sunny-day for malformed icon string", () => {
    expect(getWeatherTheme("").slot).toBe("sunny-day");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test lib/__tests__/weather-theme.test.ts
```

Expected: all tests fail with "Cannot find module '../weatherTheme'"

- [ ] **Step 3: Implement `lib/weatherTheme.ts`**

```ts
export interface WeatherTheme {
  slot: string;
  gradient: string;
  textClass: "text-white" | "text-gray-800";
}

const THEMES: Record<string, WeatherTheme> = {
  "sunny-day":          { slot: "sunny-day",          gradient: "from-sky-500/60 to-amber-400/40",    textClass: "text-white" },
  "clear-night":        { slot: "clear-night",         gradient: "from-indigo-900/80 to-slate-800/60", textClass: "text-white" },
  "partly-cloudy-day":  { slot: "partly-cloudy-day",   gradient: "from-sky-400/60 to-slate-400/40",   textClass: "text-white" },
  "partly-cloudy-night":{ slot: "partly-cloudy-night", gradient: "from-slate-700/80 to-indigo-800/60",textClass: "text-white" },
  "cloudy":             { slot: "cloudy",              gradient: "from-slate-500/60 to-gray-400/40",   textClass: "text-white" },
  "cloudy-night":       { slot: "cloudy-night",        gradient: "from-slate-800/80 to-gray-700/60",   textClass: "text-white" },
  "rainy":              { slot: "rainy",               gradient: "from-slate-600/70 to-blue-700/50",   textClass: "text-white" },
  "rainy-night":        { slot: "rainy-night",         gradient: "from-slate-900/80 to-blue-900/60",   textClass: "text-white" },
  "storm":              { slot: "storm",               gradient: "from-gray-900/80 to-slate-700/60",   textClass: "text-white" },
  "storm-night":        { slot: "storm-night",         gradient: "from-gray-950/90 to-slate-900/70",   textClass: "text-white" },
  "snow":               { slot: "snow",                gradient: "from-sky-200/60 to-slate-200/40",    textClass: "text-gray-800" },
  "snow-night":         { slot: "snow-night",          gradient: "from-slate-700/80 to-sky-900/60",    textClass: "text-white" },
  "foggy":              { slot: "foggy",               gradient: "from-gray-400/70 to-slate-300/50",   textClass: "text-gray-800" },
};

export function getWeatherTheme(icon: string): WeatherTheme {
  const match = icon.match(/^(\d+)([dn])$/);
  if (!match) return THEMES["sunny-day"];
  const [, prefix, tod] = match;
  const isNight = tod === "n";

  switch (prefix) {
    case "01": return THEMES[isNight ? "clear-night" : "sunny-day"];
    case "02":
    case "03": return THEMES[isNight ? "partly-cloudy-night" : "partly-cloudy-day"];
    case "04": return THEMES[isNight ? "cloudy-night" : "cloudy"];
    case "09":
    case "10": return THEMES[isNight ? "rainy-night" : "rainy"];
    case "11": return THEMES[isNight ? "storm-night" : "storm"];
    case "13": return THEMES[isNight ? "snow-night" : "snow"];
    case "50": return THEMES["foggy"];
    default:   return THEMES[isNight ? "clear-night" : "sunny-day"];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test lib/__tests__/weather-theme.test.ts
```

Expected: 16 tests pass, 0 failures

- [ ] **Step 5: Commit**

```bash
git add lib/weatherTheme.ts lib/__tests__/weather-theme.test.ts
git commit -m "feat: add weather theme utility mapping OWM icon codes to visual themes"
```

---

### Task 2: User preferences validation schema + API route

**Files:**
- Create: `lib/validations/userPreferences.ts`
- Create: `lib/__tests__/user-preferences-validation.test.ts`
- Create: `app/api/user/preferences/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/user-preferences-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { userPreferencesSchema } from "../validations/userPreferences";

describe("userPreferencesSchema", () => {
  it("accepts weatherWidgetCollapsed: true", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: true });
    expect(result.success).toBe(true);
  });

  it("accepts weatherWidgetCollapsed: false", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: false });
    expect(result.success).toBe(true);
  });

  it("rejects missing weatherWidgetCollapsed", () => {
    const result = userPreferencesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects string instead of boolean", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects number instead of boolean", () => {
    const result = userPreferencesSchema.safeParse({ weatherWidgetCollapsed: 1 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test lib/__tests__/user-preferences-validation.test.ts
```

Expected: all 5 tests fail with "Cannot find module '../validations/userPreferences'"

- [ ] **Step 3: Create `lib/validations/userPreferences.ts`**

```ts
import { z } from "zod";

export const userPreferencesSchema = z.object({
  weatherWidgetCollapsed: z.boolean(),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test lib/__tests__/user-preferences-validation.test.ts
```

Expected: 5 tests pass, 0 failures

- [ ] **Step 5: Create `app/api/user/preferences/route.ts`**

Model this on the existing `app/api/user/notifications/route.ts` pattern (PUT with auth + Zod + prisma.user.update).

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userPreferencesSchema } from "@/lib/validations/userPreferences";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = userPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { weatherWidgetCollapsed: parsed.data.weatherWidgetCollapsed },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass (currently ~32 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/validations/userPreferences.ts lib/__tests__/user-preferences-validation.test.ts app/api/user/preferences/route.ts
git commit -m "feat: add user preferences API and validation for weather widget collapsed state"
```

---

### Task 3: DB migration

**Files:**
- Modify: `prisma/schema.prisma` (User model, around line 10–23)

- [ ] **Step 1: Add field to User model in `prisma/schema.prisma`**

Find the User model. After the `notifyDaysAhead` line, add:

```prisma
model User {
  id                      String    @id @default(cuid())
  name                    String?
  email                   String    @unique
  emailVerified           DateTime?
  image                   String?
  passwordHash            String?
  notificationsEnabled    Boolean   @default(true)
  lastNotifiedAt          DateTime?
  notifyDaysAhead         Int       @default(3)
  weatherWidgetCollapsed  Boolean   @default(false)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  accounts                Account[]
  sessions                Session[]
  yards                   Yard[]
  passwordResets          PasswordResetToken[]
}
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_weather_widget_collapsed
```

Expected output contains: `The following migration(s) have been created and applied ... add_weather_widget_collapsed`

- [ ] **Step 3: Verify Prisma client is regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add weatherWidgetCollapsed field to User model"
```

---

### Task 4: WeatherWidget redesign

**Files:**
- Modify: `components/dashboard/WeatherWidget.tsx`

This task rewrites the entire component. Read the current file before editing.

The widget has these states:
1. **Initial loading** (no weather yet) — spinner in a sky gradient container
2. **Geo blocked** (no zip, denied location) — error message with Try Again button
3. **Has weather, collapsed** — single-line themed bar with chevron ▼
4. **Has weather, expanded** — full themed card with forecast grid

Background: CSS `backgroundImage` inline style pointing to `/public/weather/{slot}.jpg`. A `bg-gradient-to-br` overlay div sits on top. When the photo is absent, only the gradient renders. The `getWeatherTheme` utility determines the slot + gradient + text color from `weather.icon`.

- [ ] **Step 1: Replace the full file content**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { WeatherData } from "@/types";
import {
  Droplets,
  Wind,
  CloudRain,
  Loader2,
  MapPinOff,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getWeatherTheme } from "@/lib/weatherTheme";

interface Props {
  zip: string | null;
  initialCollapsed?: boolean;
}

export function WeatherWidget({ zip, initialCollapsed = false }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const fetchByCoords = useCallback((lat: number, lon: number) => {
    return fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setWeather(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setGeoBlocked(false);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchByCoords(coords.latitude, coords.longitude),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoBlocked(true);
        setLoading(false);
      },
      { timeout: 8000 }
    );
  }, [fetchByCoords]);

  useEffect(() => {
    setLoading(true);
    setGeoBlocked(false);
    if (zip) {
      fetch(`/api/weather?zip=${zip}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setWeather(d); })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    requestGeolocation();
  }, [zip, requestGeolocation]);

  const handleToggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weatherWidgetCollapsed: next }),
    }).catch(() => {});
  }, [collapsed]);

  if (loading && !weather) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 min-h-[3.5rem] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/80" />
      </div>
    );
  }

  if (geoBlocked && !zip && !weather) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 text-white p-5 flex flex-col items-center justify-center gap-3 min-h-[8rem] text-center">
        <MapPinOff className="w-7 h-7 opacity-80" />
        <div>
          <p className="font-medium text-sm">Location access is blocked</p>
          <p className="text-xs opacity-80 mt-0.5">
            Enable location in your browser settings to see local weather,
            or select a yard above.
          </p>
        </div>
        <button
          onClick={requestGeolocation}
          className="flex items-center gap-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 transition-colors rounded-full px-3 py-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Try Again
        </button>
      </div>
    );
  }

  if (!weather) return null;

  const theme = getWeatherTheme(weather.icon);

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        backgroundImage: `url('/weather/${theme.slot}.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* gradient overlay — ensures readability with or without a photo */}
      <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`} />

      {/* re-fetch loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20">
          <Loader2 className="w-8 h-8 animate-spin text-white drop-shadow" />
        </div>
      )}

      <div className={`relative z-10 ${theme.textClass}`}>
        {/* Collapsed bar / always-visible header row */}
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left min-h-[44px]"
          aria-expanded={!collapsed}
        >
          <span className="font-semibold truncate max-w-[8rem] shrink-0">
            {weather.location}
          </span>
          <span className="font-bold shrink-0">{weather.temp}°F</span>
          <span className="capitalize opacity-90 text-sm shrink-0">
            {weather.description}
          </span>
          <Image
            src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
            alt={weather.description}
            width={24}
            height={24}
            className="w-6 h-6 shrink-0"
          />
          <span className="flex items-center gap-1 text-sm opacity-90 shrink-0">
            <Droplets className="w-3 h-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1 text-sm opacity-90 shrink-0">
            <Wind className="w-3 h-3" />
            {weather.windSpeed} mph
          </span>
          <span className="flex items-center gap-1 text-sm opacity-90 shrink-0">
            <CloudRain className="w-3 h-3" />
            {weather.precipitationChance}% rain
          </span>
          <span className="ml-auto shrink-0">
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </span>
        </button>

        {/* Expanded content */}
        {!collapsed && (
          <div className="px-4 pb-4 border-t border-white/20">
            <div className="flex items-center justify-between pt-3">
              <div>
                <div className="text-4xl font-bold">{weather.temp}°F</div>
                <div className="text-sm opacity-90 capitalize">
                  {weather.description}
                </div>
              </div>
              <Image
                src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                alt={weather.description}
                width={64}
                height={64}
                className="w-16 h-16"
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm opacity-90">
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3" /> {weather.humidity}%
              </span>
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3" /> {weather.windSpeed} mph
              </span>
              <span className="flex items-center gap-1">
                <CloudRain className="w-3 h-3" /> {weather.precipitationChance}% rain
              </span>
            </div>

            {weather.forecast.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-4 gap-2">
                {weather.forecast.slice(0, 4).map((day) => (
                  <div key={day.date} className="text-center">
                    <div className="text-xs opacity-75 mb-1">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </div>
                    <div className="text-xs capitalize opacity-80 leading-tight mb-1 line-clamp-2">
                      {day.description}
                    </div>
                    <div className="text-sm font-semibold">{day.high}°</div>
                    <div className="text-xs opacity-70">{day.low}°</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: all tests pass (WeatherWidget has no unit tests — this is a visual component verified manually)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/WeatherWidget.tsx
git commit -m "feat: redesign WeatherWidget with collapsible state and dynamic photo backgrounds"
```

---

### Task 5: Wire up yard detail page

**Files:**
- Modify: `app/(dashboard)/yard/[id]/page.tsx`

- [ ] **Step 1: Add `weatherWidgetCollapsed` to the user query**

The page currently calls `auth()` at line 19 and uses `session.user.id` to query the yard. Add a separate user query after the session check. Open `app/(dashboard)/yard/[id]/page.tsx` and read it first to confirm current structure, then make these changes:

After `const { id } = await params;` and before `const yard = await db.yard.findFirst(...)`, add:

```ts
const user = await db.user.findUnique({
  where: { id: session.user.id },
  select: { weatherWidgetCollapsed: true },
});
```

- [ ] **Step 2: Pass `initialCollapsed` to `WeatherWidget`**

Find the existing `<WeatherWidget zip={yard.zipCode} />` (currently around line 99) and update it:

```tsx
<WeatherWidget
  zip={yard.zipCode}
  initialCollapsed={user?.weatherWidgetCollapsed ?? false}
/>
```

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/yard/\[id\]/page.tsx
git commit -m "feat: pass weatherWidgetCollapsed preference to WeatherWidget on yard detail page"
```

---

### Task 6: Wire up dashboard

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `components/dashboard/DashboardInteractiveSection.tsx`

- [ ] **Step 1: Fetch `weatherWidgetCollapsed` in the dashboard page**

Open `app/(dashboard)/dashboard/page.tsx`. After `const session = await auth()` and `if (!session?.user?.id) redirect("/login");`, add a user query (before the yards query):

```ts
const user = await db.user.findUnique({
  where: { id: session.user.id },
  select: { weatherWidgetCollapsed: true },
});
```

- [ ] **Step 2: Pass it to `DashboardInteractiveSection`**

Find the `<DashboardInteractiveSection ... />` JSX (currently around line 87) and add the prop:

```tsx
<DashboardInteractiveSection
  yards={yardSummaries}
  tasks={tasks}
  allSections={allSections}
  weatherRefreshedAt={weatherRefreshedAt}
  initialWeatherCollapsed={user?.weatherWidgetCollapsed ?? false}
/>
```

- [ ] **Step 3: Add the prop to `DashboardInteractiveSection`**

Open `components/dashboard/DashboardInteractiveSection.tsx`. Read the file first to see the current props interface (it starts with `"use client"` and has a `Props` interface around lines 9–30).

Add `initialWeatherCollapsed: boolean` to the Props interface:

```ts
interface Props {
  yards: YardCard[];
  tasks: Task[];                   // (keep whatever existing type is used)
  allSections: TaskSection[];      // (keep whatever existing type is used)
  weatherRefreshedAt: string | null;
  initialWeatherCollapsed: boolean;
}
```

Update the function signature to destructure the new prop:

```ts
export function DashboardInteractiveSection({
  yards,
  tasks,
  allSections,
  weatherRefreshedAt,
  initialWeatherCollapsed,
}: Props) {
```

- [ ] **Step 4: Forward `initialCollapsed` to `WeatherWidget`**

Find the existing `<WeatherWidget zip={selectedYard?.zipCode ?? null} />` (around line 96) and update it:

```tsx
<WeatherWidget
  zip={selectedYard?.zipCode ?? null}
  initialCollapsed={initialWeatherCollapsed}
/>
```

- [ ] **Step 5: Run the test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx components/dashboard/DashboardInteractiveSection.tsx
git commit -m "feat: wire weatherWidgetCollapsed preference to dashboard WeatherWidget"
```

---

## Post-Implementation: Add Weather Photos

Once all tasks are complete, drop photo files into `/public/weather/` using these slot names:

```
/public/weather/sunny-day.jpg
/public/weather/clear-night.jpg
/public/weather/partly-cloudy-day.jpg
/public/weather/partly-cloudy-night.jpg
/public/weather/cloudy.jpg
/public/weather/cloudy-night.jpg
/public/weather/rainy.jpg
/public/weather/rainy-night.jpg
/public/weather/storm.jpg
/public/weather/storm-night.jpg
/public/weather/snow.jpg
/public/weather/snow-night.jpg
/public/weather/foggy.jpg
```

The widget renders gradient-only until photos are present. Recommended dimensions: 800×500px landscape. Commit photos separately once sourced.
