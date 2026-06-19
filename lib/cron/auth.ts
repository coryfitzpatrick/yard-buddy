import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const provided = req.headers.get("authorization") ?? "";
  const tokensMatch =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!tokensMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
