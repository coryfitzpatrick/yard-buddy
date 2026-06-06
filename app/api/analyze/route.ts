import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { profileId, imageUrls } = body;

  if (!profileId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return NextResponse.json({ error: "profileId and imageUrls[] required" }, { status: 400 });
  }
  if (imageUrls.length > 4) {
    return NextResponse.json({ error: "Maximum 4 images per analysis" }, { status: 400 });
  }

  const profile = await db.yardProfile.findFirst({
    where: { id: profileId, userId: session.user.id },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(profile.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity, ${weather.precipitationChance}% chance of rain`;
  } catch {
    // weather is optional context
  }

  try {
    const result = await analyzeImages(imageUrls, {
      grassType: profile.grassType as import("@/types").GrassType,
      zipCode: profile.zipCode,
      yardSizeSqft: profile.yardSizeSqft,
      spreaderType: profile.spreaderType,
      soilPh: profile.soilPh,
      weatherSummary,
      notes: profile.notes,
    });

    const analysis = await db.lawnAnalysis.create({
      data: {
        yardProfileId: profileId,
        imageUrls,
        healthScore: result.healthScore,
        issues: result.issues,
        summary: result.summary,
        rawResponse: JSON.stringify(result),
        tasks: {
          create: result.recommendations.map((r) => ({
            yardProfileId: profileId,
            title: r.title,
            description: r.description,
            priority: r.priority,
            product: r.productSuggestion,
            applicationRate: r.applicationRate,
            spreaderSetting: r.spreaderSetting,
          })),
        },
      },
      include: { tasks: true },
    });

    return NextResponse.json({ analysis, result });
  } catch (err) {
    console.error("Analysis failed:", err);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
