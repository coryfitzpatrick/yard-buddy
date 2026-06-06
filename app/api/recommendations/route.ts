import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const profile = await db.yardProfile.findFirst({
    where: { id: profileId, userId: session.user.id },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(profile.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
  } catch {
    // weather is optional context — proceed without it
  }

  try {
    const recommendations = await generateRecommendations({
      grassType: profile.grassType as any,
      zipCode: profile.zipCode,
      yardSizeSqft: profile.yardSizeSqft,
      spreaderType: profile.spreaderType,
      soilPh: profile.soilPh,
      soilMoisture: profile.soilMoisture ?? undefined,
      weatherSummary,
      notes: profile.notes,
    });

    await db.lawnTask.createMany({
      data: recommendations.map((r) => ({
        yardProfileId: profileId,
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
    return NextResponse.json(
      { error: "Recommendations failed. Please try again." },
      { status: 500 }
    );
  }
}
