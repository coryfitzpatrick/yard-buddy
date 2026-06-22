const WATERING: Record<number, string[]> = {
  1: ["Wed"],
  2: ["Mon", "Thu"],
  3: ["Mon", "Wed", "Fri"],
  4: ["Mon", "Tue", "Thu", "Sat"],
  5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const MOWING: Record<number, string[]> = {
  1: ["Sat"],
  2: ["Wed", "Sat"],
  3: ["Mon", "Wed", "Sat"],
  4: ["Mon", "Wed", "Fri", "Sat"],
  5: ["Mon", "Tue", "Thu", "Fri", "Sat"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function distributeWateringDays(count: number | null): string[] {
  if (count == null || count < 1 || count > 7) return [];
  return WATERING[count];
}

export function distributeMowingDays(count: number | null): string[] {
  if (count == null || count < 1 || count > 7) return [];
  return MOWING[count];
}
