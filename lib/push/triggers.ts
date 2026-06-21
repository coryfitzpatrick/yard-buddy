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
  // "any" is the no-sensitivity sentinel (see WeatherCondition in types/index.ts):
  // a task with weatherCondition === "any" has no weather concern by definition,
  // so firing a weather warning for it would be a category error.
  if (!task.scheduledStart || !task.weatherCondition || task.weatherCondition === "any") return false;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return sameUtcDate(task.scheduledStart, tomorrow);
}

// First-true-transition predicates for GDD-window pushes:
// `qualifiesOnMerits` = does today's data meet the threshold (e.g. cumulative GDD ≥ 50)?
// `alreadyFired` = was the window already opened on a prior run (the "fired" flag)?
// Together they identify the first day the window opens, and only that day, so
// we fire one push per yard per window per season rather than every day the
// window stays open. Keeping both inputs explicit means the cron's bookkeeping
// is visible at the call site instead of pre-baked into a single boolean.
export function shouldPushPreEmergent(qualifiesOnMerits: boolean, alreadyFired: boolean): boolean {
  return qualifiesOnMerits && !alreadyFired;
}

export function shouldPushGrub(qualifiesOnMerits: boolean, alreadyFired: boolean): boolean {
  return qualifiesOnMerits && !alreadyFired;
}

export function shouldPushOverseed(qualifiesOnMerits: boolean, alreadyFired: boolean): boolean {
  return qualifiesOnMerits && !alreadyFired;
}
