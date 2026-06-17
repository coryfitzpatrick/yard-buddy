import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const lookupSchema = z.object({ address: z.string().min(3).max(200) });

function polygonAreaSqft(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  const latRef = (coords[0][1] * Math.PI) / 180;
  const R = 6371000;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ((coords[i][0] * Math.PI) / 180) * R * Math.cos(latRef);
    const y1 = (coords[i][1] * Math.PI) / 180 * R;
    const x2 = ((coords[j][0] * Math.PI) / 180) * R * Math.cos(latRef);
    const y2 = (coords[j][1] * Math.PI) / 180 * R;
    area += x1 * y2 - x2 * y1;
  }
  return Math.round(Math.abs(area / 2) * 10.7639);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(`lookup-yard-size:${session.user.id}`, 30, 60 * 60 * 1000);
  if (rate.limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = lookupSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "address required" }, { status: 400 });
  const { address } = parsed.data;

  const ua = "yard-analyzer/1.0 (lawn care app; contact@yardanalyzer.com)";

  // Geocode with Nominatim — get building footprint polygon
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&polygon_geojson=1&addressdetails=1`;
  const nominatimRes = await fetch(nominatimUrl, {
    headers: { "User-Agent": ua },
    signal: AbortSignal.timeout(8000),
  });

  if (!nominatimRes.ok) {
    return NextResponse.json({ lotSqft: null, buildingSqft: null, message: "Address lookup failed" });
  }

  const nominatimData = await nominatimRes.json();
  const place = nominatimData[0];
  if (!place) {
    return NextResponse.json({ lotSqft: null, buildingSqft: null, message: "Address not found" });
  }

  const lat = parseFloat(place.lat);
  const lon = parseFloat(place.lon);

  // Building footprint from Nominatim (when type is house/building, polygon is the footprint)
  let buildingSqft: number | null = null;
  const geo = place.geojson;
  const isBuilding = ["house", "building", "residential"].includes(place.type ?? "");
  if (isBuilding && geo?.type === "Polygon" && geo.coordinates?.[0]?.length >= 3) {
    const area = polygonAreaSqft(geo.coordinates[0] as [number, number][]);
    if (area > 100 && area < 20000) buildingSqft = area; // sanity check
  }

  // Lot size from Regrid (accurate parcel data)
  const regridKey = process.env.REGRID_API_KEY;
  if (regridKey) {
    try {
      const regridRes = await fetch(
        `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lon}&token=${regridKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (regridRes.ok) {
        const regridData = await regridRes.json();
        const acres = regridData?.parcels?.features?.[0]?.properties?.fields?.ll_gisacre;
        if (acres) {
          const lotSqft = Math.round(acres * 43560);
          const usableSqft = buildingSqft ? Math.max(0, lotSqft - buildingSqft) : null;
          return NextResponse.json({ lotSqft, buildingSqft, usableSqft, lat, lon, source: "parcel" });
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: Nominatim polygon as lot estimate (less reliable for residential)
  if (!isBuilding && geo?.type === "Polygon" && geo.coordinates?.[0]?.length >= 3) {
    const sqft = polygonAreaSqft(geo.coordinates[0] as [number, number][]);
    if (sqft > 500) {
      return NextResponse.json({
        lotSqft: sqft, buildingSqft: null, usableSqft: null, lat, lon,
        source: "map",
        note: "Estimated from map data — may not reflect exact lot boundaries",
      });
    }
  }

  return NextResponse.json({ lotSqft: null, buildingSqft: null, usableSqft: null, lat, lon, message: "No size data found for this address" });
}
