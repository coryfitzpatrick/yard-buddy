import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

export type ApplyTarget = "yard" | "section";

export function applyTargetForPlan(plan: string | null): ApplyTarget {
  return canSetSectionSchedule(plan) ? "section" : "yard";
}
