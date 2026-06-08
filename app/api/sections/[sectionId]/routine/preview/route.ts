import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip, formatForecastForClaude } from "@/lib/weather";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const { mowing, watering, fertilizer } = await req.json();

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: { yard: { select: { zipCode: true, spreaderType: true } } },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const routineParts = [
    mowing ? `Mowing: ${mowing}` : null,
    watering ? `Watering: ${watering}` : null,
    fertilizer ? `Fertilizer & treatments: ${fertilizer}` : null,
  ].filter(Boolean);
  const currentRoutine = routineParts.length > 0 ? routineParts.join("\n") : null;

  let weatherSummary: string | undefined;
  let forecastText: string | undefined;
  try {
    const weather = await Promise.race([
      getWeatherByZip(section.yard.zipCode),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity`;
    forecastText = formatForecastForClaude(weather.forecast);
  } catch { /* weather is optional */ }

  const tasks = await generateRecommendations({
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
    currentRoutine,
    routineMode: true,
  });

  return NextResponse.json({ tasks });
}
