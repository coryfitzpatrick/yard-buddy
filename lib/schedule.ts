// Day labels stored in the structured schedule columns. Order matters for the day-picker UI.
export const SCHEDULE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number];

// 5:00 AM through 9:00 PM in 30-minute steps. Keep in sync with the picker UI.
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
