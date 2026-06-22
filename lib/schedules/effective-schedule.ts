import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

type WateringSource = {
  wateringDays: string[];
  wateringTime: string | null;
  wateringMinutesPerSession: number | null;
};

type MowingSource = {
  mowingDays: string[];
  mowingTime: string | null;
  mowingHeightInches: number | null;
};

export function effectiveWatering(
  section: WateringSource,
  yard: WateringSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  const days = canOverride && section.wateringDays.length > 0 ? section.wateringDays : yard.wateringDays;
  const time = (canOverride ? section.wateringTime : null) ?? yard.wateringTime ?? null;
  const minutesPerSession = (canOverride ? section.wateringMinutesPerSession : null) ?? yard.wateringMinutesPerSession ?? null;
  return { days, time, minutesPerSession };
}

export function effectiveMowing(
  section: MowingSource,
  yard: MowingSource,
  plan: string | null,
) {
  const canOverride = canSetSectionSchedule(plan);
  const days = canOverride && section.mowingDays.length > 0 ? section.mowingDays : yard.mowingDays;
  const time = (canOverride ? section.mowingTime : null) ?? yard.mowingTime ?? null;
  const heightInches = (canOverride ? section.mowingHeightInches : null) ?? yard.mowingHeightInches ?? null;
  return { days, time, heightInches };
}
