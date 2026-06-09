const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduledReminder {
  sectionName: string;
  yardName: string;
  mowing: { time: string; inches: string } | null;
  watering: { time: string; minutes: string } | null;
}

export function getTodayReminders(
  sections: Array<{
    name: string;
    yardName: string;
    mowingSchedule: string | null;
    wateringSchedule: string | null;
  }>,
  today: Date,
  daysBefore: number
): ScheduledReminder[] {
  const checkDate = new Date(today);
  checkDate.setUTCDate(checkDate.getUTCDate() + daysBefore);
  const dayAbbr = DAY_NAMES[checkDate.getUTCDay()];

  const reminders: ScheduledReminder[] = [];

  for (const section of sections) {
    let mowing: ScheduledReminder["mowing"] = null;
    let watering: ScheduledReminder["watering"] = null;

    if (section.mowingSchedule) {
      try {
        const p = JSON.parse(section.mowingSchedule);
        if (Array.isArray(p.days) && p.days.includes(dayAbbr)) {
          mowing = { time: p.time ?? "", inches: p.inches ?? "" };
        }
      } catch { /* skip unparseable */ }
    }

    if (section.wateringSchedule) {
      try {
        const p = JSON.parse(section.wateringSchedule);
        if (Array.isArray(p.days) && p.days.includes(dayAbbr)) {
          watering = { time: p.time ?? "", minutes: p.inches ?? "" };
        }
      } catch { /* skip unparseable */ }
    }

    if (mowing || watering) {
      reminders.push({ sectionName: section.name, yardName: section.yardName, mowing, watering });
    }
  }

  return reminders;
}
