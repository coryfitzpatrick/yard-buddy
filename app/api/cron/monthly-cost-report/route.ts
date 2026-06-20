import { NextRequest, NextResponse } from "next/server";
import { buildCostReport, DEFAULT_COST_REPORT_RECIPIENT } from "@/lib/cost-report";
import { buildCostReportEmail, resend } from "@/lib/email";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";

// Rolling window — keep the reported month plus the two prior months for
// ad-hoc lookbacks, plus the in-progress current month that's still being
// written to. Everything older gets purged after the email succeeds.
const RETAIN_MONTHS = 3;

function previousMonth(now: Date): string {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const month = previousMonth(new Date());

  let report;
  try {
    report = await buildCostReport(month);
  } catch (err) {
    logger.error("monthly-cost-report: buildCostReport failed", {
      month,
      err: err instanceof Error ? err.message : String(err),
    });
    emitCronRun({
      route: "monthly-cost-report",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { month: Number(month.replace("-", "")) },
      error: { message: "buildCostReport failed", code: "build" },
    });
    return NextResponse.json({ ok: false, month, stage: "build" }, { status: 500 });
  }

  const { subject, html } = buildCostReportEmail(report);
  const to = process.env.COST_REPORT_RECIPIENT ?? DEFAULT_COST_REPORT_RECIPIENT;

  try {
    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.com>",
      to,
      subject,
      html,
    });
  } catch (err) {
    logger.error("monthly-cost-report: resend send failed", {
      month,
      to,
      err: err instanceof Error ? err.message : String(err),
    });
    emitCronRun({
      route: "monthly-cost-report",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { rows: report.rows.length },
      error: { message: "resend send failed", code: "send" },
    });
    return NextResponse.json({ ok: false, month, stage: "send" }, { status: 500 });
  }

  // Purge AiUsageEvent rows older than the rolling window. Runs only after a
  // successful email send so a failed report doesn't lose the data needed for
  // the retry. The cutoff is the start of (reported month − RETAIN_MONTHS + 1):
  // we keep the reported month and the prior two, so a May report keeps Mar–May.
  const [yearStr, monthStr] = month.split("-");
  const cutoff = new Date(Date.UTC(Number(yearStr), Number(monthStr) - RETAIN_MONTHS, 1));
  let purged = 0;
  try {
    const result = await db.aiUsageEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    purged = result.count;
  } catch (err) {
    logger.error("monthly-cost-report: purge failed", {
      month,
      cutoff: cutoff.toISOString(),
      err: err instanceof Error ? err.message : String(err),
    });
    // Email already sent — return success but flag the purge failure for ops.
    emitCronRun({
      route: "monthly-cost-report",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { rows: report.rows.length, purged: 0, purgeError: 1 },
    });
    return NextResponse.json({ ok: true, month, rows: report.rows.length, purged: 0, purgeError: true });
  }

  emitCronRun({
    route: "monthly-cost-report",
    ok: true,
    durationMs: Date.now() - startedAt,
    counts: { rows: report.rows.length, purged },
  });
  return NextResponse.json({ ok: true, month, rows: report.rows.length, purged });
});
