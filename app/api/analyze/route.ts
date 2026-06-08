import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";
import { deduplicateRecommendations } from "@/lib/analysis-utils";

export const maxDuration = 60;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId, imageUrls } = await req.json();
  if (!sectionId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return NextResponse.json({ error: "sectionId and imageUrls[] required" }, { status: 400 });
  }
  if (imageUrls.length > 4) {
    return NextResponse.json({ error: "Maximum 4 images per analysis" }, { status: 400 });
  }

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true, spreaderType: true, streetAddress: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  let forecastText: string | undefined;
  let enrichedWeather: {
    temp: number;
    humidity: number;
    condition: string;
    recentRainfall: number;
    forecast: Array<{ day: string; high: number; low: number; condition: string; chanceOfRain: number }>;
  } | undefined;
  try {
    const weather = await Promise.race([
      getWeatherByZip(section.yard.zipCode),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("weather timeout")), 5000)),
    ]);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
    forecastText = formatForecastForClaude(weather.forecast);

    // Map WeatherData shape to the enriched format expected by buildSectionAnalysisPrompt
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    enrichedWeather = {
      temp: weather.temp,
      humidity: weather.humidity,
      condition: weather.description,
      recentRainfall: 0, // OpenWeatherMap free tier doesn't expose 7-day accumulation
      forecast: weather.forecast.map((f, i) => ({
        day: i === 0 ? "Today" : dayNames[new Date(f.date + "T12:00:00").getDay()],
        high: f.high,
        low: f.low,
        condition: f.description,
        chanceOfRain: f.precipChance,
      })),
    };
  } catch { /* weather is optional context */ }

  try {
    const today = new Date();
    const result = await analyzeImages(imageUrls, {
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.yard.spreaderType,
      soilPh: section.soilPh,
      nitrogenPpm: section.nitrogenPpm,
      phosphorusPpm: section.phosphorusPpm,
      potassiumPpm: section.potassiumPpm,
      soilTestSource: section.soilTestSource,
      soilMoisture: section.soilMoisture ?? undefined,
      weatherSummary,
      forecastText,
      notes: section.notes,
      currentRoutine: (section as typeof section & { currentRoutine?: string | null }).currentRoutine ?? null,
      // Section-aware enrichment
      sectionName: section.name,
      streetAddress: section.yard.streetAddress,
      sunExposure: null, // YardSection.sunExposure not yet in schema; passes null rather than wrong areaType
      weatherData: enrichedWeather,
    });

    result.recommendations = deduplicateRecommendations(result.recommendations);

    const analysis = await db.lawnAnalysis.create({
      data: {
        yardSectionId: sectionId,
        imageUrls,
        healthScore: result.healthScore,
        issues: result.issues,
        summary: result.summary,
        rawResponse: JSON.stringify(result),
        tasks: {
          create: result.recommendations.map((r) => ({
            yardSectionId: sectionId,
            title: r.title,
            description: r.description,
            priority: r.priority,
            product: r.productSuggestion,
            applicationRate: r.applicationRate,
            spreaderSetting: r.spreaderSetting,
            taskMode: r.taskMode ?? null,
            scheduledStart: typeof r.scheduledStartDays === "number"
              ? addDays(today, r.scheduledStartDays)
              : null,
            scheduledEnd: typeof r.scheduledEndDays === "number"
              ? addDays(today, r.scheduledEndDays)
              : null,
            weatherCondition: r.weatherCondition ?? null,
          })),
        },
      },
      include: { tasks: true },
    });

    return NextResponse.json({ analysis, result });
  } catch (err) {
    console.error("Analysis failed:", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
