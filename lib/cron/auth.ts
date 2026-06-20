import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expected = `Bearer ${secret}`;
  const provided = req.headers.get("authorization") ?? "";
  const tokensMatch =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!tokensMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
