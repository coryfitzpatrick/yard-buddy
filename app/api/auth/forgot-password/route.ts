import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { resend, buildPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-hash";
import { withAxiom, logger } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(
    `forgot-password:${ip}`,
    5,
    60 * 60 * 1000,
    { route: "/api/auth/forgot-password", ip, userId: null },
  );
  if (limited) {
    // Return ok to avoid leaking rate limit status to email-enumeration attackers
    return NextResponse.json({ ok: true });
  }

  const body = await req.json();
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, passwordHash: true },
  });

  // Always return ok to prevent email enumeration.
  // Only send email if user exists and has a password (not OAuth-only).
  if (user?.passwordHash) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const tokenRecord = await db.passwordResetToken.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });

    const baseUrl = process.env.NEXTAUTH_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    const { subject, html } = buildPasswordResetEmail({
      userName: user.name ?? "there",
      resetUrl,
    });

    try {
      await resend.emails.send({
        from: "Yard Analyzer <noreply@yardanalyzer.com>",
        to: parsed.data.email,
        subject,
        html,
      });
    } catch (err) {
      logger.error("Failed to send password reset email", {
        err: err instanceof Error ? err.message : String(err),
      });
      await db.passwordResetToken.delete({ where: { id: tokenRecord.id } });
      // Still return ok to prevent enumeration; token has been cleaned up.
    }
  }

  return NextResponse.json({ ok: true });
});
