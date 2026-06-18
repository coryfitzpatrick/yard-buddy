import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export function getClientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || "unknown";
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ limited: boolean }> {
  const windowStart = new Date(Date.now() - windowMs);
  const count = await db.rateLimitAttempt.count({
    where: { key, createdAt: { gte: windowStart } },
  });
  if (count >= maxAttempts) return { limited: true };
  await db.rateLimitAttempt.create({ data: { key } });
  return { limited: false };
}
