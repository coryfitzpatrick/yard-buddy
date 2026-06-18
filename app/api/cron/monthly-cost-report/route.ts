import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { buildCostReport, DEFAULT_COST_REPORT_RECIPIENT } from "@/lib/cost-report";
import { buildCostReportEmail, resend } from "@/lib/email";

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

  return NextResponse.json({ ok: true, month, rows: report.rows.length });
}
