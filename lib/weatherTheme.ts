export interface WeatherTheme {
  slot: string;
  gradient: string;
  textClass: "text-white" | "text-gray-800";
}

const THEMES: Record<string, WeatherTheme> = {
  "sunny-day": {
    slot: "sunny-day",
    gradient: "from-sky-500/60 to-amber-400/40",
    textClass: "text-white",
  },
  "clear-night": {
    slot: "clear-night",
    gradient: "from-indigo-900/80 to-slate-800/60",
    textClass: "text-white",
  },
  "partly-cloudy-day": {
    slot: "partly-cloudy-day",
    gradient: "from-sky-400/60 to-slate-400/40",
    textClass: "text-white",
  },
  "partly-cloudy-night": {
    slot: "partly-cloudy-night",
    gradient: "from-slate-700/80 to-indigo-800/60",
    textClass: "text-white",
  },
  cloudy: {
    slot: "cloudy",
    gradient: "from-slate-500/60 to-gray-400/40",
    textClass: "text-white",
  },
  "cloudy-night": {
    slot: "cloudy-night",
    gradient: "from-slate-800/80 to-gray-700/60",
    textClass: "text-white",
  },
  rainy: {
    slot: "rainy",
    gradient: "from-slate-600/70 to-blue-700/50",
    textClass: "text-white",
  },
  "rainy-night": {
    slot: "rainy-night",
    gradient: "from-slate-900/80 to-blue-900/60",
    textClass: "text-white",
  },
  storm: {
    slot: "storm",
    gradient: "from-gray-900/80 to-slate-700/60",
    textClass: "text-white",
  },
  "storm-night": {
    slot: "storm-night",
    gradient: "from-gray-950/90 to-slate-900/70",
    textClass: "text-white",
  },
  snow: {
    slot: "snow",
    gradient: "from-sky-200/60 to-slate-200/40",
    textClass: "text-gray-800",
  },
  "snow-night": {
    slot: "snow-night",
    gradient: "from-slate-700/80 to-sky-900/60",
    textClass: "text-white",
  },
  foggy: {
    slot: "foggy",
    gradient: "from-gray-400/70 to-slate-300/50",
    textClass: "text-gray-800",
  },
};

export function getWeatherTheme(icon: string): WeatherTheme {
  const match = icon.match(/^(\d+)([dn])$/);
  if (!match) return THEMES["sunny-day"];
  const [, prefix, tod] = match;
  const isNight = tod === "n";

  switch (prefix) {
    case "01":
      return THEMES[isNight ? "clear-night" : "sunny-day"];
    case "02":
    case "03":
      return THEMES[isNight ? "partly-cloudy-night" : "partly-cloudy-day"];
    case "04":
      return THEMES[isNight ? "cloudy-night" : "cloudy"];
    case "09":
    case "10":
      return THEMES[isNight ? "rainy-night" : "rainy"];
    case "11":
      return THEMES[isNight ? "storm-night" : "storm"];
    case "13":
      return THEMES[isNight ? "snow-night" : "snow"];
    case "50":
      return THEMES["foggy"];
    default:
      return THEMES[isNight ? "clear-night" : "sunny-day"];
  }
}
