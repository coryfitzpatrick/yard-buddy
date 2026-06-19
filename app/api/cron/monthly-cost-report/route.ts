import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { buildCostReport, DEFAULT_COST_REPORT_RECIPIENT } from "@/lib/cost-report";
import { buildCostReportEmail, resend } from "@/lib/email";
import { db } from "@/lib/db";

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const provided = authHeader ?? "";
  const tokensMatch =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!tokensMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = previousMonth(new Date());

  let report;
  try {
    report = await buildCostReport(month);
  } catch (err) {
    console.error("monthly-cost-report: buildCostReport failed", { month, err });
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
    console.error("monthly-cost-report: resend send failed", { month, to, err });
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
    console.error("monthly-cost-report: purge failed", { month, cutoff, err });
    // Email already sent — return success but flag the purge failure for ops.
    return NextResponse.json({ ok: true, month, rows: report.rows.length, purged: 0, purgeError: true });
  }

  return NextResponse.json({ ok: true, month, rows: report.rows.length, purged });
}
