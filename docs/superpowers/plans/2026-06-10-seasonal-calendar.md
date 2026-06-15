# Seasonal Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/calendar` page with a month-by-month calendar view of all scheduled lawn tasks, filterable by yard and section, with clickable task bars that show a popover with task details and buy links.

**Architecture:** Server component at `app/(dashboard)/calendar/page.tsx` fetches tasks for the visible month grid and passes serialized data to a client `MonthCalendar` component. State (month, yard, section) lives in URL search params so views are shareable. Month navigation and filter changes update the URL, causing Next.js to re-render the server component with fresh data.

**Tech Stack:** Next.js 15 App Router, Prisma ORM, Tailwind CSS, lucide-react, Vitest + @testing-library/react.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/calendar-utils.ts` | Create | Pure functions: grid range, week building, color hash, bar position |
| `lib/__tests__/calendar-utils.test.ts` | Create | Tests for all calendar-utils functions |
| `components/calendar/CalendarToolbar.tsx` | Create | Yard/section dropdowns + month prev/next nav (client) |
| `components/calendar/TaskPopover.tsx` | Create | Popover shown on task bar click (client) |
| `components/calendar/MonthCalendar.tsx` | Create | Week grid with task bars, manages activeTask state (client) |
| `components/calendar/__tests__/CalendarToolbar.test.tsx` | Create | Toolbar renders yards, sections, month label |
| `components/calendar/__tests__/TaskPopover.test.tsx` | Create | Popover content, buy link conditional |
| `components/calendar/__tests__/MonthCalendar.test.tsx` | Create | Task bars render, today highlighted, continuation arrows |
| `app/(dashboard)/calendar/page.tsx` | Create | Server component: auth, data fetching, param parsing |
| `components/dashboard/DashboardNav.tsx` | Modify | Add Calendar nav item to NAV_ITEMS |

---

## Task 1: Calendar utility functions

**Files:**
- Create: `lib/calendar-utils.ts`
- Create: `lib/__tests__/calendar-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/calendar-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  computeGridRange,
  buildWeeks,
  sectionColor,
  getBarPosition,
} from "../calendar-utils";

describe("computeGridRange", () => {
  it("gridStart is Sunday on or before the 1st of the month", () => {
    // April 1 2026 = Wednesday → gridStart should be Mar 29 (Sunday)
    const { gridStart } = computeGridRange("2026-04");
    expect(gridStart.getUTCDay()).toBe(0);
    expect(gridStart.toISOString().slice(0, 10)).toBe("2026-03-29");
  });

  it("gridEnd is Saturday on or after the last day of the month", () => {
    // April 30 2026 = Thursday → gridEnd should be May 2 (Saturday)
    const { gridEnd } = computeGridRange("2026-04");
    expect(gridEnd.getUTCDay()).toBe(6);
    expect(gridEnd.toISOString().slice(0, 10)).toBe("2026-05-02");
  });

  it("handles a month where the 1st is already Sunday", () => {
    // March 1 2026 = Sunday → gridStart should be Mar 1 itself
    const { gridStart } = computeGridRange("2026-03");
    expect(gridStart.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("handles a month where the last day is already Saturday", () => {
    // January 2026: Jan 31 = Saturday → gridEnd should be Jan 31
    const { gridEnd } = computeGridRange("2026-01");
    expect(gridEnd.toISOString().slice(0, 10)).toBe("2026-01-31");
  });
});

describe("buildWeeks", () => {
  it("returns 5 weeks for April 2026", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    expect(weeks).toHaveLength(5);
  });

  it("each week has exactly 7 days", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    weeks.forEach((week) => expect(week).toHaveLength(7));
  });

  it("first day of first week is the gridStart", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    expect(weeks[0][0].toISOString().slice(0, 10)).toBe("2026-03-29");
  });
});

describe("sectionColor", () => {
  const VALID_COLORS = ["green", "blue", "yellow", "purple", "red", "teal"];

  it("returns a valid color key", () => {
    expect(VALID_COLORS).toContain(sectionColor("abc123"));
    expect(VALID_COLORS).toContain(sectionColor("xyz789012"));
  });

  it("returns the same color for the same sectionId (stable)", () => {
    expect(sectionColor("abc123")).toBe(sectionColor("abc123"));
  });

  it("handles an empty string without throwing", () => {
    expect(VALID_COLORS).toContain(sectionColor(""));
  });
});

