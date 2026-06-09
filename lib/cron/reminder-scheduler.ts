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
    yardMowingSchedule?: string | null;
    yardWateringSchedule?: string | null;
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

    // Section schedule takes precedence; fall back to yard schedule
    const effectiveMowing = hasScheduleDays(section.mowingSchedule)
      ? section.mowingSchedule
      : (section.yardMowingSchedule ?? null);
    const effectiveWatering = hasScheduleDays(section.wateringSchedule)
      ? section.wateringSchedule
      : (section.yardWateringSchedule ?? null);

    if (effectiveMowing) {
      try {
        const p = JSON.parse(effectiveMowing);
        if (Array.isArray(p.days) && p.days.includes(dayAbbr)) {
          mowing = { time: p.time ?? "", inches: p.inches ?? "" };
        }
      } catch { /* skip unparseable */ }
    }

    if (effectiveWatering) {
      try {
        const p = JSON.parse(effectiveWatering);
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

function hasScheduleDays(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p.days) && p.days.length > 0;
  } catch { return false; }
}
