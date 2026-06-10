import { Resend } from "resend";
import crypto from "crypto";
import type { ScheduledReminder } from "@/lib/cron/reminder-scheduler";

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
  bestDay?: Date | null;
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

function formatDisplayTime(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function buildDigestEmail(opts: {
  userName: string;
  overdueTasks: DigestTask[];
  upcomingTasks: DigestTask[];
  scheduledReminders: ScheduledReminder[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { userName, overdueTasks, upcomingTasks, scheduledReminders, dashboardUrl, unsubscribeUrl } = opts;

  const subject =
    overdueTasks.length > 0
      ? `You have ${overdueTasks.length} overdue lawn task${overdueTasks.length > 1 ? "s" : ""} still worth doing`
      : upcomingTasks.length > 0
      ? "Upcoming lawn tasks for the next few days"
      : "Today's lawn care reminder";

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
            const bestDayLine = t.bestDay
              ? `<div style="color:#16a34a;font-size:12px;margin-top:4px;">Best day: ${t.bestDay.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</div>`
              : "";
            return `<div style="border:1px solid #dcfce7;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
                ${dateLabel ? `<div style="color:#16a34a;font-size:12px;font-weight:600;">${dateLabel}</div>` : ""}
              </div>
              ${bestDayLine}
              <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
            </div>`;
          })
          .join("")}`
      : "";

  const remindersHtml =
    scheduledReminders.length > 0
      ? `<h2 style="color:#0369a1;font-size:16px;margin:24px 0 8px;">&#128197; Today&#x27;s Schedule</h2>
      ${scheduledReminders
        .map((r) => {
          const lines: string[] = [];
          if (r.mowing) {
            const timeStr = r.mowing.time ? ` at ${escapeHtml(formatDisplayTime(r.mowing.time))}` : "";
            const heightStr = r.mowing.inches ? ` &middot; ${escapeHtml(r.mowing.inches)} in` : "";
            lines.push(`<div style="color:#374151;font-size:14px;">&#x2702;&#xFE0F; Mow${timeStr}${heightStr}</div>`);
          }
          if (r.watering) {
            const timeStr = r.watering.time ? ` at ${escapeHtml(formatDisplayTime(r.watering.time))}` : "";
            const minStr = r.watering.minutes ? ` &middot; ${escapeHtml(r.watering.minutes)} min` : "";
            lines.push(`<div style="color:#374151;font-size:14px;">&#x1F4A7; Water${timeStr}${minStr}</div>`);
          }
          return `<div style="border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#f0f9ff;">
            <div style="font-weight:600;color:#111;margin-bottom:6px;">${escapeHtml(r.sectionName)}</div>
            ${lines.join("")}
          </div>`;
        })
        .join("")}`
      : "";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">Here is what needs attention for your lawn:</p>
  ${overdueHtml}
  ${upcomingHtml}
  ${remindersHtml}
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

export function buildTrialReminderEmail(opts: {
  userName: string;
  daysLeft: number;
  pricingUrl: string;
}): { subject: string; html: string } {
  const { userName, daysLeft, pricingUrl } = opts;
  const isLastDay = daysLeft <= 1;
  const subject = isLastDay
    ? "Your Yard Analyzer free trial ends tomorrow"
    : `Your Yard Analyzer free trial ends in ${daysLeft} days`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    ${isLastDay
      ? "Your free trial ends <strong>tomorrow</strong>. After that you'll lose access to AI analysis and task recommendations."
      : `Your free trial ends in <strong>${daysLeft} days</strong>. Subscribe now to keep your lawn care on track.`
    }
  </p>
  <p style="color:#374151;">Plans start at <strong>$7.99/month</strong> — less than a bag of fertilizer.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${pricingUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">See plans &amp; pricing</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    No credit card was required for your trial and your data is kept for 30 days after expiry.
  </p>
</body>
</html>`;

  return { subject, html };
}

export function buildPasswordResetEmail(opts: {
  userName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const { userName, resetUrl } = opts;
  return {
    subject: "Reset your Yard Analyzer password",
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${resetUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;">If you didn't request a password reset, you can safely ignore this email.</p>
</body>
</html>`,
  };
}
