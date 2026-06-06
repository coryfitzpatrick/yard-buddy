import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWeatherByZip } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Valid 5-digit ZIP required" }, { status: 400 });
  }

  try {
    const weather = await getWeatherByZip(zip);
    return NextResponse.json(weather, {
      headers: { "Cache-Control": "public, max-age=1800" },
    });
  } catch (err) {
    console.error("Weather API error:", err);
    return NextResponse.json({ error: "Weather data unavailable" }, { status: 502 });
  }
}
