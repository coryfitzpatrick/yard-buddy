"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { WeatherData } from "@/types";
import {
  Droplets,
  Wind,
  CloudRain,
  Loader2,
  MapPinOff,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getWeatherTheme } from "@/lib/weatherTheme";

interface Props {
  zip: string | null;
  initialCollapsed?: boolean;
}

export function WeatherWidget({ zip, initialCollapsed = false }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const fetchByCoords = useCallback((lat: number, lon: number) => {
    return fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setWeather(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setGeoBlocked(false);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchByCoords(coords.latitude, coords.longitude),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoBlocked(true);
        setLoading(false);
      },
      { timeout: 8000 }
    );
  }, [fetchByCoords]);

  useEffect(() => {
    setLoading(true);
    setGeoBlocked(false);
    if (zip) {
      fetch(`/api/weather?zip=${zip}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setWeather(d); })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    requestGeolocation();
  }, [zip, requestGeolocation]);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weatherWidgetCollapsed: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  if (loading && !weather) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 min-h-[3.5rem] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/80" />
      </div>
    );
  }

  if (geoBlocked && !zip && !weather) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 text-white p-5 flex flex-col items-center justify-center gap-3 min-h-[8rem] text-center">
        <MapPinOff className="w-7 h-7 opacity-80" />
        <div>
          <p className="font-medium text-sm">Location access is blocked</p>
          <p className="text-xs opacity-80 mt-0.5">
            Enable location in your browser settings to see local weather,
            or select a yard above.
          </p>
        </div>
        <button
          onClick={requestGeolocation}
          className="flex items-center gap-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 transition-colors rounded-full px-3 py-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Try Again
        </button>
      </div>
    );
  }

  if (!weather) return null;

  const theme = getWeatherTheme(weather.icon);

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        backgroundImage: `url('/weather/${theme.slot}.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`} />
      <div className="absolute inset-0 bg-black/30" />

      {loading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20">
          <Loader2 className="w-8 h-8 animate-spin text-white drop-shadow" />
        </div>
      )}

      <div className={`relative z-10 ${theme.textClass}`}>
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left min-h-[44px]"
          aria-expanded={!collapsed}
        >
          <span className="font-semibold truncate max-w-[8rem] shrink-0">
            {weather.location}
          </span>
          <span className="font-bold shrink-0">{weather.temp}°F</span>
          <span className="capitalize opacity-90 text-sm shrink-0">
            {weather.description}
          </span>
          <Image
            src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
            alt={weather.description}
            width={24}
            height={24}
            className="w-6 h-6 shrink-0"
          />
          <span className="flex items-center gap-1 text-sm opacity-90 shrink-0">
            <Droplets className="w-3 h-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1 text-sm opacity-90 shrink-0">
            <Wind className="w-3 h-3" />
            {weather.windSpeed} mph
          </span>
          <span className="flex items-center gap-1 text-sm opacity-90 shrink-0">
            <CloudRain className="w-3 h-3" />
            {weather.precipitationChance}% rain
          </span>
          <span className="ml-auto shrink-0">
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </span>
        </button>

        {!collapsed && (
          <div className="px-4 pb-4 border-t border-white/20">
            <div className="flex items-center justify-between pt-3">
              <div>
                <div className="text-4xl font-bold">{weather.temp}°F</div>
                <div className="text-sm opacity-90 capitalize">
                  {weather.description}
                </div>
              </div>
              <Image
                src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                alt={weather.description}
                width={64}
                height={64}
                className="w-16 h-16"
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm opacity-90">
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3" /> {weather.humidity}%
              </span>
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3" /> {weather.windSpeed} mph
              </span>
              <span className="flex items-center gap-1">
                <CloudRain className="w-3 h-3" /> {weather.precipitationChance}% rain
              </span>
            </div>

            {weather.forecast.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-4 gap-2">
                {weather.forecast.slice(0, 4).map((day) => (
                  <div key={day.date} className="text-center">
                    <div className="text-xs opacity-75 mb-1">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </div>
                    <div className="text-xs capitalize opacity-80 leading-tight mb-1 line-clamp-2">
                      {day.description}
                    </div>
                    <div className="text-sm font-semibold">{day.high}°</div>
                    <div className="text-xs opacity-70">{day.low}°</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
