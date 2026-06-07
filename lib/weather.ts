import { WeatherData } from "@/types";

const BASE = "https://api.openweathermap.org/data/2.5";
const KEY = process.env.OPENWEATHERMAP_API_KEY!;

export async function getWeatherByZip(zip: string, country = "us"): Promise<WeatherData> {
  const [current, forecast] = await Promise.all([
    fetch(`${BASE}/weather?zip=${zip},${country}&appid=${KEY}&units=imperial`).then((r) => r.json()),
    fetch(`${BASE}/forecast?zip=${zip},${country}&appid=${KEY}&units=imperial&cnt=24`).then((r) => r.json()),
  ]);

  if (current.cod !== 200) {
    throw new Error(`Weather API error: ${current.message ?? current.cod}`);
  }

  const dailyMap = new Map<string, { high: number; low: number; description: string; precipChance: number }>();
  for (const item of forecast.list ?? []) {
    const date = item.dt_txt.split(" ")[0];
    const existing = dailyMap.get(date);
    const pop = (item.pop ?? 0) * 100; // OpenWeatherMap returns 0-1 probability
    if (!existing) {
      dailyMap.set(date, {
        high: item.main.temp_max,
        low: item.main.temp_min,
        description: item.weather[0].description,
        precipChance: pop,
      });
    } else {
      dailyMap.set(date, {
        high: Math.max(existing.high, item.main.temp_max),
        low: Math.min(existing.low, item.main.temp_min),
        description: existing.description,
        precipChance: Math.max(existing.precipChance, pop),
      });
    }
  }

  // Get precipitation chance for today/current period
  const currentPrecipChance = forecast.list?.[0]?.pop != null
    ? Math.round(forecast.list[0].pop * 100)
    : 0;

  return {
    temp: Math.round(current.main.temp),
    humidity: current.main.humidity,
    description: current.weather[0].description,
    icon: current.weather[0].icon,
    windSpeed: Math.round(current.wind.speed),
    location: current.name ?? zip,
    precipitationChance: currentPrecipChance,
    forecast: Array.from(dailyMap.entries())
      .slice(0, 5)
      .map(([date, data]) => ({
        date,
        high: Math.round(data.high),
        low: Math.round(data.low),
        description: data.description,
        precipChance: Math.round(data.precipChance),
      })),
  };
}

export function formatForecastForClaude(
  forecast: WeatherData["forecast"]
): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return forecast
    .map((day, i) => {
      const label = i === 0 ? "Today" : dayNames[new Date(day.date + "T12:00:00").getDay()];
      return `- ${label} ${day.date}: ${day.high}F, ${day.description}, ${day.precipChance}% rain`;
    })
    .join("\n");
}
