export function canSetSectionSchedule(plan: string | null): boolean {
  return plan === "trial" || plan === "home_basic" || plan === "home_plus" || plan === "professional" || plan === "admin";
}
