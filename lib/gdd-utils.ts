const WARM_SEASON_GRASSES = new Set(["bermuda", "zoysia", "st_augustine", "centipede", "bahia"]);
const DEEP_SOUTH_STATES = new Set(["AL", "FL", "GA", "LA", "MS", "SC", "TX"]);
const JAPANESE_BEETLE_STATES = new Set([
  "CT", "DC", "DE", "IA", "IL", "IN", "KY", "MA", "MD", "ME", "MI", "MN",
  "MO", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "TN", "VA", "VT", "WI", "WV",
]);

export function computeDailyGdd(dailyHigh: number, dailyLow: number): number {
  return Math.max(0, (dailyHigh + dailyLow) / 2 - 50);
}

export function isPreEmergentApplicable(grassType: string, state: string): boolean {
  if (!WARM_SEASON_GRASSES.has(grassType)) return true;
  return !DEEP_SOUTH_STATES.has(state.toUpperCase());
}

export function isGrubAlertApplicable(grassType: string, state: string): boolean {
  if (WARM_SEASON_GRASSES.has(grassType)) return false;
  return JAPANESE_BEETLE_STATES.has(state.toUpperCase());
}

export function isOverseedingApplicable(grassType: string): boolean {
  return !WARM_SEASON_GRASSES.has(grassType);
}
