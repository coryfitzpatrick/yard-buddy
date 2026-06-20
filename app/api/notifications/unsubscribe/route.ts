import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";
import { withAxiom } from "@/lib/observability/logger";

function baseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html",
      // Email scanners and link prefetchers shouldn't cache or replay this.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// GET renders a confirm page; the actual opt-out happens on POST so email
// prefetchers (Gmail, Outlook safe-links, antivirus scanners) can't silently
// disable a user's notifications by following the link.
export const GET = withAxiom(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return htmlResponse("Invalid unsubscribe link.", 400);
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return htmlResponse("Invalid or expired unsubscribe link.", 400);
  }

  return htmlResponse(
    `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;text-align:center;padding:64px 24px;color:#111;">
  <h1 style="color:#111;">Unsubscribe from reminders?</h1>
  <p style="color:#6b7280;">You will no longer receive task reminder emails from Yard Analyzer.</p>
  <form method="POST" action="/api/notifications/unsubscribe" style="margin-top:24px;display:inline-block;">
    <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
    <button type="submit" style="background:#16a34a;color:white;padding:10px 20px;border-radius:8px;border:0;font-weight:600;cursor:pointer;font-size:14px;">
      Yes, unsubscribe me
    </button>
  </form>
  <p style="margin-top:24px;color:#9ca3af;font-size:13px;">
    Changed your mind? <a href="${baseUrl()}/settings" style="color:#16a34a;">Manage settings instead</a>.
  </p>
</body>
</html>`,
  );
});

export const POST = withAxiom(async (req: NextRequest) => {
  // Accept the token from either form-encoded POST (the confirm page) or a
  // JSON body for programmatic callers.
  let token: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const v = form.get("token");
    token = typeof v === "string" ? v : null;
  } else if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    token = typeof body.token === "string" ? body.token : null;
  } else {
    // Fall back to query param so links with ?token=... still work.
    token = req.nextUrl.searchParams.get("token");
  }

  if (!token) {
    return htmlResponse("Invalid unsubscribe link.", 400);
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return htmlResponse("Invalid or expired unsubscribe link.", 400);
  }

  await db.user.update({
    where: { id: userId },
    data: { notificationsEnabled: false },
  });

  return htmlResponse(
    `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;text-align:center;padding:64px 24px;color:#111;">
  <h1 style="color:#16a34a;">You are unsubscribed.</h1>
  <p style="color:#6b7280;">You will no longer receive task reminder emails from Yard Analyzer.</p>
  <p style="color:#6b7280;font-size:14px;">Changed your mind? You can re-enable reminders any time in your settings.</p>
  <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
    <a href="${baseUrl()}/settings" style="background:#16a34a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Manage Notification Settings</a>
    <a href="${baseUrl()}/dashboard" style="color:#16a34a;padding:10px 20px;border:1px solid #16a34a;border-radius:8px;text-decoration:none;">Return to Yard Analyzer</a>
  </div>
</body>
</html>`,
  );
});
