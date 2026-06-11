import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages, validateLawnImages } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";
import { deduplicateRecommendations } from "@/lib/analysis-utils";
import { canRunAnalysis, getPlanLimits } from "@/lib/subscription";

export const maxDuration = 60;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const wordsA = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalize(b).split(/\s+/).filter(Boolean));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
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

  let validation: { valid: boolean; feedback: string | null };
  try {
    validation = await validateLawnImages(imageUrls);
  } catch {
    validation = { valid: true, feedback: null };
  }
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "invalid_photos",
        message: validation.feedback ?? "Please take clear photos of your lawn from above or at ground level.",
      },
      { status: 422 }
    );
  }

  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });

  // Verify section ownership before any rate-limit queries (prevents BOLA)
  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true, spreaderType: true, streetAddress: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Count analyses for this section in the current calendar month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyCount = await db.lawnAnalysis.count({
    where: { yardSectionId: section.id, createdAt: { gte: startOfMonth } },
  });

  if (!canRunAnalysis(subUser, monthlyCount)) {
    const limits = getPlanLimits(subUser);
    const message = limits.canRunAnalysis
      ? `You have used all ${limits.maxAnalysesPerSectionPerMonth} analyses for this section this month. Your limit resets on the 1st of next month.`
      : "Upgrade your plan to analyze your lawn with AI.";
    return NextResponse.json({ error: "analysis_limit_reached", message }, { status: 403 });
  }

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
      currentRoutine: section.currentRoutine,
      // Section-aware enrichment
      sectionName: section.name,
      streetAddress: section.yard.streetAddress,
      sunExposure: null, // YardSection.sunExposure not yet in schema; passes null rather than wrong areaType
      weatherData: enrichedWeather,
    });

    result.recommendations = deduplicateRecommendations(result.recommendations);

    // Deduplicate against existing pending tasks in this yard
    const existingYardTasks = await db.lawnTask.findMany({
      where: {
        yardSection: { yardId: section.yardId },
        status: { not: "skipped" },
        yardSectionId: { not: sectionId }, // only cross-section matches
      },
      select: { id: true, title: true, product: true, additionalSectionIds: true },
    });

    const recsToCreate: typeof result.recommendations = [];
    const taskIdsToLink: string[] = [];

    for (const rec of result.recommendations) {
      const match = existingYardTasks.find((existing) => {
        if (existing.additionalSectionIds.includes(sectionId)) return false;
        if (titleSimilarity(rec.title, existing.title) < 0.6) return false;
        // Only merge if products are compatible (same or one is absent)
        const rp = rec.productSuggestion?.toLowerCase().trim() || null;
        const ep = existing.product?.toLowerCase().trim() || null;
        return !rp || !ep || rp === ep;
      });

      if (match) {
        taskIdsToLink.push(match.id);
      } else {
        recsToCreate.push(rec);
      }
    }

    // Link matched existing tasks to this section
    if (taskIdsToLink.length > 0) {
      await Promise.all(
        taskIdsToLink.map((id) =>
          db.lawnTask.update({
            where: { id },
            data: { additionalSectionIds: { push: sectionId } },
          })
        )
      );
    }

    const analysis = await db.lawnAnalysis.create({
      data: {
        yardSectionId: sectionId,
        imageUrls,
        healthScore: result.healthScore,
        issues: result.issues,
        summary: result.summary,
        rawResponse: JSON.stringify(result),
        tasks: {
          create: recsToCreate.map((r) => ({
            yardSectionId: sectionId,
            title: r.title,
            description: r.description,
            priority: r.priority,
            product: r.productSuggestion,
            applicationRate: r.applicationRate,
            spreaderSetting: r.spreaderSetting,
            taskMode: r.taskMode ?? null,
            productSearchQuery: r.productSearchQuery ?? null,
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
