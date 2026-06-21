import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages, validateLawnImages } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";
import { deduplicateRecommendations } from "@/lib/analysis-utils";
import { canRunAnalysis, getPlanLimits } from "@/lib/subscription";
import { isOwnedLawnPhotoUrl } from "@/lib/storage-url";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { withAxiom, logger } from "@/lib/observability/logger";

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

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Each user gets ~10 analyses/hr regardless of plan-level monthly caps —
  // tight bound because every call fans out to multiple paid Claude requests.
  const rate = await checkRateLimit(
    `analyze:${session.user.id}`,
    10,
    60 * 60 * 1000,
    { route: "/api/analyze", ip: getClientIp(req), userId: session.user.id },
  );
  if (rate.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many analyses in the last hour. Try again shortly." },
      { status: 429 },
    );
  }

  const body = await req.json();
  const { sectionId } = body;
  // Accept either { photos: [{url, kind}] } (new) or { imageUrls: [...] } (legacy).
  const photos: Array<{ url: string; kind: string }> = Array.isArray(body.photos)
    ? body.photos.filter((p: unknown): p is { url: string; kind: string } =>
        typeof p === "object" && p !== null && typeof (p as { url?: unknown }).url === "string"
      )
    : Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((u: unknown): u is string => typeof u === "string").map((url: string) => ({ url, kind: "other" }))
      : [];

  if (!sectionId || photos.length === 0) {
    return NextResponse.json({ error: "sectionId and photos[] required" }, { status: 400 });
  }
  // Block users from forwarding arbitrary URLs to Claude on our dime — every
  // photo URL must be a public lawn-photos URL scoped to this user's prefix.
  for (const p of photos) {
    if (!isOwnedLawnPhotoUrl(p.url, session.user.id)) {
      return NextResponse.json({ error: "invalid_photo_url" }, { status: 400 });
    }
  }
  const { MAX_PHOTOS, PHOTO_KIND_META } = await import("@/lib/photo-kinds");
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Maximum ${MAX_PHOTOS} photos per analysis` }, { status: 400 });
  }
  // Enforce per-kind caps server-side too, mirroring the UI.
  const countsByKind: Record<string, number> = {};
  for (const p of photos) {
    countsByKind[p.kind] = (countsByKind[p.kind] ?? 0) + 1;
  }
  for (const [kind, count] of Object.entries(countsByKind)) {
    const meta = PHOTO_KIND_META[kind as keyof typeof PHOTO_KIND_META];
    if (meta?.maxPerKind != null && count > meta.maxPerKind) {
      return NextResponse.json(
        { error: `Maximum ${meta.maxPerKind} ${meta.label.toLowerCase()} photo${meta.maxPerKind === 1 ? "" : "s"}` },
        { status: 400 }
      );
    }
  }
  const imageUrls = photos.map((p) => p.url);

  let validation: { valid: boolean; feedback: string | null };
  try {
    validation = await validateLawnImages(imageUrls, { userId: session.user.id, feature: "analyze" });
  } catch (err) {
    // Validator failures shouldn't block analysis — fall through as "valid".
    logger.warn("Lawn image validation failed; allowing analysis to proceed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
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

  // Count analyses for the entire yard this calendar month — limits are now
  // yard-scoped so splitting a yard into sections doesn't reset the pool.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyCount = await db.lawnAnalysis.count({
    where: {
      yardSection: { yardId: section.yardId },
      createdAt: { gte: startOfMonth },
    },
  });

  if (!canRunAnalysis(subUser, monthlyCount)) {
    const limits = getPlanLimits(subUser);
    const message = limits.canRunAnalysis
      ? `You have used all ${limits.maxAnalysesPerYardPerMonth} analyses for this yard this month. Your limit resets on the 1st of next month.`
      : "Upgrade your plan to unlock automated lawn analysis.";
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
    const result = await analyzeImages(photos, {
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
    }, { userId: session.user.id, feature: "analyze" });

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
    logger.error("Analysis failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
});
