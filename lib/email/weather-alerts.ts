const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const LONG_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export type WeatherAlert = {
  yardName: string;
  date: string;
  kind: "watering" | "mowing";
  reason: string;
};

interface ForecastDay {
  date: Date;
  chanceOfRain: number;
  rainfallInches: number;
}

interface SectionInput {
  yardName: string;
  yardZip: string;
  effectiveWatering: { days: string[]; time: string | null; minutesPerSession: number | null };
  effectiveMowing: { days: string[]; time: string | null; heightInches: number | null };
}

export function buildWeatherAlerts(
  { sections, forecastByZip, today: _today }: { sections: SectionInput[]; forecastByZip: Map<string, ForecastDay[]>; today: Date }
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  for (const section of sections) {
    const forecast = forecastByZip.get(section.yardZip);
    if (!forecast) continue;
    for (const day of forecast) {
      const dayName = DAY_NAMES[day.date.getUTCDay()];
      const dateLabel = `${LONG_NAMES[day.date.getUTCDay()]}, ${MONTHS[day.date.getUTCMonth()]} ${day.date.getUTCDate()}`;
      if (section.effectiveWatering.days.includes(dayName)) {
        if (day.chanceOfRain >= 0.5 || day.rainfallInches >= 0.25) {
          alerts.push({
            yardName: section.yardName,
            date: dateLabel,
            kind: "watering",
            reason: `Rain expected (${Math.round(day.chanceOfRain * 100)}%)`,
          });
        }
      }
      if (section.effectiveMowing.days.includes(dayName)) {
        if (day.chanceOfRain >= 0.5 || day.rainfallInches >= 0.10) {
          alerts.push({
            yardName: section.yardName,
            date: dateLabel,
            kind: "mowing",
            reason: `Rain expected (${Math.round(day.chanceOfRain * 100)}%)`,
          });
        }
      }
    }
  }
  return alerts;
}
