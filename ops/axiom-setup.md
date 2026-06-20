# Axiom setup & verification (one-time)

## Setup

1. Sign in to Axiom (https://app.axiom.co/), create or open the workspace.
2. Create a dataset named exactly `yard-analyzer`.
3. Settings, API tokens, create an ingest token scoped to the `yard-analyzer` dataset.
4. Save the token as `AXIOM_TOKEN` on Vercel for **Production, Preview, and Development** environments.
5. Add the same token to `.env.local` for local Axiom emission (optional, since local dev defaults to console-only).
6. (Optional) Set `AXIOM_DATASET=yard-analyzer` if you want it explicit; the code defaults to that value if unset.

## Field shape (important)

Axiom's `nextJsFormatters` flattens payload keys with literal dots. When the code calls `logger.info("cron.run", { kind: "cron.run", ok: true, ... })`, events land as:

- Top-level fields: `_time`, `message` (= `"cron.run"`), `level` (= `"info"`), `source`
- Flattened payload fields with dots in the name: `fields.env`, `fields.service`, `fields.version`, `fields.kind`, `fields.ok`, `fields.route`, `fields.durationMs`, etc.
- Auto-added by withAxiom: `request.endTime`, `request.host`, `request.ip`, `request.method`, `request.path`, etc.

APL needs the bracket-quote escape for dotted field names: `['fields.env']`. Top-level fields like `level`, `message`, `source` need no escaping.

**Useful shortcut for `kind`:** the first arg to `logger.info/warn/error` becomes the top-level `message` field. So `where message == 'cron.run'` is cleaner than `where ['fields.kind'] == 'cron.run'`.

**Useful shortcut for `ok` and `success`:** our emitters route on these via log level. `emitCronRun` calls `logger.error` when `ok: false` and `logger.info` when `ok: true`. `emitAiCall` calls `logger.error` when `success: false` and `logger.warn` when `success: true` and expensive. So `where level == 'error'` is equivalent to `where ['fields.ok'] == false` (for cron events) or `where ['fields.success'] == false` (for ai.call events). Prefer the `level` form when creating monitors because Axiom validates field existence at creation time and `level` is always present, while payload fields only exist after the first matching event has been ingested.

## Dashboard

Recreate the 5 charts from `ops/axiom-dashboard.json` in the Axiom UI. The committed JSON has the up-to-date APL queries with correct field paths. Chart types:

- Cron health (last 7 days), **table**
- AI cost, daily totals, **time series**
- AI cost, top 10 users (last 7d), **table**
- Rate-limit hits by route (last 24h), **time series** (multiple series, one per route, binned by 1h)
- Errors (last 1h), **table**

All charts filter on `['fields.env'] == 'production'`.

## Alerts (Monitors)

Three day-one monitors, all with destination = email `yardanalyzer@gmail.com`.

### Monitor 1: Cron failed

Type: **Match monitor**. Fires when any row matches the query.

```apl
['yard-analyzer']
| where ['fields.env'] == 'production' and message == 'cron.run' and level == 'error'
```

Uses `level == 'error'` rather than `['fields.ok'] == false` so the query passes validation at creation time even before the first cron failure has happened.

### Monitor 2: AI failure rate high

Type: **Threshold monitor**.

```apl
['yard-analyzer']
| where ['fields.env'] == 'production' and message == 'ai.call' and _time > ago(15m)
| summarize total = count(), failures = countif(level == 'error')
| extend rate = todouble(failures) / todouble(total)
| where total >= 10
| project rate
```

Form fields:
- Operator: `Above`
- Threshold: `0.05`
- Run interval: `15 minutes`
- Range / lookback: `15 minutes`

The `total >= 10` clause prevents false positives at low volume (one failure out of one call would otherwise be 100%).

### Monitor 3: AI daily summary absent

Type: **Threshold monitor**.

```apl
['yard-analyzer']
| where ['fields.env'] == 'production' and message == 'ai.daily_summary' and _time > ago(36h)
| count
```

Form fields:
- Operator: `Below`
- Threshold: `1`
- Run interval: `1 hour`
- Range / lookback: `36 hours`

The 36h window covers a missed 8:00 UTC cron run plus a 12h grace period, so a one-day outage does not false-alarm; only a sustained gap pages. This monitor exists because the daily-tasks cron fires `emitYesterdaysAiSummary` in a fire-and-forget try/catch. A silent failure there would not flip `cron.run.ok` to false, so without this monitor AI cost telemetry could stop flowing for weeks without notice.

## Verification (run after first deploy)

- [ ] Manually trigger a cron route. Easiest: Vercel dashboard, Settings, Cron Jobs, click Run on `/api/cron/trial-reminders` (Pro plan only). Or curl with the secret:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/trial-reminders
  ```
  Expect: `200` response, a `cron.run` event in Axiom Stream within ~5 seconds, tagged `fields.env: "production"`.

- [ ] Hit a rate-limited endpoint in a loop:
  ```bash
  for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/api/auth/forgot-password -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}'; done
  ```
  Expect: first 5 return 200, then 429 once the limit hits. One or more `rate_limit.hit` events in Axiom.

- [ ] On a preview branch, break the ANTHROPIC_API_KEY:
  ```
  vercel env add ANTHROPIC_API_KEY preview <<< "invalid-key"
  ```
  Hit `/api/analyze`. Expect: an `ai.call` event with `fields.reason: "failure"`, tagged `fields.env: "preview"`. The "AI failure rate high" monitor should **not** fire (filter is `['fields.env'] == 'production'`).

- [ ] Watch the first 8:00 UTC daily-tasks run after deploy. Confirm:
  - A `cron.run` event with `fields.ok: true` (or `level: "info"`)
  - An `ai.daily_summary` event for yesterday's date
