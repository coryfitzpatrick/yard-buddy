# AI Cost Tracking — Design

> Status: Draft for review · Author: Cory · 2026-06-18

## Goal

Know whether each paying user generates more subscription revenue than they cost
us in Claude API spend, on a per-month basis, with zero ongoing effort.

The decision-driving question is: **"Is every tier (and every individual user)
profitable?"** If the answer is no, we adjust tier limits or pricing.

## Out of scope

- Tracking OpenAI embeddings, OpenWeatherMap calls, Supabase storage, or any
  non-Claude variable cost. These are negligible compared to Claude spend; we
  can add them later by widening the same schema.
- A live admin dashboard. A monthly email report covers the use case.
- Real-time budget enforcement. The existing rate limits already cap blast
  radius; the cost report is for periodic review, not runtime gating.

## High-level shape

1. Wrap every `client.messages.create(...)` call in a thin helper
   `callClaude(opts, ctx)` that writes one row to a new `AiUsageEvent` table
   after each call (success or failure).
2. Compute USD cost at write time from `response.usage` plus a per-model price
   table in `lib/ai/prices.ts`.
3. A new monthly Vercel cron route reads the previous month's events, groups by
   user, joins subscription plan, and emails a margin report to a single
   recipient configured by env var.

## Schema

New Prisma model:

```prisma
model AiUsageEvent {
  id                     String   @id @default(cuid())
  userId                 String?
  feature                String
  model                  String
  inputTokens            Int      @default(0)
  outputTokens           Int      @default(0)
  cacheReadTokens        Int      @default(0)
  cacheCreationTokens    Int      @default(0)
  costUsd                Decimal  @db.Decimal(10, 6)
  success                Boolean  @default(true)
  errorCode              String?
  createdAt              DateTime @default(now())
  user                   User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([createdAt])
}
```

User model gains the inverse: `aiUsageEvents AiUsageEvent[]`.

**Why these choices:**

- `userId` is nullable + `onDelete: SetNull` so a deleted user's history
  survives. We still need the historical cost number for accounting even after
  the account is gone.
- `Decimal(10, 6)` for cost — float drift accumulates across thousands of rows;
  the column holds up to $9999.999999 per row which is many orders of magnitude
  above any single call.
- `feature` is a plain string, not an enum, so adding a new feature tag never
  needs a migration. Allowed values are documented in the wrapper.
- The two indexes cover the only two queries we need: "events for a user in
  a date range" (the report) and "events in a date range" (the cron job
  fetching the previous month's rows).

## Wrapper API

New file `lib/ai/usage.ts`:

```ts
export type AiFeature =
  | "analyze"
  | "identify-grass"
  | "recommendations"
  | "watering"
  | "critique"
  | "overdue-assessor";

export type AiCallCtx = { userId: string | null; feature: AiFeature };

export async function callClaude(
  params: Omit<Anthropic.MessageCreateParams, "stream"> & { stream?: false },
  ctx: AiCallCtx,
): Promise<Anthropic.Message> {
  try {
    const response = await client.messages.create(params);
    await recordUsage({
      ...ctx,
      model: response.model,
      usage: response.usage,
      success: true,
    });
    return response;
  } catch (err) {
    await recordUsage({
      ...ctx,
      model: typeof params.model === "string" ? params.model : "unknown",
      usage: null,
      success: false,
      errorCode: extractErrorCode(err),
    });
    throw err;
  }
}
```

- `recordUsage()` does the DB write inside its own try/catch and `console.warn`s
  on failure. The wrapper `await`s the write before returning so cost events
  are not lost when the Vercel serverless / Edge runtime freezes the handler
  the moment a response is sent. A single indexed `INSERT` adds tens of
  milliseconds at most — invisible against a 20-40s analyze call — and the
  inner try/catch still guarantees the user's request never fails because
  logging failed.
- The `params` type omits the `stream` field. The SDK returns a `Stream` when
  it's `true`, which would invalidate the `as Message` cast. None of our call
  sites stream; if that ever changes, the wrapper signature needs widening
  deliberately.
- The wrapper re-throws Anthropic errors so existing call-site error handling
  (`invalid_photos`, `analysis_failed`, etc.) is unchanged.
