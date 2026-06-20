# Observability — Axiom integration (design)

**Date:** 2026-06-20
**Status:** Draft, awaiting implementation plan
**Author:** brainstorming session, Claude + Cory

---

## Goal

Wire a single structured logging + event pipeline (Axiom) into Yard Analyzer so production problems surface as alerts before they surface as customer complaints. Scope is *holistic* — not just the three originally-requested signals, but the full error backbone: every code path that currently writes to `console.error` (or that silently swallows an exception) ships a structured event to Axiom in production.

The three originally-named signals — cron run summaries, rate-limit hits, AI cost outliers — are first-class typed events with their own schema. Everything else flows through a free-form `logger.{info,warn,error}` surface.

## Non-goals

- Per-request log lines for every API call. `withAxiom` captures unhandled exceptions, not normal request flow.
- Business-event analytics (signups, plan changes, churn). Out of scope; revisit once the error backbone is stable.
- A multi-dataset Axiom layout. Single dataset (`yard-analyzer`), filtered by `kind` / `level` / `env` fields.
- Replacing the existing `AiUsageEvent` Postgres table. Postgres remains the source of truth for billing/margin; Axiom mirrors only failures and outliers.

## Decisions made during brainstorming

| # | Question | Decision |
|---|---|---|
| 1 | Scope | **B** — three named signals + structured logger replacing all critical `console.error` calls (error backbone). |
| 2 | AI cost event volume | **B** — emit only on failure or when expensive (cost > $0.05 OR input > 50K tokens). Daily summary event covers everything else. |
| 3 | Alert destination | **A** — email only to `yardanalyzer@gmail.com`. |
| 4 | Alert conditions | **A** — two day-one alerts only: any cron failure, AI failure rate >5% over 15 min (min 10 calls). |
| 5 | Architectural shape | **Approach 1** — `withAxiom` everywhere + typed event emitters + free-form logger. |

## Architecture

### Module layout

```
lib/observability/
├── client.ts           single Axiom client (reads AXIOM_TOKEN)
├── logger.ts           Logger + AxiomJSTransport + nextJsFormatters
│                       exports `logger` and `withAxiom = createAxiomRouteHandler(logger)`
├── events.ts           typed emitters wrapping `logger`:
│                       emitCronRun, emitRateLimitHit, emitAiCall, emitAiDailySummary
├── redact.ts           sha256-prefix hashes for emails/IPs; userIds pass through
└── __tests__/
    ├── events.test.ts  schema invariants + redaction
    └── logger.test.ts  env-routing matrix (prod→Axiom, dev→console, test→no-op)
```

### Boundaries

- Callers never import `client.ts` directly. They import `logger` (free-form) or `events.emitX(...)` (typed).
- `withAxiom` from `logger.ts` is the only blessed way to define new route handlers.
- `redact.ts` is the single chokepoint for "is this PII safe?"
  - `email → sha256(email)[0..8]`
  - `ip → sha256(ip)[0..8]`
  - `userId → unchanged` (already a stable, non-PII internal identifier)

### Package dependency

`@axiomhq/js` and `@axiomhq/nextjs` are already installed. Add `@axiomhq/logging` as a direct dependency — it exports `Logger`, `AxiomJSTransport`, `ConsoleTransport`, and the `Transport` interface used by the no-op test transport. It comes in transitively today but the spec imports from it directly.

### Environment variables

- `AXIOM_TOKEN` — Axiom ingest token. Set on Vercel (Production, Preview, Development) and `.env.local`.
- `AXIOM_DATASET` — defaults to `"yard-analyzer"` if unset.

If `AXIOM_TOKEN` is missing, the logger degrades to `ConsoleTransport` and emits a single `console.warn` on first use. App keeps running. This prevents a misconfigured Vercel preview or a new dev's first `npm run dev` from breaking every route.

## Event taxonomy

Every event carries three common fields (set by `nextJsFormatters` + logger default scope):

- `env` — `production` | `preview` | `development`
- `service` — `yard-analyzer`
- `version` — `VERCEL_GIT_COMMIT_SHA[0..7]` when present

### `cron.run`

Emitted at the end of each cron route execution (success or failure).

```ts
{
  kind: "cron.run",
  route: "daily-tasks" | "trial-reminders" | "account-deletion" | "card-expiry" | "monthly-cost-report",
  ok: boolean,
  durationMs: number,
  counts: Record<string, number>,    // route-defined: yards, emailsSent, errors, ...
  error?: { message: string, code?: string, stack?: string },   // present iff !ok
  level: ok ? "info" : "error",
}
```

The `level: "error"` flag is what the cron-failure alert filter keys off.

### `rate_limit.hit`

Emitted only when `checkRateLimit(...)` returns `limited: true`.

