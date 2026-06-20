import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(
    `recommendations:${session.user.id}`,
    20,
    60 * 60 * 1000,
    { route: "/api/recommendations", ip: getClientIp(req), userId: session.user.id },
  );
  if (rate.limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const sectionId = req.nextUrl.searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 400 });

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true, spreaderType: true } } },
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
    const recommendations = await generateRecommendations(
      {
        grassType: section.grassType as import("@/types").GrassType,
        zipCode: section.yard.zipCode,
        areaType: section.areaType,
        yardSizeSqft: section.yardSizeSqft,
        spreaderType: section.yard.spreaderType,
        soilPh: section.soilPh,
        soilMoisture: section.soilMoisture ?? undefined,
        weatherSummary,
        forecastText,
        notes: section.notes,
      },
      { userId: session.user.id, feature: "recommendations" },
    );

    await db.lawnTask.createMany({
      data: recommendations.map((r) => ({
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
    });

    return NextResponse.json(recommendations);
  } catch (err) {
    console.error("Recommendations failed:", err);
    return NextResponse.json({ error: "Recommendations failed. Please try again." }, { status: 500 });
  }
}
