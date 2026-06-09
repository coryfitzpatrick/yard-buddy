import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { resend, buildPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
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
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const tokenRecord = await db.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
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
        from: "Yard Buddy <noreply@yardbuddy.app>",
        to: parsed.data.email,
        subject,
        html,
      });
    } catch (err) {
      console.error("Failed to send password reset email:", err);
      await db.passwordResetToken.delete({ where: { id: tokenRecord.id } });
      // Still return ok to prevent enumeration; token has been cleaned up.
    }
  }

  return NextResponse.json({ ok: true });
}
