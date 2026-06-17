// Day labels stored in the schedule JSON. Order matters for the day-picker.
export const SCHEDULE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number];

// 5:00 AM → 9:00 PM in 30-minute steps. Keep in sync with the picker UI.
export const SCHEDULE_TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 300 + i * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h;
  return {
    label: `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`,
    value: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
  };
});

export const MOWING_HEIGHT_OPTIONS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6"];
export const WATERING_MINUTE_OPTIONS = ["5", "10", "15", "20", "25", "30", "40", "45", "60", "90"];

export interface ParsedSchedule {
  days: string[];
  time: string;
  inches: string; // "inches" for mowing height, "minutes" for watering duration; the field is reused for both
}

const EMPTY_SCHEDULE: ParsedSchedule = { days: [], time: "", inches: "" };

export function parseSchedule(raw: string | null | undefined): ParsedSchedule {
  if (!raw) return EMPTY_SCHEDULE;
  try {
    const p = JSON.parse(raw) as { days?: unknown; time?: unknown; inches?: unknown };
    if (Array.isArray(p.days)) {
      return {
        days: p.days.filter((d): d is string => typeof d === "string"),
        time: typeof p.time === "string" ? p.time : "",
        inches: typeof p.inches === "string" ? p.inches : "",
      };
    }
  } catch {
    // Malformed JSON falls back to empty.
  }
  return EMPTY_SCHEDULE;
}

export function serializeSchedule(days: string[], time: string, inches: string): string | undefined {
  if (!days.length && !time && !inches) return undefined;
  return JSON.stringify({ days, time, inches });
}

function formatTimeForSummary(time: string): string | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Used to render the "Yard default: …" hint when a section hasn't set its own
// schedule. Returns null if the raw schedule is empty/invalid.
export function formatScheduleSummary(
  raw: string | null | undefined,
  unitSuffix: "in" | "min",
): string | null {
  const parsed = parseSchedule(raw);
  if (parsed.days.length === 0) return null;
  const parts = [parsed.days.join(", ")];
  const timeLabel = formatTimeForSummary(parsed.time);
  if (timeLabel) parts.push(timeLabel);
  if (parsed.inches) parts.push(`${parsed.inches} ${unitSuffix}`);
  return parts.join(" · ");
}
