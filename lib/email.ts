import { Resend } from "resend";
import crypto from "crypto";

export const resend = new Resend(process.env.RESEND_API_KEY!);

export function generateUnsubscribeToken(userId: string): string {
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET!);
  hmac.update(userId);
  const sig = hmac.digest("hex");
  return `${Buffer.from(userId).toString("base64url")}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  let userId: string;
  try {
    userId = Buffer.from(encoded, "base64url").toString();
  } catch {
    return null;
  }
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET!);
  hmac.update(userId);
  const expected = hmac.digest("hex");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return userId;
}

interface DigestTask {
  title: string;
  sectionName: string;
  overdueNote?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = end.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  if (startMonth === endMonth) return `${startMonth} ${startDay} - ${endDay}`;
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export function buildDigestEmail(opts: {
  userName: string;
  overdueTasks: DigestTask[];
  upcomingTasks: DigestTask[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { userName, overdueTasks, upcomingTasks, dashboardUrl, unsubscribeUrl } = opts;

  const subject =
    overdueTasks.length > 0
      ? `You have ${overdueTasks.length} overdue lawn task${overdueTasks.length > 1 ? "s" : ""} still worth doing`
      : "Upcoming lawn tasks for the next few days";

  const overdueHtml =
    overdueTasks.length > 0
      ? `<h2 style="color:#dc2626;font-size:16px;margin:24px 0 8px;">Overdue - Still Worth Doing</h2>
        ${overdueTasks
          .map(
            (t) => `<div style="border:1px solid #fee2e2;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
            <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
            ${t.overdueNote ? `<div style="color:#6b7280;font-size:14px;margin-top:4px;">${escapeHtml(t.overdueNote)}</div>` : ""}
            <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
          </div>`
          )
          .join("")}`
      : "";

  const upcomingHtml =
    upcomingTasks.length > 0
      ? `<h2 style="color:#16a34a;font-size:16px;margin:24px 0 8px;">Coming Up Soon</h2>
        ${upcomingTasks
          .map((t) => {
            const dateLabel =
              t.scheduledStart && t.scheduledEnd
                ? formatDateRange(t.scheduledStart, t.scheduledEnd)
                : "";
            return `<div style="border:1px solid #dcfce7;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
                ${dateLabel ? `<div style="color:#16a34a;font-size:12px;font-weight:600;">${dateLabel}</div>` : ""}
              </div>
              <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
            </div>`;
          })
          .join("")}`
      : "";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Buddy</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">Here is what needs attention for your lawn:</p>
  ${overdueHtml}
  ${upcomingHtml}
  <div style="text-align:center;margin:32px 0;">
    <a href="${dashboardUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View My Tasks</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:32px;">
    <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe from task reminders</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