```ts
{
  kind: "rate_limit.hit",
  route: string,             // e.g. "/api/analyze", "/api/auth/register"
  ipHash: string,            // sha256(ip)[0..8]
  userIdHash?: string,       // sha256(userId)[0..8] if authenticated
  limit: { maxAttempts: number, windowMs: number },
  level: "warn",
}
```

The existing `checkRateLimit(key, maxAttempts, windowMs)` signature gains a `route: string` parameter so the event can carry it. ~10 caller updates, hardcoded strings.

### `ai.call`

Emitted on failure OR when the call exceeds either threshold below.

```ts
{
  kind: "ai.call",
  userId: string | null,
  feature: AiFeature,
  model: string,
  success: boolean,
  costUsd: number,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  errorCode?: string,
  reason: "failure" | "expensive",
  level: success ? "warn" : "error",
}
```

Expensive thresholds:
- `costUsd > 0.05` OR
- `inputTokens > 50_000`

Tunable via `AI_EVENT_COST_THRESHOLD_USD` / `AI_EVENT_INPUT_TOKEN_THRESHOLD` env vars; defaults baked in.

### `ai.daily_summary`

Emitted once per day at the start of the `daily-tasks` cron (the first scheduled run at 8:00 UTC).

```ts
{
  kind: "ai.daily_summary",
  date: "YYYY-MM-DD",                // yesterday UTC
  totals: { calls: number, failures: number, costUsd: number },
  byFeature: Record<AiFeature, { calls: number, costUsd: number }>,
  topUsers: Array<{ userId: string, calls: number, costUsd: number }>,    // top 10 by costUsd
  level: "info",
}
```

One Postgres aggregate query on `AiUsageEvent` for yesterday's window. ~50ms. No new cron entry — tacked onto the existing `daily-tasks` route to keep `vercel.json` lean.

### Volume estimate

With everything wired in production:
- ~5 `cron.run`/day
- ~20-200 `rate_limit.hit`/day (mostly auth-bot floor)
- ~10-100 `ai.call`/day (failures + outliers only)
- 1 `ai.daily_summary`/day
- Free-form `logger.error` for unhandled exceptions: low single digits per day on a healthy build

Fits easily in Axiom's 0.5 GB/day free tier.

## Migrating existing `console.*` calls

### Policy

- `console.error(...)` → `logger.error("message", { ...fields })`
- `console.warn(...)` → `logger.warn(...)`
- `console.log(...)` → `logger.info(...)` (or delete if debug cruft)
- Inside a `withAxiom`-wrapped route, **throwing is automatically captured**. Only catch + log when the caller intends to recover (e.g. one bad yard inside a per-yard loop).

### Files touched

Cron routes (all 5):
- `app/api/cron/daily-tasks/route.ts` — wrap, replace logging, emit `cron.run`, emit `ai.daily_summary` at start
- `app/api/cron/trial-reminders/route.ts` — wrap, replace, emit `cron.run`
- `app/api/cron/account-deletion/route.ts` — wrap, replace, emit `cron.run`
- `app/api/cron/card-expiry/route.ts` — wrap, replace, emit `cron.run`
- `app/api/cron/monthly-cost-report/route.ts` — wrap, replace 3 failure-mode logs, emit `cron.run`

Library helpers:
- `lib/cron/overdue-assessor.ts` — `console.error` → `logger.error`
- `lib/ai/usage.ts` — gains `events.emitAiCall(...)` calls inside `callClaude` on failure and on expensive calls; `recordUsage`'s DB-write failure stays caught and uses `logger.error`
- `lib/ai/prices.ts` — `console.error` → `logger.error`
- `lib/rate-limit.ts` — `checkRateLimit` gains a `route` parameter, emits `rate_limit.hit` on `limited: true`

API routes:
- All API routes (`/api/analyze`, `/api/auth/*`, `/api/upload`, `/api/weather`, `/api/identify-grass`, `/api/recommendations`, `/api/lookup-yard-size`, `/api/validate-zip`) wrapped with `withAxiom`. Most have minimal explicit logging today; the wrapper picks up uncaught exceptions automatically.
- Existing intentional `console.*` calls migrate one-for-one.

## Environment behavior

| Environment | Detection | Transport | Notes |
|---|---|---|---|
| Production | `VERCEL_ENV === "production"` | `AxiomJSTransport` only | Real signals, no console noise in `vercel logs` |
| Preview | `VERCEL_ENV === "preview"` | `AxiomJSTransport` + `ConsoleTransport` | Tagged `env: "preview"`; useful for PR-branch debugging |
| Local dev | `NODE_ENV === "development"` | `ConsoleTransport` only | No Axiom writes from laptops |
| Test (vitest) | `NODE_ENV === "test"` | No-op transport | Mock the transport when asserting log calls |

