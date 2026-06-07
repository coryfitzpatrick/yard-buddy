"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherData } from "@/types";
import { Droplets, Wind, CloudRain, Loader2, MapPinOff, RefreshCw } from "lucide-react";

export function WeatherWidget({ zip }: { zip: string | null }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [geoBlocked, setGeoBlocked] = useState(false);

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

  // Initial load — centered spinner in a box matching card height
  if (loading && !weather) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 min-h-[13rem] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/80" />
      </div>
    );
  }

  // Geolocation blocked, no yard selected, no weather
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

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 rounded-xl bg-black/30 flex items-center justify-center z-10">
          <Loader2 className="w-8 h-8 animate-spin text-white drop-shadow" />
        </div>
      )}
      <Card className="bg-gradient-to-br from-sky-400 to-blue-500 text-white border-0">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium opacity-90">
            {weather.location} — Current Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold">{weather.temp}°F</div>
              <div className="text-sm opacity-90 capitalize">{weather.description}</div>
            </div>
            <Image
              src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
              alt={weather.description}
              width={64}
              height={64}
              className="w-16 h-16"
            />
          </div>
          <div className="flex gap-4 mt-3 text-sm opacity-90">
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
                    {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-xs capitalize opacity-80 leading-tight mb-1 line-clamp-2">{day.description}</div>
                  <div className="text-sm font-semibold">{day.high}°</div>
                  <div className="text-xs opacity-70">{day.low}°</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
