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
  <p style="color:#6b7280;">You will no longer receive task reminder emails from Yard Buddy.</p>
  <a href="${baseUrl}/dashboard" style="color:#16a34a;">Return to Yard Buddy</a>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
