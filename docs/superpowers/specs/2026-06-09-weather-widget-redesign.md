# Weather Widget Redesign — Collapsible + Dynamic Backgrounds

**Date:** 2026-06-09
**Status:** Approved

## Overview

Redesign `WeatherWidget` to be collapsible (preference persisted globally per user in the DB) and visually dynamic (background photo + gradient overlay keyed to weather condition and time of day). The same single component is used on both the yard detail page and the dashboard.

## Collapsed State

When collapsed, the widget renders a slim single-line bar that still applies the themed background:

```
[Location]  [Temp]°F  [Description]  [OWM icon]  [Humidity]% 💧  [Wind] mph 💨  [Precip]% rain 🌧  [▼]
```

All existing weather stats are visible at a glance. The chevron (`▼`/`▲`) toggles expanded/collapsed. The themed background (photo + overlay) applies in both states so the bar is visually distinctive even when collapsed.

## Expanded State

Identical to the current full layout: location header, large temp + description + OWM icon, humidity/wind/precip row, 4-day forecast grid. Background photo fills the entire card.

## Dynamic Backgrounds

### Theme Mapping

`getWeatherTheme(icon: string)` maps the OWM icon code (format `{condition}{d|n}`) to a named slot. The `d`/`n` suffix is the sole source of day/night distinction — no client-side clock needed.

| OWM icon prefixes | Day slot | Night slot |
|---|---|---|
| `01` (clear sky) | `sunny-day` | `clear-night` |
| `02`, `03` (few/scattered clouds) | `partly-cloudy-day` | `partly-cloudy-night` |
| `04` (broken/overcast) | `cloudy` | `cloudy-night` |
| `09`, `10` (drizzle/rain) | `rainy` | `rainy-night` |
| `11` (thunderstorm) | `storm` | `storm-night` |
| `13` (snow) | `snow` | `snow-night` |
| `50` (mist/fog) | `foggy` | `foggy` |

Each theme object carries:
- `slot: string` — maps to `/public/weather/{slot}.jpg`
- `gradient: string` — Tailwind overlay classes applied over the photo for text readability
- `textClass: string` — `"text-white"` for all dark/photo backgrounds

### Gradient Overlays (fallback + readability layer)

Every theme has a gradient overlay rendered as an absolutely-positioned div on top of the photo. This serves two purposes: ensures white text is readable regardless of photo content, and acts as the sole background when no photo file exists yet.

| Slot | Overlay gradient |
|---|---|
| `sunny-day` | `from-sky-500/60 to-amber-400/40` |
| `clear-night` | `from-indigo-900/80 to-slate-800/60` |
| `partly-cloudy-day` | `from-sky-400/60 to-slate-400/40` |
| `partly-cloudy-night` | `from-slate-700/80 to-indigo-800/60` |
| `cloudy` | `from-slate-500/60 to-gray-400/40` |
| `cloudy-night` | `from-slate-800/80 to-gray-700/60` |
| `rainy` | `from-slate-600/70 to-blue-700/50` |
| `rainy-night` | `from-slate-900/80 to-blue-900/60` |
| `storm` | `from-gray-900/80 to-slate-700/60` |
| `storm-night` | `from-gray-950/90 to-slate-900/70` |
| `snow` | `from-sky-200/60 to-slate-200/40` (dark text) |
| `snow-night` | `from-slate-700/80 to-sky-900/60` |
| `foggy` | `from-gray-400/70 to-slate-300/50` (dark text) |

Snow and foggy slots use `text-gray-800` since the overlay is light.

### Photo Files

Stored at `/public/weather/{slot}.jpg`. The component references each as a CSS `background-image` via inline style (not `next/image`, since the image fills a div rather than being an `<img>` element). Photos need to be sourced and dropped in; the component renders gracefully with gradient-only when a file is absent.

## Persistence

### Schema

Add to `User` model in `prisma/schema.prisma`:

```prisma
weatherWidgetCollapsed  Boolean  @default(false)
```

Migration: `prisma migrate dev --name add_weather_widget_collapsed`

### API Endpoint

`PATCH /api/user/preferences` — accepts a JSON body with any subset of user preference fields. For this feature: `{ weatherWidgetCollapsed: boolean }`. Returns `{ ok: true }`.

Endpoint uses `auth()` to get the session user ID, then `prisma.user.update`. Validates input with Zod.

### Server-Side Read

Both the yard detail page (`app/(dashboard)/yard/[id]/page.tsx`) and the dashboard interactive section (`components/dashboard/DashboardInteractiveSection.tsx` or `app/(dashboard)/dashboard/page.tsx`) query `user.weatherWidgetCollapsed` from the DB (already fetching the session user) and pass it as `initialCollapsed` prop to `WeatherWidget`.

### Client-Side Toggle

`WeatherWidget` maintains `collapsed` in local state, initialized from `initialCollapsed`. On toggle, fires a `fetch('PATCH /api/user/preferences', { weatherWidgetCollapsed: !collapsed })` — fire-and-forget (no await, no error UI). State update is immediate; persistence is best-effort.

## Component Interface

```tsx
<WeatherWidget
  zip={string | null}        // null on dashboard (uses geolocation)
  initialCollapsed={boolean} // read from DB by parent server component
/>
```

No other interface changes. The component is used identically on both pages.

## Pages Updated

- `app/(dashboard)/yard/[id]/page.tsx` — add `weatherWidgetCollapsed` to user select, pass as `initialCollapsed`
- `app/(dashboard)/dashboard/page.tsx` or its interactive section — same

## Mobile Considerations

The widget must look good and function correctly at all viewport sizes. Key constraints:

**Collapsed bar:**
- Location name truncates with `truncate` on narrow screens — temp, description, and stats always visible
- Stats row (`67% 💧 5 mph 💨 0% rain`) may wrap to a second line on very small screens (< 360px); use `flex-wrap` rather than cutting off data
- Chevron touch target: minimum 44×44px tap area even though the icon is small — achieve with padding on the button element

**Expanded state:**
- 4-day forecast grid stays `grid-cols-4` — each cell is narrow but readable; day abbreviations ("Mon") and single temperatures fit fine at small widths
- Photo background uses `bg-cover bg-center` so it crops gracefully on any aspect ratio
- Humidity/wind/precip row: `flex-wrap gap-x-4 gap-y-1` so it wraps to two lines rather than overflowing on small screens

**Touch:**
- The entire header row (collapsed or expanded) is the tap target for toggle, not just the chevron icon

## Out of Scope

- Per-yard collapsed state (global only)
- Animated weather effects (rain drops, lightning)
- Auto-sourcing photo images (photos dropped in manually)
- Light/dark mode variants beyond the theme map above
