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
