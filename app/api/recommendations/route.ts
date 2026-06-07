import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sectionId = req.nextUrl.searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 400 });

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(section.yard.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
  } catch { /* weather is optional context */ }

  try {
    const recommendations = await generateRecommendations({
      grassType: section.grassType as import("@/types").GrassType,
      zipCode: section.yard.zipCode,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      spreaderType: section.spreaderType,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture ?? undefined,
      weatherSummary,
      notes: section.notes,
    });

    await db.lawnTask.createMany({
      data: recommendations.map((r) => ({
        yardSectionId: sectionId,
        title: r.title,
        description: r.description,
        priority: r.priority,
        product: r.productSuggestion,
        applicationRate: r.applicationRate,
        spreaderSetting: r.spreaderSetting,
      })),
    });

    return NextResponse.json(recommendations);
  } catch (err) {
    console.error("Recommendations failed:", err);
    return NextResponse.json({ error: "Recommendations failed. Please try again." }, { status: 500 });
  }
}
