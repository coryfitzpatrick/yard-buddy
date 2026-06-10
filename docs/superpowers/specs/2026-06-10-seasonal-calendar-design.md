# Seasonal Calendar Design

## Goal

A dedicated `/calendar` page showing all scheduled lawn tasks across the year in a month-by-month calendar view, filterable by yard and section.

## Architecture

Server component fetches tasks for the visible month range and passes them to a client calendar component. Month, yard, and section state live in URL search params (`?month=2026-04&yard=<id>&section=<id>`), making the view shareable and bookmarkable. Month navigation and filter changes update the URL, triggering a server re-fetch via Next.js navigation.

**Tech stack:** Next.js 15 App Router, Prisma, Tailwind, shadcn/ui, lucide-react.

---

## File Structure

| File | Role |
|---|---|
| `app/(dashboard)/calendar/page.tsx` | Server component. Reads search params, fetches tasks, renders `MonthCalendar` |
| `components/calendar/MonthCalendar.tsx` | Client component. Renders the 7-column week grid with task bars |
| `components/calendar/CalendarToolbar.tsx` | Client component. Yard/section dropdowns + month prev/next nav |
| `components/calendar/TaskPopover.tsx` | Client component. Tooltip shown when a task bar is clicked |
| `components/dashboard/DashboardNav.tsx` | Modified. Add Calendar nav item (desktop, mobile sheet, bottom nav) |

---

## Page: `app/(dashboard)/calendar/page.tsx`

### Search params

| Param | Type | Default | Description |
|---|---|---|---|
| `month` | `YYYY-MM` string | current month | Month to display |
| `yard` | yard ID string | `""` (all yards) | Filter to a specific yard |
| `section` | section ID string | `""` (all sections) | Filter to a specific section |

### Data fetching

Fetch the user's yards (for the filter dropdowns):

```ts
const yards = await db.yard.findMany({
  where: { userId: session.user.id },
  select: { id: true, name: true, sections: { select: { id: true, name: true } } },
  orderBy: { name: "asc" },
});
```

Compute the visible grid range — first Sunday on or before the 1st of the month through the last Saturday on or after the last day of the month:

```ts
// e.g. month = "2026-04"
const [year, mon] = month.split("-").map(Number);
const firstOfMonth = new Date(Date.UTC(year, mon - 1, 1));
const lastOfMonth = new Date(Date.UTC(year, mon, 0));
const gridStart = new Date(firstOfMonth);
gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay()); // back to Sunday
const gridEnd = new Date(lastOfMonth);
gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay())); // forward to Saturday
```

Fetch tasks that overlap the visible grid:

```ts
const tasks = await db.lawnTask.findMany({
  where: {
    yardSection: {
      yard: { userId: session.user.id },
      ...(sectionParam ? { id: sectionParam } : {}),
      ...(yardParam ? { yardId: yardParam } : {}),
    },
    scheduledStart: { lte: gridEnd },
    scheduledEnd: { gte: gridStart },
  },
  select: {
    id: true,
    title: true,
    description: true,
    status: true,
    scheduledStart: true,
    scheduledEnd: true,
    product: true,
    productSearchQuery: true,
    yardSection: { select: { id: true, name: true, yard: { select: { id: true, name: true } } } },
  },
  orderBy: { scheduledStart: "asc" },
});
```

Tasks with `null` `scheduledStart` or `scheduledEnd` are excluded (nothing to plot).

The page component flattens the Prisma result into `CalendarTask[]` before passing to the client component, serializing all `Date` objects to ISO strings:

```ts
const calendarTasks: CalendarTask[] = tasks
  .filter((t) => t.scheduledStart && t.scheduledEnd)
  .map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    scheduledStart: t.scheduledStart!.toISOString(),
    scheduledEnd: t.scheduledEnd!.toISOString(),
    product: t.product,
    productSearchQuery: t.productSearchQuery,
    sectionId: t.yardSection.id,
    sectionName: t.yardSection.name,
    yardId: t.yardSection.yard.id,
    yardName: t.yardSection.yard.name,
  }));
```

---

## Component: `CalendarToolbar`

Props:
```ts
interface Props {
  yards: { id: string; name: string; sections: { id: string; name: string }[] }[];
  selectedYard: string;
  selectedSection: string;
  month: string; // "YYYY-MM"
}
```

Renders two `<select>` dropdowns (Yard, Section) and prev/next month buttons. All changes call `useRouter().push()` with updated search params. The Section dropdown is populated from the selected yard's sections; when yard changes, section resets to `""`.

Month display format: `"April 2026"` (parsed from the `month` param).

---

## Component: `MonthCalendar`

