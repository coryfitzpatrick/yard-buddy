import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWeatherByZip, getWeatherByLatLon } from "@/lib/weather";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE = { headers: { "Cache-Control": "public, max-age=1800" } };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(`weather:${session.user.id}`, 60, 60 * 60 * 1000);
  if (rate.limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const zip = searchParams.get("zip");
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  try {
    if (zip) {
      if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Valid 5-digit ZIP required" }, { status: 400 });
      return NextResponse.json(await getWeatherByZip(zip), CACHE);
    }
    if (lat && lon) {
      const latN = parseFloat(lat), lonN = parseFloat(lon);
      if (isNaN(latN) || isNaN(lonN)) return NextResponse.json({ error: "Valid lat/lon required" }, { status: 400 });
      return NextResponse.json(await getWeatherByLatLon(latN, lonN), CACHE);
    }
    return NextResponse.json({ error: "zip or lat/lon required" }, { status: 400 });
  } catch (err) {
    console.error("Weather API error:", err);
    return NextResponse.json({ error: "Weather data unavailable" }, { status: 502 });
  }
}
