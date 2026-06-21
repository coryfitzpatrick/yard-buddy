// lib/push/triggers.ts
// Pure predicates for deciding whether to fire each kind of push notification.
// Keeping these pure makes the daily-tasks cron integration easy to reason about
// and trivially unit-testable.

function sameUtcDate(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function shouldPushBestDay(
  task: { bestDay: Date | null },
  today: Date,
): boolean {
  if (!task.bestDay) return false;
  return sameUtcDate(task.bestDay, today);
}

export function shouldPushWeatherWarning(
  task: { scheduledStart: Date | null; weatherCondition: string | null },
  today: Date,
): boolean {
  if (!task.scheduledStart || !task.weatherCondition) return false;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return sameUtcDate(task.scheduledStart, tomorrow);
}

// First-true-transition predicates: today's value is true, yesterday's was false.
// Caller passes both values; this keeps the predicate pure for testing.
export function shouldPushPreEmergent(todayApplicable: boolean, yesterdayApplicable: boolean): boolean {
  return todayApplicable && !yesterdayApplicable;
}

export function shouldPushGrub(todayApplicable: boolean, yesterdayApplicable: boolean): boolean {
  return todayApplicable && !yesterdayApplicable;
}

export function shouldPushOverseed(todayApplicable: boolean, yesterdayApplicable: boolean): boolean {
  return todayApplicable && !yesterdayApplicable;
}
