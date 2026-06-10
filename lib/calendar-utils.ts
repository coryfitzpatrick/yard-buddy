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
