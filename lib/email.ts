import { Resend } from "resend";
import crypto from "crypto";
import type { ScheduledReminder } from "@/lib/cron/reminder-scheduler";
import type { CostReport, UserCostRow } from "@/lib/cost-report";
import { DAY_MS } from "@/lib/time";
import type { WeatherAlert } from "@/lib/email/weather-alerts";

export const resend = new Resend(process.env.RESEND_API_KEY!);

// Maximum age accepted for an unsubscribe token. A leaked link past this point
// won't silently disable a user's notifications.
const UNSUBSCRIBE_TOKEN_MAX_AGE_MS = 90 * DAY_MS;

export function generateUnsubscribeToken(userId: string): string {
  const issuedAt = Date.now().toString();
  const payload = `${userId}:${issuedAt}`;
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET!);
  hmac.update(payload);
  const sig = hmac.digest("hex");
  return [
    Buffer.from(userId).toString("base64url"),
    Buffer.from(issuedAt).toString("base64url"),
    sig,
  ].join(".");
}

export function verifyUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");

  // Legacy 2-segment tokens ({base64(userId)}.{sig}) issued before we added
  // issuedAt. Keep accepting them so links already in users' inboxes still
  // work, but the format never refreshes on a leak. New tokens use 3 parts.
  if (parts.length === 2) {
    const [encodedUser, sig] = parts;
    let userId: string;
    try {
      userId = Buffer.from(encodedUser, "base64url").toString();
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

  if (parts.length !== 3) return null;
  const [encodedUser, encodedIssued, sig] = parts;
  let userId: string;
  let issuedAtStr: string;
  try {
    userId = Buffer.from(encodedUser, "base64url").toString();
    issuedAtStr = Buffer.from(encodedIssued, "base64url").toString();
  } catch {
    return null;
  }
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
  if (Date.now() - issuedAt > UNSUBSCRIBE_TOKEN_MAX_AGE_MS) return null;

  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET!);
  hmac.update(`${userId}:${issuedAtStr}`);
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
  weatherAlerts?: WeatherAlert[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { userName, overdueTasks, upcomingTasks, scheduledReminders, weatherAlerts = [], dashboardUrl, unsubscribeUrl } = opts;

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
            const heightStr = r.mowing.inches != null ? ` &middot; ${r.mowing.inches} in` : "";
            lines.push(`<div style="color:#374151;font-size:14px;">&#x2702;&#xFE0F; Mow${timeStr}${heightStr}</div>`);
          }
          if (r.watering) {
            const timeStr = r.watering.time ? ` at ${escapeHtml(formatDisplayTime(r.watering.time))}` : "";
            const minStr = r.watering.minutes != null ? ` &middot; ${r.watering.minutes} min` : "";
            lines.push(`<div style="color:#374151;font-size:14px;">&#x1F4A7; Water${timeStr}${minStr}</div>`);
          }
          return `<div style="border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#f0f9ff;">
            <div style="font-weight:600;color:#111;margin-bottom:6px;">${escapeHtml(r.sectionName)}</div>
            ${lines.join("")}
          </div>`;
        })
        .join("")}`
      : "";

  const weatherAlertsHtml =
    weatherAlerts.length > 0
      ? `<h2 style="color:#92400e;font-size:16px;margin:24px 0 8px;">Weather alerts</h2>
<ul style="padding-left:18px;">
${weatherAlerts.map((a) => `<li>${escapeHtml(a.yardName)}, ${escapeHtml(a.kind)} on ${escapeHtml(a.date)}: ${escapeHtml(a.reason)}</li>`).join("")}
</ul>`
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
  ${weatherAlertsHtml}
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
      ? "Your free trial ends <strong>tomorrow</strong>. After that you'll lose access to lawn analysis and task recommendations."
      : `Your free trial ends in <strong>${daysLeft} days</strong>. Subscribe now to keep your lawn care on track.`
    }
  </p>
  <p style="color:#374151;">Plans start at <strong>$7.99/month</strong>, less than a bag of fertilizer.</p>
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

export function buildDay5ScheduleNudgeEmail(opts: {
  userName: string;
  scheduleSetupUrl: string;
}): { subject: string; html: string } {
  const { userName, scheduleSetupUrl } = opts;
  const subject = "Set your schedule to earn 7 more trial days";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Setting your watering and mowing schedule earns you <strong>7 more days of free trial</strong>.
    It also unlocks the reminders that keep your yard on track without you having to think about it.
  </p>
  <p style="margin:24px 0;">
    <a href="${scheduleSetupUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
      Set up my schedule
    </a>
  </p>
  <p style="color:#6b7280;font-size:13px;">
    You will earn the bonus once you also complete one of your recommended tasks.
  </p>
</body>
</html>`;
  return { subject, html };
}