- Failed calls produce a row with `success: false`, zeros for token counts (or
  the SDK's reported counts if available), and `errorCode` derived from
  `err.status` / `err.error?.type`.

## Price table

New file `lib/ai/prices.ts`:

```ts
// USD per 1M tokens. Update when Anthropic changes prices.
export const AI_PRICES_USD_PER_MTOK: Record<string, {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}> = {
  "claude-sonnet-4-6":         { input: 3, output: 15, cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-haiku-4-5-20251001": { input: 1, output:  5, cacheRead: 0.10, cacheCreation: 1.25 },
};

export function computeCostUsd(
  model: string,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
): number {
  // Fall back to Sonnet pricing for unknown models. Over-estimating is the
  // safer side - if a new model is in flight we'd rather over-charge ourselves
  // than under-count and call something profitable that isn't.
  const p = AI_PRICES_USD_PER_MTOK[model]
    ?? AI_PRICES_USD_PER_MTOK["claude-sonnet-4-6"];
  return (
    (usage.input_tokens             ?? 0) * p.input +
    (usage.output_tokens            ?? 0) * p.output +
    (usage.cache_read_input_tokens  ?? 0) * p.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheCreation
  ) / 1_000_000;
}
```

Unknown models also emit a `console.warn` so we notice the price table is
stale.

## Call sites to instrument

| File | Feature tag | userId source |
|---|---|---|
| `app/api/analyze/route.ts` → `analyzeImages*` in `lib/claude.ts` | `analyze` | `session.user.id` from route, threaded through |
| `app/api/identify-grass/route.ts` | `identify-grass` | `session.user.id` |
| `app/api/recommendations/route.ts` → `lib/claude.ts:501` | `recommendations` | `session.user.id` |
| Watering call (`lib/claude.ts:585`) | `watering` | `session.user.id` |
| Critique helper (`lib/claude.ts:339`) | `critique` | caller (`analyzeImages*`) passes its `ctx.userId` along |
| Revise helper (`lib/claude.ts:620`) | `critique` | same |
| `lib/cron/overdue-assessor.ts:35` | `overdue-assessor` | cron loops per user; pass that user's id |

The `analyzeImages*` and critique/revise helpers gain an extra
`ctx: AiCallCtx` parameter so the wrapper has the userId/feature without
re-deriving it. Critique/revise calls keep `feature: "critique"` even though
they're triggered during an analyze flow — keeping them separate makes it
possible to ask "what does the critique pass actually cost us" and decide
whether the quality gain is worth it.

## Monthly cron + email

### Pure core

New file `lib/cost-report.ts`:

```ts
export interface UserCostRow {
  userId: string;
  email: string;
  plan: string;
  calls: number;
  costUsd: number;
  revenueUsd: number;
  marginUsd: number;
  marginPct: number; // marginUsd / revenueUsd; 0 when revenueUsd === 0
}

export interface CostReport {
  month: string;            // "YYYY-MM"
  rows: UserCostRow[];      // sorted by marginUsd ascending (worst first)
  totals: {
    costUsd: number;
    revenueUsd: number;
    netUsd: number;
    usersUnderwater: number;
  };
}

export async function buildCostReport(month: string): Promise<CostReport>;
```

- Plan revenue lookup is a const map in the same file (mirrors `STRIPE_PRICES`):
  `trial=0`, `admin=0`, `home_basic`, `home_plus`, `professional` with their
  monthly USD prices.
- The function is pure aside from one Prisma read; testable with a fixture
  test that stubs the Prisma call.

### Cron route

New file `app/api/cron/monthly-cost-report/route.ts`:

- Same auth gate as `/api/cron/daily` (timing-safe compare against
  `CRON_SECRET`).
- Computes the previous month (`YYYY-MM`) in UTC.
- Calls `buildCostReport(prevMonth)`.
- Calls a new `buildCostReportEmail(report)` in `lib/email.ts` that returns
  `{ subject, html }` matching the look-and-feel of `buildDigestEmail`.
- Sends via `resend.emails.send({ to: process.env.COST_REPORT_RECIPIENT, ... })`.
- Returns `{ ok: true, month, rows: report.rows.length }`.

### Schedule

Add to `vercel.json`:

```json
{
  "path": "/api/cron/monthly-cost-report",
  "schedule": "0 8 1 * *"
}
```

08:00 UTC on the 1st of every month, mirroring the daily cron's hour. Covers
the month that just ended.

### Configuration

- `COST_REPORT_RECIPIENT` env var, defaulting to `yardanalyzer@gmail.com` when
  unset so a fresh deployment isn't silently broken. The default lives in
  `lib/cost-report.ts` as `DEFAULT_COST_REPORT_RECIPIENT`.

### Email shape

Plain HTML table, sorted worst margin first, with summary line at the top:

```
Subject: Cost report — May 2026

Net margin: -$12.40   (Revenue $39.96   Cost $52.36)
Users underwater: 2 of 12

| Email                        | Plan        | Calls | Cost    | Rev    | Margin   |
| alice@example.com            | home_plus   |   127 | $14.21  | $9.99  | -$4.22   |
| bob@example.com              | home_basic  |    48 |  $2.89  | $4.99  |  $2.10   |
| ...                                                                        |
```

If no events exist for the month the email still sends with a "no events"
message so we know the cron is alive.

## Failure modes

- **DB write fails in `recordUsage`**: swallowed, `console.warn`. The user's
  API request continues uninterrupted. Means we lose one cost row, not the
  whole call.
- **Anthropic call fails**: re-thrown after writing a `success: false` row.
  Existing call-site error handling is unchanged.
- **Cron route fails to send email**: returns 500 so Vercel's cron retry +
  alerting kicks in. The previous month's data is still in the DB so the email
  can be regenerated on next attempt or by manual re-trigger.
- **Unknown model**: priced as Sonnet (the more expensive of our two), warn to
  console. Over-estimating margin loss is safer than under-estimating it.
- **`COST_REPORT_RECIPIENT` env unset**: defaults to `yardanalyzer@gmail.com`.

## Testing

- `lib/ai/__tests__/prices.test.ts` — `computeCostUsd` for known models, zero
  tokens, cache-only, output-only, unknown-model fallback.
- `lib/ai/__tests__/usage.test.ts` — mocks Anthropic client:
  - success path writes a row with the right fields and returns the response
  - error path writes `success: false` + `errorCode`, re-throws the original
    error
  - `recordUsage` throwing a DB error doesn't bubble to the caller
- `lib/__tests__/cost-report.test.ts` — fixture rows fed into the grouping +
  margin math; verifies sort order (worst margin first), revenue lookup per
  plan, totals, and the "no events" empty case.
- `lib/__tests__/cost-report-email.test.ts` — snapshot the subject + a
  fragment of the HTML for one fixture report so format regressions show up
  in CI.

## Migration / rollout

1. Prisma migration `add_ai_usage_event` adds the new model.
2. Wrapper + price table land first, with one call site (`analyze`) converted
   as a smoke test.
3. Remaining six call sites convert in a single follow-up commit.
4. Cron route + email template land last, behind the existing
   `CRON_SECRET` gate; first scheduled run is the 1st of the following month.
5. No backfill — we only know the cost of calls instrumented after the change.
   The first month's report will under-represent total spend; subsequent
   months are accurate.
