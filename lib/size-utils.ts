export const SQFT_PER_ACRE = 43560;

export function toSqft(display: string, unit: "sqft" | "acres"): number | undefined {
  const n = parseFloat(display);
  if (isNaN(n) || n <= 0) return undefined;
  return unit === "acres" ? Math.round(n * SQFT_PER_ACRE) : Math.round(n);
}

export function toDisplaySize(sqft: number, unit: "sqft" | "acres"): string {
  return unit === "acres" ? (sqft / SQFT_PER_ACRE).toFixed(3) : String(sqft);
}
