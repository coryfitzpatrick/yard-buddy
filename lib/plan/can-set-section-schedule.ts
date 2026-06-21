export function canSetSectionSchedule(plan: string | null): boolean {
  return plan === "home_plus" || plan === "professional" || plan === "admin";
}