`__tests__/logger.test.ts` asserts the env-routing matrix as a regression guard.

Dashboards and alerts filter on `env: "production"` so preview noise stays out of production graphs.

## Axiom dashboards & alerts (post-deploy click-ops)

### One dashboard, four panels

1. **Cron health.** Table of last 7 days × 5 routes. `kind: "cron.run" | env: "production"`. Green if `ok: true`, red if not. `durationMs` p50/p95 on hover.
2. **AI cost.** Two charts:
   - Daily totals time-series from `kind: "ai.daily_summary"` (totalCostUsd, totalFailures).
   - Top 10 users by `costUsd`, last 7 days, from `ai.daily_summary.topUsers[]`.
3. **Rate-limit hits.** Bar chart: `count_by(kind: "rate_limit.hit", route)` last 24h.
4. **Errors.** Recent log lines where `level: "error" | env: "production"`, grouped by route.

### Two day-one monitors → email `yardanalyzer@gmail.com`

| Monitor | Query | Trigger |
|---|---|---|
| Cron failed | `kind: "cron.run" \| ok: false \| env: "production"` | Any match in last 15 min |
| AI failure rate high | `count(kind: "ai.call" \| reason: "failure") / count(kind: "ai.call") > 0.05` over 15 min | Threshold + min 10-call floor |

Deferred to day-2 (after baseline volumes are visible): 5xx burst, rate-limit-spike, cost-spike.

### Setup checklist

```
1. Axiom account → create dataset "yard-analyzer"
2. Generate ingest token → save as AXIOM_TOKEN on Vercel (Production, Preview, Development) + .env.local
3. Import dashboard JSON (committed at ops/axiom-dashboard.json)
4. Create the 2 monitors above, destination = email yardanalyzer@gmail.com
5. Verify: manually trigger a cron (curl + bearer), confirm cron.run lands in Axiom
6. Verify: hit a rate-limited endpoint in a loop, confirm rate_limit.hit lands
7. Verify: break ANTHROPIC_API_KEY on a preview branch, hit /api/analyze, confirm error event lands in Axiom tagged env: "preview" and the cron alert does NOT fire (env filter check)
```

The dashboard JSON is committed under `ops/` so it's reproducible. Monitor config stays click-ops because Axiom's monitor-as-code story is still rough.

## Testing strategy

- `events.test.ts` — schema invariants (every emitter produces a payload with required fields), redaction (hashing length + determinism), threshold logic for `ai.call` expensive-classification.
- `logger.test.ts` — env-routing matrix; mocks `AxiomJSTransport` to assert it is/isn't called per env.
- Existing `lib/__tests__/rate-limit.test.ts` updated to assert `emitRateLimitHit` is called on `limited: true` (mock the emitter).
- No live Axiom calls in CI. Tests use the no-op transport.

## Rollout

1. Land all code in a single PR (or stacked PRs by file group if it gets large). Verify CI green.
2. Deploy to a preview branch. Set `AXIOM_TOKEN` on Vercel for Preview only. Run verification steps 5-7 of the setup checklist against the preview.
3. Once preview events look correct, set `AXIOM_TOKEN` on Production and merge.
4. Watch first daily cron run (8:00 UTC next day). Confirm `cron.run` and `ai.daily_summary` events arrive.
5. After 1 week of baseline data, revisit the deferred alerts (5xx burst, rate-limit spike, cost spike) with real thresholds.

## Risks & mitigations

- **Axiom rate-limits ingest.** Mitigated by event-volume estimate (well under free tier) and threshold-gating on AI events. If we ever hit ingest limits, the SDK queues and retries; worst case is dropped events, not user-facing errors.
- **`withAxiom` wrapping subtly changes route behavior.** Mitigated by `verifyCronAuth` still being called inside the handler (no auth bypass) and by the env-routing matrix tests. Verification step 5 confirms end-to-end.
- **PII leak via free-form `logger.error` payloads.** Mitigated by the `redact.ts` helper and a code-review checklist item: "no email/IP fields in logger calls; use `redact.hashEmail(...)` / `redact.hashIp(...)`."
- **Solo-operator alert fatigue.** Mitigated by the day-one alerts being only 2, with min-volume floors. If either fires noisily in week 1, tune up the threshold instead of leaving it disabled.

## Out of scope (explicit)

- OpenTelemetry / vendor-neutral abstraction. Single-vendor (Axiom) is fine for now.
- Browser-side logging. App is mostly server-rendered; client errors can come later if needed.
- Distributed traces. Single-region Fluid Compute deployment doesn't benefit from cross-service tracing today.
- Log retention policy beyond Axiom defaults.
