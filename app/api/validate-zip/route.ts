import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const KEY = process.env.OPENWEATHERMAP_API_KEY!;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ valid: false, reason: "format" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/geo/1.0/zip?zip=${zip},US&appid=${KEY}`,
      { next: { revalidate: 86400 } },
    );
    if (res.status === 404) {
      return NextResponse.json({ valid: false, reason: "not_found" });
    }
    if (!res.ok) {
      return NextResponse.json({ valid: false, reason: "upstream" }, { status: 502 });
    }
    const data = (await res.json()) as { name?: string; country?: string };
    return NextResponse.json({ valid: true, city: data.name ?? null });
  } catch {
    return NextResponse.json({ valid: false, reason: "upstream" }, { status: 502 });
  }
}
