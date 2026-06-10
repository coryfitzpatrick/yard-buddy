import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return new NextResponse("Invalid or expired unsubscribe link.", { status: 400 });
  }

  await db.user.update({
    where: { id: userId },
    data: { notificationsEnabled: false },
  });

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;text-align:center;padding:64px 24px;color:#111;">
  <h1 style="color:#16a34a;">You are unsubscribed.</h1>
  <p style="color:#6b7280;">You will no longer receive task reminder emails from Yard Analyzer.</p>
  <p style="color:#6b7280;font-size:14px;">Changed your mind? You can re-enable reminders any time in your settings.</p>
  <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
    <a href="${baseUrl}/settings" style="background:#16a34a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Manage Notification Settings</a>
    <a href="${baseUrl}/dashboard" style="color:#16a34a;padding:10px 20px;border:1px solid #16a34a;border-radius:8px;text-decoration:none;">Return to Yard Analyzer</a>
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