export function buildDay10TaskNudgeEmail(opts: {
  userName: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const { userName, dashboardUrl } = opts;
  const subject = "Complete a task to earn 7 more trial days";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Your schedule is set, nice work. Mark any one of your recommended tasks as done to earn
    <strong>7 more days of free trial</strong>.
  </p>
  <p style="margin:24px 0;">
    <a href="${dashboardUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
      Open my dashboard
    </a>
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

export function buildEmailChangeConfirmEmail(opts: {
  userName: string;
  newEmail: string;
  confirmUrl: string;
}): { subject: string; html: string } {
  const { userName, newEmail, confirmUrl } = opts;
  return {
    subject: "Confirm your new Yard Analyzer email",
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">We received a request to change your Yard Analyzer email address to <strong>${escapeHtml(newEmail)}</strong>. Confirm the change by clicking the button below. This link expires in 1 hour.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${confirmUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Confirm new email</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;">If you didn't request this change, ignore this email. Your account email won't change unless you click the link above.</p>
</body>
</html>`,
  };
}

export function buildPaymentFailedEmail(opts: {
  userName: string;
  billingPortalUrl: string;
  attemptCount: number;
}): { subject: string; html: string } {
  const { userName, billingPortalUrl, attemptCount } = opts;
  const isFinal = attemptCount >= 4;
  const subject = isFinal
    ? "Action required: your Yard Analyzer subscription payment has failed"
    : "Payment failed for your Yard Analyzer subscription";

  const bodyText = isFinal
    ? `We were unable to process your payment after multiple attempts. To avoid losing access to your lawn care history and tasks, please update your payment method now. Your subscription will be canceled if payment cannot be collected.`
    : `We were unable to process your latest payment. We'll retry automatically. Please update your payment method to make sure your subscription stays active.`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">${bodyText}</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${billingPortalUrl}" style="background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Update payment method</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    If you need help, reply to this email.
  </p>
</body>
</html>`;

  return { subject, html };
}

export function buildCardExpiringEmail(opts: {
  userName: string;
  cardLast4: string;
  expiryMonth: number;
  expiryYear: number;
  nextBillingDate: Date;
  billingPortalUrl: string;
}): { subject: string; html: string } {
  const { userName, cardLast4, expiryMonth, expiryYear, nextBillingDate, billingPortalUrl } = opts;
  const billingDateStr = nextBillingDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const expiryStr = `${String(expiryMonth).padStart(2, "0")}/${String(expiryYear).slice(-2)}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Your card ending in <strong>${escapeHtml(cardLast4)}</strong> (expires ${escapeHtml(expiryStr)}) will expire before your next billing date of <strong>${escapeHtml(billingDateStr)}</strong>.
  </p>
  <p style="color:#374151;">Please update your payment method to avoid any interruption to your Yard Analyzer subscription.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${billingPortalUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Update payment method</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    If you need help, reply to this email.
  </p>
</body>
</html>`;

  return {
    subject: `Your Yard Analyzer payment card (ending ${cardLast4}) expires ${expiryStr}`,
    html,
  };
}

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function rowHtml(r: UserCostRow): string {
  const marginColor = r.marginUsd < 0 ? "#b91c1c" : "#15803d";
  return `<tr>
    <td style="padding:4px 8px;">${escapeHtml(r.email)}</td>
    <td style="padding:4px 8px;">${escapeHtml(r.plan)}</td>
    <td style="padding:4px 8px;text-align:right;">${r.calls}</td>
    <td style="padding:4px 8px;text-align:right;">${fmtUsd(r.costUsd)}</td>
    <td style="padding:4px 8px;text-align:right;">${fmtUsd(r.revenueUsd)}</td>
    <td style="padding:4px 8px;text-align:right;color:${marginColor};">${fmtUsd(r.marginUsd)}</td>
  </tr>`;
}

export function buildCostReportEmail(report: CostReport): { subject: string; html: string } {
  const subject = `Cost report - ${report.month}`;
  if (report.rows.length === 0) {
    const html = `<div style="font-family:system-ui,sans-serif;">
      <h2>Cost report - ${report.month}</h2>
      <p>No events recorded for this month.</p>
    </div>`;
    return { subject, html };
  }
  const tableRows = report.rows.map(rowHtml).join("");
  const summaryColor = report.totals.netUsd < 0 ? "#b91c1c" : "#15803d";
  const html = `<div style="font-family:system-ui,sans-serif;color:#111;">
    <h2 style="margin-bottom:4px;">Cost report - ${report.month}</h2>
    <p style="color:#444;margin-top:0;">
      Net margin: <strong style="color:${summaryColor};">${fmtUsd(report.totals.netUsd)}</strong>
      &nbsp;(Revenue ${fmtUsd(report.totals.revenueUsd)} &middot; Cost ${fmtUsd(report.totals.costUsd)})<br>
      Users underwater: <strong>${report.totals.usersUnderwater} of ${report.rows.length}</strong>
    </p>
    <table style="border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:4px 8px;text-align:left;">Email</th>
          <th style="padding:4px 8px;text-align:left;">Plan</th>
          <th style="padding:4px 8px;text-align:right;">Calls</th>
          <th style="padding:4px 8px;text-align:right;">Cost</th>
          <th style="padding:4px 8px;text-align:right;">Revenue</th>
          <th style="padding:4px 8px;text-align:right;">Margin</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
  return { subject, html };
}
