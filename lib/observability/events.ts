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

export type RateLimitedRoute =
  | "/api/analyze"
  | "/api/weather"
  | "/api/identify-grass"
  | "/api/recommendations"
  | "/api/upload"
  | "/api/validate-zip"
  | "/api/lookup-yard-size"
  | "/api/auth/register"
  | "/api/auth/forgot-password"
  | "/api/auth/reset-password";

// `cron.run` events use a structured `error` field ({ message, code?, stack? })
// because failure detail is part of the event schema. Free-form `logger.error`
// calls elsewhere in the codebase use `err:` for the same shape. Dashboards
// querying for failure text on cron events should reference `error.message`;
// dashboards querying free-form errors should reference `err` (string). When
// adding a new event kind, prefer `error` for typed failure schema and `err`
// for opaque string-coerced exceptions.
interface CronRunArgs {
  route: CronRoute;
  ok: boolean;
  durationMs: number;
  counts: Record<string, number>;
  error?: { message: string; code?: string; stack?: string };
}

export function emitCronRun(args: CronRunArgs): void {
  const payload = {
    kind: "cron.run",
    route: args.route,
    ok: args.ok,
    durationMs: args.durationMs,
    counts: args.counts,
    ...(args.error ? { error: args.error } : {}),
    ...commonFields(),
  };
  if (args.ok) logger.info("cron.run", payload);
  else logger.error("cron.run", payload);
}

interface RateLimitHitArgs {
  route: RateLimitedRoute;
  ip: string;
  userId: string | null;
  maxAttempts: number;
  windowMs: number;
}

export function emitRateLimitHit(args: RateLimitHitArgs): void {
  const payload = {
    kind: "rate_limit.hit",
    route: args.route,
    ipHash: hashIp(args.ip),
    limit: { maxAttempts: args.maxAttempts, windowMs: args.windowMs },
    ...(args.userId ? { userIdHash: hashEmail(args.userId) } : {}),
    ...commonFields(),
  };
  logger.warn("rate_limit.hit", payload);
}

const DEFAULT_COST_THRESHOLD = 0.05;
const DEFAULT_INPUT_TOKEN_THRESHOLD = 50_000;

function parseThreshold(raw: string | undefined, defaultValue: number): number {
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

export function isExpensiveCall(args: { costUsd: number; inputTokens: number }): boolean {
  const costThreshold = parseThreshold(
    process.env.AI_EVENT_COST_THRESHOLD_USD,
    DEFAULT_COST_THRESHOLD,
  );
  const tokenThreshold = parseThreshold(
    process.env.AI_EVENT_INPUT_TOKEN_THRESHOLD,
    DEFAULT_INPUT_TOKEN_THRESHOLD,
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
  const payload = { ...args, kind: "ai.call", ...commonFields() };
  if (!args.success) logger.error("ai.call", payload);
  else logger.warn("ai.call", payload);
}

export interface AiDailySummary {
  date: string;
  totals: { calls: number; failures: number; costUsd: number };
  byFeature: Record<string, { calls: number; costUsd: number }>;
  topUsers: Array<{ userId: string; calls: number; costUsd: number }>;
}

export function emitAiDailySummary(args: AiDailySummary): void {
  const payload = { ...args, kind: "ai.daily_summary", ...commonFields() };
  logger.info("ai.daily_summary", payload);
}
