import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

type WateringSource = {
  wateringDaysPerWeek: number | null;
  wateringMinutesPerSession: number | null;
};

type MowingSource = {
  mowingDaysPerWeek: number | null;
  mowingHeightInches: number | null;
};

export function effectiveWatering(
  section: WateringSource,
  yard: WateringSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    daysPerWeek: (canOverride ? section.wateringDaysPerWeek : null) ?? yard.wateringDaysPerWeek ?? null,
    minutesPerSession: (canOverride ? section.wateringMinutesPerSession : null) ?? yard.wateringMinutesPerSession ?? null,
  };
}

export function effectiveMowing(
  section: MowingSource,
  yard: MowingSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  return {
    daysPerWeek: (canOverride ? section.mowingDaysPerWeek : null) ?? yard.mowingDaysPerWeek ?? null,
    heightInches: (canOverride ? section.mowingHeightInches : null) ?? yard.mowingHeightInches ?? null,
  };
}
