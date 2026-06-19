import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextRequest } from "next/server";

export function getClientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || "unknown";
}

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  redis = Redis.fromEnv();
  return redis;
}

const limiterCache = new Map<string, Ratelimit>();
function getLimiter(maxAttempts: number, windowMs: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const cacheKey = `${maxAttempts}:${windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(maxAttempts, `${windowMs} ms`),
    analytics: false,
    prefix: "ratelimit",
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

// In-memory fallback for environments without Upstash configured (tests + any
// dev setup that hasn't pulled the env vars). Same sliding-window semantics as
// the Upstash path so behavior stays consistent.
const memoryStore = new Map<string, number[]>();

function memoryCheck(key: string, maxAttempts: number, windowMs: number): { limited: boolean } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = memoryStore.get(key) ?? [];
  const recent = existing.filter((ts) => ts >= windowStart);
  if (recent.length >= maxAttempts) {
    memoryStore.set(key, recent);
    return { limited: true };
  }
  recent.push(now);
  memoryStore.set(key, recent);
  return { limited: false };
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<{ limited: boolean }> {
  const limiter = getLimiter(maxAttempts, windowMs);
  if (!limiter) {
    return memoryCheck(key, maxAttempts, windowMs);
  }
  const { success } = await limiter.limit(key);
  return { limited: !success };
}
