const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduledReminder {
  sectionName: string;
  yardName: string;
  mowing: { time: string; inches: string } | null;
  watering: { time: string; minutes: string } | null;
}

/**
 * Returns schedule reminders for sections matching the target day.
 * @param daysBefore - Days ahead of today to check (0 = today, 1 = tomorrow).
 *   Use 1 to send a reminder the day before a scheduled event.
 * Note: watering JSON uses "inches" key for duration minutes — SectionForm
 * serializes both mowing height and watering duration with the same field name.
 */
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
          // "inches" key stores watering minutes (SectionForm serialization)
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
