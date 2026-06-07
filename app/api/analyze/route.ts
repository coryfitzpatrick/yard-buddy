import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";

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
    include: { yard: { select: { zipCode: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  let forecastText: string | undefined;
  try {
    const weather = await getWeatherByZip(section.yard.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
    forecastText = formatForecastForClaude(weather.forecast);
  } catch { /* weather is optional context */ }

  try {
    const today = new Date();
    const result = await analyzeImages(imageUrls, {
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.spreaderType,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture ?? undefined,
      weatherSummary,
      forecastText,
      notes: section.notes,
    });

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
