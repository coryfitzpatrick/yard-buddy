# Axiom setup & verification (one-time)

## Setup

1. Sign in to Axiom (https://app.axiom.co/), create or open the workspace.
2. Create a dataset named exactly `yard-analyzer`.
3. Settings, API tokens, create an ingest token scoped to the `yard-analyzer` dataset.
4. Save the token as `AXIOM_TOKEN` on Vercel for **Production, Preview, and Development** environments.
5. Add the same token to `.env.local` for local Axiom emission (optional, since local dev defaults to console-only).
6. (Optional) Set `AXIOM_DATASET=yard-analyzer` if you want it explicit; the code defaults to that value if unset.

## Dashboard

Recreate the 5 charts from `ops/axiom-dashboard.json` in the Axiom UI:

- Cron health (last 7 days), table
- AI cost, daily totals, timeseries
- AI cost, top 10 users (last 7d), table
- Rate-limit hits by route (last 24h), bar
- Errors (last 1h), table

All charts filter on `env == 'production'`.

> **Field path note:** if APL queries return no data, the formatter may be nesting fields under `fields.*`. Try `fields.kind == 'cron.run'` instead of `kind == 'cron.run'`. Check the raw event in Axiom's stream view first; whatever path the fields actually live at is the path to use everywhere.

## Alerts (Monitors)

Three day-one monitors, all with destination = email `yardanalyzer@gmail.com`.

### Monitor 1: Cron failed

```apl
['yard-analyzer']
| where env == 'production' and kind == 'cron.run' and ok == false
| summarize count() by bin(_time, 15m), route
```

Trigger: any result row in the last 15 minutes.

### Monitor 2: AI failure rate high

```apl
['yard-analyzer']
| where env == 'production' and kind == 'ai.call' and _time > ago(15m)
| summarize total = count(), failures = countif(success == false)
| extend rate = todouble(failures) / todouble(total)
| where total >= 10 and rate > 0.05
```

Trigger: any result row in the last 15 minutes. The `total >= 10` clause prevents false positives at low volume.

### Monitor 3: AI daily summary absent

```apl
['yard-analyzer']
| where env == 'production' and kind == 'ai.daily_summary'
| summarize last_event = max(_time)
| where last_event < ago(36h) or isnull(last_event)
```

Trigger: any result row. The 36h window covers a missed 8:00 UTC cron run plus a 12h grace period, so a one-day outage does not false-alarm; only a sustained gap pages. This monitor exists because the daily-tasks cron fires `emitYesterdaysAiSummary` in a fire-and-forget try/catch. A silent failure there would not flip `cron.run.ok` to false, so without this monitor AI cost telemetry could stop flowing for weeks without notice.

## Verification (run after first deploy)

- [ ] Manually trigger a cron route with curl:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/trial-reminders
  ```
  Expect: `200` response, `kind: "cron.run"` event in Axiom within ~5 seconds, tagged `env: "production"`.

- [ ] Hit a rate-limited endpoint in a loop:
  ```bash
  for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/api/auth/register -X POST -H "Content-Type: application/json" -d '{}'; done
  ```
  Expect: first 5 return validation errors (or 429 after limit), one or more `kind: "rate_limit.hit"` events in Axiom.

- [ ] On a preview branch, break the ANTHROPIC_API_KEY:
  ```
  vercel env add ANTHROPIC_API_KEY preview <<< "invalid-key"
  ```
  Hit `/api/analyze`. Expect: `kind: "ai.call"` event with `reason: "failure"`, tagged `env: "preview"`. The "AI failure rate high" monitor should **not** fire (filter is `env == 'production'`).

- [ ] Watch the first 8:00 UTC daily-tasks run after deploy. Confirm:
  - `kind: "cron.run"` event with `ok: true`
  - `kind: "ai.daily_summary"` event for yesterday's date
