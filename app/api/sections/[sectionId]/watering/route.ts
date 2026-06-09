import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateWateringRecommendation } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId: session.user.id } },
    include: {
      yard: {
        select: {
          zipCode: true,
          wateringDaysPerWeek: true,
          wateringMinutesPerSession: true,
        },
      },
    },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await Promise.race([
      getWeatherByZip(section.yard.zipCode),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      ),
    ]);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity`;
  } catch { /* weather is optional */ }

  try {
    const result = await generateWateringRecommendation({
      grassType: section.grassType,
      areaType: section.areaType,
      yardSizeSqft: section.yardSizeSqft,
      soilPh: section.soilPh,
      soilMoisture: section.soilMoisture,
      notes: section.notes,
      zipCode: section.yard.zipCode,
      wateringDaysPerWeek: section.yard.wateringDaysPerWeek,
      wateringMinutesPerSession: section.yard.wateringMinutesPerSession,
      weatherSummary,
    });

    await db.yardSection.update({
      where: { id: sectionId },
      data: {
        wateringSchedule: result.schedule,
        wateringDeviates: result.deviates,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Watering recommendation failed:", err);
    return NextResponse.json({ error: "Failed to generate recommendation. Please try again." }, { status: 500 });
  }
}
