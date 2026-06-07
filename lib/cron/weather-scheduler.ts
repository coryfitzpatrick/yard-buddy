import type { WeatherCondition } from "@/types";

interface ForecastDay {
  date: string;
  precipChance: number;
  high: number;
  low: number;
  description: string;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function computeNewWindow(
  condition: WeatherCondition,
  forecast: ForecastDay[],
  originalWindowDays: number,
  today: Date = new Date()
): { scheduledStart: Date; scheduledEnd: Date } | null {
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  switch (condition) {
    case "dry_day": {
      const idx = forecast.findIndex((d) => d.precipChance < 20);
      if (idx === -1) return null;
      const start = addDays(base, idx);
      return { scheduledStart: start, scheduledEnd: addDays(start, originalWindowDays - 1) };
    }

    case "no_rain_48h": {
      for (let i = 0; i < forecast.length - 1; i++) {
        if (forecast[i].precipChance < 30 && forecast[i + 1].precipChance < 30) {
          const start = addDays(base, i);
          return { scheduledStart: start, scheduledEnd: addDays(start, originalWindowDays - 1) };
        }
      }
      return null;
    }

    case "soil_moist": {
      for (let i = 0; i < forecast.length; i++) {
        if (forecast[i].precipChance > 50) {
          const start = addDays(base, i + 1);
          return { scheduledStart: start, scheduledEnd: addDays(start, originalWindowDays - 1) };
        }
      }
      return null;
    }

    case "any":
    default:
      return null;
  }
}