describe("getBarPosition", () => {
  it("returns startCol=0 colSpan=7 for a task spanning a full week", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    // Week 2 is Apr 5 (Sun) – Apr 11 (Sat)
    const task = {
      scheduledStart: "2026-04-05T00:00:00.000Z",
      scheduledEnd: "2026-04-11T00:00:00.000Z",
    };
    const pos = getBarPosition(task, weeks[1]);
    expect(pos).toEqual({ startCol: 0, colSpan: 7, continuesBefore: false, continuesAfter: false });
  });

  it("clamps start to week boundary for tasks starting before the week", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    // Task starts Mar 30 (Mon), week 1 starts Mar 29 (Sun) — task in week 1 starts col 1
    const task = {
      scheduledStart: "2026-03-30T00:00:00.000Z",
      scheduledEnd: "2026-04-02T00:00:00.000Z",
    };
    const pos = getBarPosition(task, weeks[0]);
    expect(pos.startCol).toBe(1); // Monday
    expect(pos.continuesBefore).toBe(false);
  });

  it("sets continuesBefore=true when task starts before the week", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    // Task starts in week 1, check it in week 2
    const task = {
      scheduledStart: "2026-04-01T00:00:00.000Z",
      scheduledEnd: "2026-04-08T00:00:00.000Z",
    };
    const pos = getBarPosition(task, weeks[1]); // week 2: Apr 5–11
    expect(pos.continuesBefore).toBe(true);
    expect(pos.startCol).toBe(0);
  });

  it("sets continuesAfter=true when task ends after the week", () => {
    const { gridStart, gridEnd } = computeGridRange("2026-04");
    const weeks = buildWeeks(gridStart, gridEnd);
    const task = {
      scheduledStart: "2026-04-05T00:00:00.000Z",
      scheduledEnd: "2026-04-15T00:00:00.000Z",
    };
    const pos = getBarPosition(task, weeks[1]); // week 2: Apr 5–11
    expect(pos.continuesAfter).toBe(true);
    expect(pos.colSpan).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/calendar-utils.test.ts
```

Expected: FAIL with "Cannot find module '../calendar-utils'"

- [ ] **Step 3: Implement `lib/calendar-utils.ts`**

```typescript
// lib/calendar-utils.ts

export type CalendarTask = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "completed" | "skipped" | string;
  scheduledStart: string;
  scheduledEnd: string;
  product: string | null;
  productSearchQuery: string | null;
  sectionId: string;
  sectionName: string;
  yardId: string;
  yardName: string;
};

const COLORS = ["green", "blue", "yellow", "purple", "red", "teal"] as const;
export type ColorKey = typeof COLORS[number];

export function computeGridRange(month: string): { gridStart: Date; gridEnd: Date } {
  const [year, mon] = month.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, mon - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, mon, 0));

  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const gridEnd = new Date(lastOfMonth);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  return { gridStart, gridEnd };
}

