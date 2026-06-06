"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherData } from "@/types";
import { Droplets, Wind, CloudRain } from "lucide-react";

export function WeatherWidget({ zip }: { zip: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/weather?zip=${zip}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setWeather(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [zip]);

  if (loading) {
    return (
      <div className="h-28 rounded-xl bg-gradient-to-br from-sky-300 to-blue-400 animate-pulse" />
    );
  }
  if (!weather) return null;

  return (
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
      </CardContent>
    </Card>
  );
}
