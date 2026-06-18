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
  const report = await buildCostReport(month);
  const { subject, html } = buildCostReportEmail(report);
  const to = process.env.COST_REPORT_RECIPIENT ?? DEFAULT_COST_REPORT_RECIPIENT;

  await resend.emails.send({
    from: "Yard Analyzer <noreply@yardanalyzer.com>",
    to,
    subject,
    html,
  });

  return NextResponse.json({ ok: true, month, rows: report.rows.length });
}