export function buildWeeks(gridStart: Date, gridEnd: Date): Date[][] {
  const weeks: Date[][] = [];
  const current = new Date(gridStart);
  while (current <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function sectionColor(sectionId: string): ColorKey {
  const hash = Array.from(sectionId).reduce((a, c) => a + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

export function getBarPosition(
  task: Pick<CalendarTask, "scheduledStart" | "scheduledEnd">,
  weekDays: Date[]
): { startCol: number; colSpan: number; continuesBefore: boolean; continuesAfter: boolean } {
  const taskStart = new Date(task.scheduledStart);
  const taskEnd = new Date(task.scheduledEnd);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const continuesBefore = taskStart < weekStart;
  const continuesAfter = taskEnd > weekEnd;

  const clampedStart = continuesBefore ? weekStart : taskStart;
  const clampedEnd = continuesAfter ? weekEnd : taskEnd;

  const startCol = clampedStart.getUTCDay();
  const colSpan = Math.round((clampedEnd.getTime() - clampedStart.getTime()) / 86400000) + 1;

  return { startCol, colSpan, continuesBefore, continuesAfter };
}

export const COLOR_CLASSES: Record<ColorKey, { bg: string; text: string }> = {
  green:  { bg: "bg-green-100",  text: "text-green-800"  },
  blue:   { bg: "bg-blue-100",   text: "text-blue-800"   },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800" },
  purple: { bg: "bg-purple-100", text: "text-purple-800" },
  red:    { bg: "bg-red-100",    text: "text-red-800"    },
  teal:   { bg: "bg-teal-100",   text: "text-teal-800"   },
};

export function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function prevMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthParam(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/calendar-utils.test.ts
```

Expected: 13 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/calendar-utils.ts lib/__tests__/calendar-utils.test.ts
git commit -m "feat: add calendar utility functions (grid range, weeks, colors, bar positions)"
```

---

## Task 2: CalendarToolbar component

**Files:**
- Create: `components/calendar/CalendarToolbar.tsx`
- Create: `components/calendar/__tests__/CalendarToolbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// components/calendar/__tests__/CalendarToolbar.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { CalendarToolbar } from "../CalendarToolbar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("month=2026-04"),
}));

afterEach(cleanup);

const yards = [
  { id: "y1", name: "Front Yard", sections: [{ id: "s1", name: "Main Lawn" }, { id: "s2", name: "Side Strip" }] },
  { id: "y2", name: "Back Yard", sections: [{ id: "s3", name: "Garden Bed" }] },
];

describe("CalendarToolbar", () => {
  it("renders all yard options including All Yards", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByRole("option", { name: "All Yards" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Front Yard" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Back Yard" })).toBeInTheDocument();
  });

  it("renders All Sections option when no yard is selected", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByRole("option", { name: "All Sections" })).toBeInTheDocument();
  });

  it("renders only sections for the selected yard", () => {
    render(<CalendarToolbar yards={yards} selectedYard="y1" selectedSection="" month="2026-04" />);
    expect(screen.getByRole("option", { name: "Main Lawn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Side Strip" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Garden Bed" })).toBeNull();
  });

  it("displays the formatted month label", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("renders prev and next month buttons", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByLabelText("Previous month")).toBeInTheDocument();
    expect(screen.getByLabelText("Next month")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/calendar/__tests__/CalendarToolbar.test.tsx
```

Expected: FAIL with "Cannot find module '../CalendarToolbar'"

- [ ] **Step 3: Implement `CalendarToolbar`**

```typescript
// components/calendar/CalendarToolbar.tsx
"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLabel, prevMonth, nextMonth } from "@/lib/calendar-utils";

interface Props {
  yards: { id: string; name: string; sections: { id: string; name: string }[] }[];
  selectedYard: string;
  selectedSection: string;
  month: string;
}

export function CalendarToolbar({ yards, selectedYard, selectedSection, month }: Props) {
  const router = useRouter();

  function pushParams(updates: Record<string, string>) {
    const params = new URLSearchParams({
      month,
      ...(selectedYard ? { yard: selectedYard } : {}),
      ...(selectedSection ? { section: selectedSection } : {}),
      ...updates,
    });
    // Remove empty keys
    for (const [k, v] of [...params.entries()]) {
      if (!v) params.delete(k);
    }
    router.push(`/calendar?${params.toString()}`);
  }

  const selectedYardObj = yards.find((y) => y.id === selectedYard);
  const sectionOptions = selectedYardObj?.sections ?? [];

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-3">
      <div className="flex gap-2 flex-wrap">
        <select
          value={selectedYard}
          onChange={(e) => pushParams({ yard: e.target.value, section: "" })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Yards</option>
          {yards.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>

        <select
          value={selectedSection}
          onChange={(e) => pushParams({ section: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          disabled={!selectedYard}
        >
          <option value="">All Sections</option>
          {sectionOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label="Previous month"
          onClick={() => pushParams({ month: prevMonth(month) })}
          className="border border-gray-200 rounded-lg p-1.5 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">
          {formatMonthLabel(month)}
        </span>
        <button
          aria-label="Next month"
          onClick={() => pushParams({ month: nextMonth(month) })}
          className="border border-gray-200 rounded-lg p-1.5 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/calendar/__tests__/CalendarToolbar.test.tsx
```

Expected: 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add components/calendar/CalendarToolbar.tsx components/calendar/__tests__/CalendarToolbar.test.tsx
git commit -m "feat: add CalendarToolbar with yard/section filters and month navigation"
```

---

## Task 3: TaskPopover component

**Files:**
- Create: `components/calendar/TaskPopover.tsx`
- Create: `components/calendar/__tests__/TaskPopover.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// components/calendar/__tests__/TaskPopover.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { TaskPopover } from "../TaskPopover";
import type { CalendarTask } from "@/lib/calendar-utils";

afterEach(cleanup);

const baseTask: CalendarTask = {
  id: "t1",
  title: "Apply pre-emergent",
  description: "Apply before soil temps reach 55°F to close the crabgrass window.",
  status: "pending",
  scheduledStart: "2026-04-05T00:00:00.000Z",
  scheduledEnd: "2026-04-11T00:00:00.000Z",
  product: null,
  productSearchQuery: null,
  sectionId: "s1",
  sectionName: "Main Lawn",
  yardId: "y1",
  yardName: "Front Yard",
};

describe("TaskPopover", () => {
  it("renders task title and description", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText("Apply pre-emergent")).toBeInTheDocument();
    expect(screen.getByText(/Apply before soil temps/)).toBeInTheDocument();
  });

  it("renders section and yard name", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText(/Main Lawn/)).toBeInTheDocument();
    expect(screen.getByText(/Front Yard/)).toBeInTheDocument();
  });

  it("renders the date range", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText(/Apr 5/)).toBeInTheDocument();
    expect(screen.getByText(/Apr 11/)).toBeInTheDocument();
  });

  it("renders Pending status badge for pending tasks", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders Completed status badge for completed tasks", () => {
    render(<TaskPopover task={{ ...baseTask, status: "completed" }} onClose={vi.fn()} />);
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it("does NOT render buy link when product is null", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.queryByText(/Buy:/)).toBeNull();
  });

  it("renders buy link when product is set", () => {
    const task = { ...baseTask, product: "Scotts Halts", productSearchQuery: "Scotts Halts crabgrass preventer" };
    render(<TaskPopover task={task} onClose={vi.fn()} />);
    const link = screen.getByText(/Buy: Scotts Halts/);
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("google.com/search"));
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("uses productSearchQuery in the buy link when set", () => {
    const task = { ...baseTask, product: "Scotts Halts", productSearchQuery: "Scotts Halts 10000 sqft" };
    render(<TaskPopover task={task} onClose={vi.fn()} />);
    const link = screen.getByText(/Buy: Scotts Halts/).closest("a")!;
    expect(link.getAttribute("href")).toContain(encodeURIComponent("Scotts Halts 10000 sqft"));
  });

  it("renders View section link pointing to section page", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    const link = screen.getByRole("link", { name: /View section/i });
    expect(link).toHaveAttribute("href", "/yard/y1/sections/s1");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<TaskPopover task={baseTask} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/calendar/__tests__/TaskPopover.test.tsx
```

Expected: FAIL with "Cannot find module '../TaskPopover'"

- [ ] **Step 3: Implement `TaskPopover`**

```typescript
// components/calendar/TaskPopover.tsx
"use client";

import Link from "next/link";
import { X, ShoppingCart } from "lucide-react";
import type { CalendarTask } from "@/lib/calendar-utils";

interface Props {
  task: CalendarTask;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
  skipped:   "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pending",
  completed: "Completed ✓",
  skipped:   "Skipped",
};

export function TaskPopover({ task, onClose }: Props) {
  const badgeClass = STATUS_BADGE[task.status] ?? STATUS_BADGE.pending;
  const statusLabel = STATUS_LABEL[task.status] ?? task.status;

  const buyUrl = task.product
    ? `https://www.google.com/search?q=${encodeURIComponent(task.productSearchQuery ?? task.product)}`
    : null;

  return (
    <>
      {/* Transparent backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-20" onClick={onClose} />

      <div className="absolute z-30 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 mt-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
              {statusLabel}
            </span>
            <span className="text-sm font-semibold text-gray-900">{task.title}</span>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-600 mb-3 line-clamp-3">{task.description}</p>

        <div className="text-xs text-gray-500 mb-1">
          {task.sectionName} · {task.yardName}
        </div>
        <div className="text-xs text-gray-500 mb-3">
          {formatDate(task.scheduledStart)} – {formatDate(task.scheduledEnd)}
        </div>

        <div className="flex flex-col gap-2">
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Buy: {task.product}
            </a>
          )}
          <Link
            href={`/yard/${task.yardId}/sections/${task.sectionId}`}
            className="text-xs font-medium text-green-700 hover:text-green-900"
          >
            View section →
          </Link>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/calendar/__tests__/TaskPopover.test.tsx
```

Expected: 10 tests passing

- [ ] **Step 5: Commit**

```bash
git add components/calendar/TaskPopover.tsx components/calendar/__tests__/TaskPopover.test.tsx
git commit -m "feat: add TaskPopover with status badge, buy link, and section navigation"
```

---

## Task 4: MonthCalendar component

**Files:**
- Create: `components/calendar/MonthCalendar.tsx`
- Create: `components/calendar/__tests__/MonthCalendar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// components/calendar/__tests__/MonthCalendar.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MonthCalendar } from "../MonthCalendar";
import type { CalendarTask } from "@/lib/calendar-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const task: CalendarTask = {
  id: "t1",
  title: "Fertilize lawn",
  description: "Apply granular fertilizer evenly.",
  status: "pending",
  scheduledStart: "2026-04-05T00:00:00.000Z", // Sunday week 2
  scheduledEnd: "2026-04-07T00:00:00.000Z",   // Tuesday week 2
  product: null,
  productSearchQuery: null,
  sectionId: "s1",
  sectionName: "Main Lawn",
  yardId: "y1",
  yardName: "Front Yard",
};

const yards = [{ id: "y1", name: "Front Yard", sections: [{ id: "s1", name: "Main Lawn" }] }];

describe("MonthCalendar", () => {
  it("renders day of week headers", () => {
    render(<MonthCalendar tasks={[]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("renders the task title as a bar", () => {
    render(<MonthCalendar tasks={[task]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    expect(screen.getByText(/Fertilize lawn/)).toBeInTheDocument();
  });

  it("shows popover when a task bar is clicked", () => {
    render(<MonthCalendar tasks={[task]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    fireEvent.click(screen.getByText(/Fertilize lawn/));
    expect(screen.getByText("Apply granular fertilizer evenly.")).toBeInTheDocument();
  });

  it("closes popover when close button is clicked", () => {
    render(<MonthCalendar tasks={[task]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    fireEvent.click(screen.getByText(/Fertilize lawn/));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText("Apply granular fertilizer evenly.")).toBeNull();
  });

  it("shows No tasks scheduled for empty weeks", () => {
    render(<MonthCalendar tasks={[]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    const emptyMessages = screen.getAllByText("No tasks scheduled");
    expect(emptyMessages.length).toBeGreaterThan(0);
  });

  it("renders continuation arrow when task spans multiple weeks", () => {
    const multiWeekTask: CalendarTask = {
      ...task,
      scheduledStart: "2026-04-05T00:00:00.000Z",
      scheduledEnd: "2026-04-15T00:00:00.000Z",
    };
    render(<MonthCalendar tasks={[multiWeekTask]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    expect(screen.getByText(/→/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/calendar/__tests__/MonthCalendar.test.tsx
```

Expected: FAIL with "Cannot find module '../MonthCalendar'"

- [ ] **Step 3: Implement `MonthCalendar`**

```typescript
// components/calendar/MonthCalendar.tsx
"use client";

import { useState } from "react";
import {
  buildWeeks,
  computeGridRange,
  sectionColor,
  getBarPosition,
  COLOR_CLASSES,
  type CalendarTask,
} from "@/lib/calendar-utils";
import { CalendarToolbar } from "./CalendarToolbar";
import { TaskPopover } from "./TaskPopover";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  tasks: CalendarTask[];
  month: string;
  gridStart: string;
  yards: { id: string; name: string; sections: { id: string; name: string }[] }[];
  selectedYard: string;
  selectedSection: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function taskOverlapsWeek(task: CalendarTask, weekDays: Date[]): boolean {
  const start = new Date(task.scheduledStart);
  const end = new Date(task.scheduledEnd);
  return start <= weekDays[6] && end >= weekDays[0];
}

export function MonthCalendar({ tasks, month, gridStart, yards, selectedYard, selectedSection }: Props) {
  const [activeTask, setActiveTask] = useState<CalendarTask | null>(null);
  const [activeBarId, setActiveBarId] = useState<string | null>(null);

  const { gridEnd } = computeGridRange(month);
  const weeks = buildWeeks(new Date(gridStart), gridEnd);
  const today = new Date();

  const [year, mon] = month.split("-").map(Number);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <CalendarToolbar
        yards={yards}
        selectedYard={selectedYard}
        selectedSection={selectedSection}
        month={month}
      />

      {/* Day headers */}
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((weekDays, wi) => {
        const weekTasks = tasks.filter((t) => taskOverlapsWeek(t, weekDays));

        return (
          <div key={wi} className="border-b border-gray-50 last:border-b-0">
            {/* Day numbers */}
            <div className="grid grid-cols-7">
              {weekDays.map((day, di) => {
                const isCurrentMonth = day.getUTCMonth() + 1 === mon && day.getUTCFullYear() === year;
                const isToday = isSameDay(day, today);
                return (
                  <div key={di} className="px-2 pt-2 pb-1">
                    <span
                      className={[
                        "text-xs inline-flex w-6 h-6 items-center justify-center rounded-full",
                        isToday ? "bg-green-100 text-green-700 font-bold" : "",
                        !isCurrentMonth ? "text-gray-300" : "text-gray-700",
                      ].join(" ")}
                    >
                      {day.getUTCDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Task bars */}
            {weekTasks.length === 0 ? (
              <div className="px-3 pb-3 text-xs text-gray-300 italic">No tasks scheduled</div>
            ) : (
              <div className="px-1 pb-2 flex flex-col gap-1">
                {weekTasks.map((task) => {
                  const { startCol, colSpan, continuesBefore, continuesAfter } = getBarPosition(task, weekDays);
                  const color = sectionColor(task.sectionId);
                  const classes = COLOR_CLASSES[color];
                  const isCompleted = task.status === "completed";
                  const isSkipped = task.status === "skipped";

                  const label = continuesBefore
                    ? `← ${task.title}`
                    : continuesAfter
                    ? `${task.title} →`
                    : task.title;

                  return (
                    <div key={`${task.id}-${wi}`} className="grid grid-cols-7 relative">
                      {/* Empty cells before bar */}
                      {Array.from({ length: startCol }).map((_, i) => (
                        <div key={i} />
                      ))}
                      {/* Bar */}
                      <div
                        style={{ gridColumn: `span ${colSpan}` }}
                        className={[
                          "rounded-md px-2 py-0.5 text-xs font-medium cursor-pointer truncate transition-opacity hover:opacity-80",
                          isSkipped ? "bg-gray-100 text-gray-400" : `${classes.bg} ${classes.text}`,
                          isCompleted ? "opacity-50 line-through" : "",
                        ].join(" ")}
                        onClick={() => {
                          setActiveTask(task);
                          setActiveBarId(`${task.id}-${wi}`);
                        }}
                      >
                        {label}
                      </div>
                      {/* Popover anchored to this bar */}
                      {activeTask?.id === task.id && activeBarId === `${task.id}-${wi}` && (
                        <TaskPopover
                          task={activeTask}
                          onClose={() => { setActiveTask(null); setActiveBarId(null); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/calendar/__tests__/MonthCalendar.test.tsx
```

Expected: 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add components/calendar/MonthCalendar.tsx components/calendar/__tests__/MonthCalendar.test.tsx
git commit -m "feat: add MonthCalendar with week grid, task bars, continuation arrows, and popover"
```

---

## Task 5: Calendar page (server component)

**Files:**
- Create: `app/(dashboard)/calendar/page.tsx`

No tests for the server component — it's a thin data-fetching layer over already-tested utilities and components. Verify manually.

- [ ] **Step 1: Create the page**

```typescript
// app/(dashboard)/calendar/page.tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { computeGridRange, currentMonthParam, type CalendarTask } from "@/lib/calendar-utils";
import { CalendarDays } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ month?: string; yard?: string; section?: string }>;
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;

  // Validate and default search params
  const monthParam = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentMonthParam();
  const yardParam = params.yard ?? "";
  const sectionParam = params.section ?? "";

  // Fetch user's yards for the filter dropdowns
  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, sections: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  if (yards.length === 0) {
    return (
      <div className="px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <CalendarDays className="w-6 h-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">Add a yard to see your task calendar.</p>
          <a href="/yard/new" className="text-green-700 font-semibold hover:underline">
            Add your first yard →
          </a>
        </div>
      </div>
    );
  }

  const { gridStart, gridEnd } = computeGridRange(monthParam);

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
      yardSection: {
        select: { id: true, name: true, yard: { select: { id: true, name: true } } },
      },
    },
    orderBy: { scheduledStart: "asc" },
  });

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

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <div className="flex items-center gap-2 mb-6">
        <CalendarDays className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
      </div>
      <MonthCalendar
        tasks={calendarTasks}
        month={monthParam}
        gridStart={gridStart.toISOString()}
        yards={yards}
        selectedYard={yardParam}
        selectedSection={sectionParam}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the page loads in the browser**

Start the dev server:
```bash
npm run dev
```

Navigate to `http://localhost:3000/calendar`. Verify:
- Calendar grid renders with the current month
- Yard and section dropdowns appear
- Month prev/next navigation works
- If you have tasks with `scheduledStart`/`scheduledEnd` set, they appear as colored bars

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/calendar/page.tsx
git commit -m "feat: add /calendar server page with data fetching and error states"
```

---

## Task 6: Add Calendar to navigation

**Files:**
- Modify: `components/dashboard/DashboardNav.tsx` (line 9 — imports; line 16 — NAV_ITEMS)

- [ ] **Step 1: Add Calendar to NAV_ITEMS**

In `components/dashboard/DashboardNav.tsx`, update the import and `NAV_ITEMS`:

```typescript
// Change line 9 from:
import { LayoutDashboard, Search, LogOut, Fence, Menu, Settings } from "lucide-react";

// To:
import { LayoutDashboard, Search, LogOut, Fence, Menu, Settings, CalendarDays } from "lucide-react";
```

```typescript
// Change NAV_ITEMS (line 16) from:
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze", icon: Search },
  { href: "/yard", label: "Yards", icon: Fence },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// To:
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze", icon: Search },
  { href: "/yard", label: "Yards", icon: Fence },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
```

- [ ] **Step 2: Verify in the browser**

With `npm run dev` running, check:
- Desktop nav shows "Calendar" between "Yards" and "Settings"
- Mobile bottom nav shows Calendar icon
- Mobile hamburger sheet shows Calendar item
- Active state (green highlight) appears when on `/calendar`

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --run
```

Expected: all 177+ tests passing (calendar tests now included)

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/DashboardNav.tsx
git commit -m "feat: add Calendar nav item to desktop, mobile sheet, and bottom nav"
```

---

## Self-Review

**Spec coverage:**
- ✅ Dedicated `/calendar` page — Task 5
- ✅ URL search params (month, yard, section) — Task 5
- ✅ Grid range computation (Sunday–Saturday) — Task 1
- ✅ Yard + section filter dropdowns — Task 2
- ✅ Month prev/next navigation — Task 2
- ✅ Task bars spanning date range with column alignment — Tasks 1 + 4
- ✅ Continuation arrows for multi-week tasks — Tasks 1 + 4
- ✅ Section-based color coding — Tasks 1 + 4
- ✅ Completed tasks muted + strikethrough — Task 4
- ✅ Skipped tasks in gray — Task 4
- ✅ Empty weeks message — Task 4
- ✅ Today highlighted in green — Task 4
- ✅ Task popover with title, description, dates, section, yard — Task 3
- ✅ Status badge in popover — Task 3
- ✅ Buy link conditional on `task.product` — Task 3
- ✅ View section link — Task 3
- ✅ One popover at a time — Task 4
- ✅ No yards error state — Task 5
- ✅ Invalid month param defaults to current — Task 5
- ✅ Calendar nav item (desktop + mobile) — Task 6
- ✅ Data serialization (Dates → ISO strings) — Task 5

**Placeholder scan:** No TBDs or incomplete steps found.

**Type consistency:** `CalendarTask` defined once in `lib/calendar-utils.ts` and imported everywhere. `getBarPosition`, `sectionColor`, `COLOR_CLASSES`, `buildWeeks`, `computeGridRange` all defined in Task 1 and used consistently in Tasks 2–5.