Props:
```ts
interface CalendarTask {
  id: string;
  title: string;
  description: string;
  status: "pending" | "completed" | "skipped" | string;
  scheduledStart: string; // ISO date string (serialized from server)
  scheduledEnd: string;
  product: string | null;
  productSearchQuery: string | null;
  sectionId: string;
  sectionName: string;
  yardId: string;
  yardName: string;
}

interface Props {
  tasks: CalendarTask[];
  month: string; // "YYYY-MM"
  gridStart: string; // ISO date string — first Sunday of grid
}
```

### Grid structure

Builds an array of week objects from `gridStart`:

```ts
type Week = { days: Date[]; tasks: CalendarTask[] };
// 5 or 6 weeks depending on month
```

Each week renders two layers:
1. **Day numbers row** — 7 cells, grayed out for days outside the current month, today's date highlighted with a green circle (`bg-green-100 text-green-700 rounded-full`)
2. **Task bars layer** — for each task that overlaps this week, render a bar spanning from `max(taskStart, weekStart)` to `min(taskEnd, weekEnd)`

### Task bar column calculation

```ts
// startCol: 0–6 (Sun–Sat), colSpan: 1–7
const clampedStart = max(task.scheduledStart, week.days[0]);
const clampedEnd = min(task.scheduledEnd, week.days[6]);
const startCol = dayOfWeek(clampedStart); // 0=Sun
const colSpan = dayDiff(clampedStart, clampedEnd) + 1;
```

Render using CSS grid `grid-column: <startCol+1> / span <colSpan>`.

### Continuation arrows

When a task starts before the current week (i.e. `task.scheduledStart < week.days[0]`), the bar label shows `← continued` prefix.

When a task ends after the current week (i.e. `task.scheduledEnd > week.days[6]`), the bar label shows `→` suffix after the title.

### Task bar colors

Colors are assigned per section using a fixed rotation of 6 color classes, indexed by a stable hash of `sectionId`:

```ts
const COLORS = ["green", "blue", "yellow", "purple", "red", "teal"] as const;
// stable hash across all chars: Array.from(sectionId).reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length
```

| Color key | Tailwind bg | Tailwind text |
|---|---|---|
| `green` | `bg-green-100` | `text-green-800` |
| `blue` | `bg-blue-100` | `text-blue-800` |
| `yellow` | `bg-yellow-100` | `text-yellow-800` |
| `purple` | `bg-purple-100` | `text-purple-800` |
| `red` | `bg-red-100` | `text-red-800` |
| `teal` | `bg-teal-100` | `text-teal-800` |

Completed tasks render with `opacity-50` and a strikethrough on the title. Skipped tasks render with `bg-gray-100 text-gray-400`.

### Empty weeks

If a week has no tasks, render a single `<div>` with "No tasks scheduled" in `text-gray-300 text-xs italic`.

---

## Component: `TaskPopover`

State: `activeTask: CalendarTask | null` — stored in `MonthCalendar` and passed down.

Clicking a task bar sets `activeTask`; clicking outside (via a transparent overlay or `useEffect` document listener) clears it.

Popover is absolutely positioned relative to the clicked bar. Contents:

```
[Status badge]  Task Title
Description text (truncated to 3 lines)
Section name · Yard name
Apr 5 – Apr 11
[🛒 Buy: <product name>]   (only shown if task.product is set)
[View section →]
```

Status badge: green "Pending", gray "Completed ✓", red "Skipped".

"View section →" links to `/yard/<yardId>/sections/<sectionId>`.

The buy link is only shown when `task.product` is non-empty. It links to `https://www.google.com/search?q=<encodeURIComponent(task.productSearchQuery ?? task.product)>` and opens in a new tab. Label: "🛒 Buy: [product name]".

Only one popover open at a time — clicking a second bar closes the first.

---

## Navigation: `DashboardNav`

Add to `NAV_ITEMS` array:

```ts
{ href: "/calendar", label: "Calendar", icon: CalendarDays }
```

Import `CalendarDays` from `lucide-react`. This automatically adds the item to desktop nav, mobile sheet nav, and bottom mobile nav (all driven by the same `NAV_ITEMS` array).

Active state: `pathname.startsWith("/calendar")`.

---

## Subscription gating

The calendar page is available to all paid plans and active trials. It reads from the same `LawnTask` data that the existing task list shows — no additional gating needed. Trial users see their single yard's tasks.

---

## Error states

- **No tasks in month:** Render the full calendar grid with all weeks showing "No tasks scheduled."
- **No yards:** Show a centered message "Add a yard to see your task calendar" with a link to `/yard/new`.
- **Invalid `month` param:** Default to current month.
- **Invalid `yard`/`section` param:** Ignore and default to "all."
