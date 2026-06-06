import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Shoelace formula on a projected coordinate plane (equirectangular)
function polygonAreaSqft(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  const latRef = (coords[0][1] * Math.PI) / 180;
  const R = 6371000; // earth radius in meters
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

  const { address } = await req.json();
  if (!address?.trim()) return NextResponse.json({ error: "address required" }, { status: 400 });

  const ua = "yard-buddy/1.0 (lawn care app; fitzmx6@gmail.com)";

  // Geocode with Nominatim (free, no key)
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&polygon_geojson=1&addressdetails=1`;
  const nominatimRes = await fetch(nominatimUrl, {
    headers: { "User-Agent": ua },
    signal: AbortSignal.timeout(8000),
  });

  if (!nominatimRes.ok) {
    return NextResponse.json({ sqft: null, message: "Address lookup failed" });
  }

  const nominatimData = await nominatimRes.json();
  const place = nominatimData[0];
  if (!place) {
    return NextResponse.json({ sqft: null, message: "Address not found" });
  }

  const lat = parseFloat(place.lat);
  const lon = parseFloat(place.lon);

  // Try Regrid if API key is configured (accurate parcel/lot data)
  const regridKey = process.env.REGRID_API_KEY;
  if (regridKey) {
    const regridRes = await fetch(
      `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lon}&token=${regridKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (regridRes.ok) {
      const regridData = await regridRes.json();
      const acres = regridData?.parcels?.features?.[0]?.properties?.fields?.ll_gisacre;
      if (acres) {
        return NextResponse.json({
          sqft: Math.round(acres * 43560),
          lat,
          lon,
          source: "parcel",
        });
      }
    }
  }

  // Fall back to Nominatim polygon (often building footprint for residential)
  const geo = place.geojson;
  if (geo?.type === "Polygon" && geo.coordinates?.[0]?.length >= 3) {
    const sqft = polygonAreaSqft(geo.coordinates[0] as [number, number][]);
    if (sqft > 200) {
      return NextResponse.json({
        sqft,
        lat,
        lon,
        source: "building_footprint",
        note: "Estimated from map data — may reflect building footprint, not full lot",
      });
    }
  }

  return NextResponse.json({ sqft: null, lat, lon, message: "No parcel data found for this address" });
}
