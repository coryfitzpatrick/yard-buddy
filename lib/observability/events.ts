// lib/observability/events.ts
import { logger, buildEnvScope, type EnvScope } from "./logger";
import { hashEmail, hashIp } from "./redact";

// Common fields included in every typed event payload so events fired outside
// a `withAxiom` route handler (cron startup, library code) still carry the
// env/service/version scope.
function commonFields(): EnvScope {
  return buildEnvScope();
}

export type CronRoute =
  | "daily-tasks"
  | "trial-reminders"
  | "account-deletion"
  | "card-expiry"
  | "monthly-cost-report";

export type AiFeature =
  | "analyze"
  | "identify-grass"
  | "recommendations"
  | "watering"
  | "critique"
  | "overdue-assessor";

interface CronRunArgs {
  route: CronRoute;
  ok: boolean;
  durationMs: number;
  counts: Record<string, number>;
  error?: { message: string; code?: string; stack?: string };
}

export function emitCronRun(args: CronRunArgs): void {
  const payload = {
    ...commonFields(),
    kind: "cron.run" as const,
    route: args.route,
    ok: args.ok,
    durationMs: args.durationMs,
    counts: args.counts,
    ...(args.error ? { error: args.error } : {}),
  };
  if (args.ok) logger.info("cron.run", payload);
  else logger.error("cron.run", payload);
}

interface RateLimitHitArgs {
  route: string;
  ip: string;
  userId: string | null;
  maxAttempts: number;
  windowMs: number;
}

export function emitRateLimitHit(args: RateLimitHitArgs): void {
  const payload: Record<string, unknown> = {
    ...commonFields(),
    kind: "rate_limit.hit",
    route: args.route,
    ipHash: hashIp(args.ip),
    limit: { maxAttempts: args.maxAttempts, windowMs: args.windowMs },
  };
  if (args.userId) {
    // Reuse the email-hash function — same shape, deterministic.
    payload.userIdHash = hashEmail(args.userId);
  }
  logger.warn("rate_limit.hit", payload);
}

const DEFAULT_COST_THRESHOLD = 0.05;
const DEFAULT_INPUT_TOKEN_THRESHOLD = 50_000;

export function isExpensiveCall(args: { costUsd: number; inputTokens: number }): boolean {
  const costThreshold = Number(process.env.AI_EVENT_COST_THRESHOLD_USD ?? DEFAULT_COST_THRESHOLD);
  const tokenThreshold = Number(
    process.env.AI_EVENT_INPUT_TOKEN_THRESHOLD ?? DEFAULT_INPUT_TOKEN_THRESHOLD,
  );
  return args.costUsd > costThreshold || args.inputTokens > tokenThreshold;
}

interface AiCallArgs {
  userId: string | null;
  feature: AiFeature;
  model: string;
  success: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  errorCode?: string;
  reason: "failure" | "expensive";
}

export function emitAiCall(args: AiCallArgs): void {
  const payload = { ...commonFields(), kind: "ai.call" as const, ...args };
  if (!args.success) logger.error("ai.call", payload);
  else logger.warn("ai.call", payload);
}

interface AiDailySummaryArgs {
  date: string;
  totals: { calls: number; failures: number; costUsd: number };
  byFeature: Record<string, { calls: number; costUsd: number }>;
  topUsers: Array<{ userId: string; calls: number; costUsd: number }>;
}

export function emitAiDailySummary(args: AiDailySummaryArgs): void {
  logger.info("ai.daily_summary", { ...commonFields(), kind: "ai.daily_summary", ...args });
}
