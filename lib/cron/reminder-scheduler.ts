const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] as const;

export interface ScheduledReminder {
  sectionName: string;
  yardName: string;
  mowing: { time: string; inches: number } | null;
  watering: { time: string; minutes: number } | null;
}

interface EffectiveWatering {
  days: string[];
  time: string | null;
  minutesPerSession: number | null;
}

interface EffectiveMowing {
  days: string[];
  time: string | null;
  heightInches: number | null;
}

/**
 * Returns schedule reminders for sections whose effective watering or mowing
 * day matches the target day.
 * @param daysBefore - Days ahead of today to check (0 = today, 1 = tomorrow).
 */
export function getTodayReminders(
  sections: Array<{
    name: string;
    yardName: string;
    effectiveWatering: EffectiveWatering;
    effectiveMowing: EffectiveMowing;
  }>,
  today: Date,
  daysBefore: number,
): ScheduledReminder[] {
  const checkDate = new Date(today);
  checkDate.setUTCDate(checkDate.getUTCDate() + daysBefore);
  const dayAbbr = DAY_NAMES[checkDate.getUTCDay()];

  const reminders: ScheduledReminder[] = [];
  for (const section of sections) {
    let watering: ScheduledReminder["watering"] = null;
    let mowing: ScheduledReminder["mowing"] = null;

    if (
      section.effectiveWatering.days.includes(dayAbbr) &&
      section.effectiveWatering.time &&
      section.effectiveWatering.minutesPerSession != null
    ) {
      watering = {
        time: section.effectiveWatering.time,
        minutes: section.effectiveWatering.minutesPerSession,
      };
    }
    if (
      section.effectiveMowing.days.includes(dayAbbr) &&
      section.effectiveMowing.time &&
      section.effectiveMowing.heightInches != null
    ) {
      mowing = {
        time: section.effectiveMowing.time,
        inches: section.effectiveMowing.heightInches,
      };
    }

    if (watering || mowing) {
      reminders.push({ sectionName: section.name, yardName: section.yardName, mowing, watering });
    }
  }
  return reminders;
}
