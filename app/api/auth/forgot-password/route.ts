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

    await db.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
    const { subject, html } = buildPasswordResetEmail({
      userName: user.name ?? "there",
      resetUrl,
    });

    await resend.emails.send({
      from: "Yard Buddy <noreply@yardbuddy.app>",
      to: parsed.data.email,
      subject,
      html,
    });
  }

  return NextResponse.json({ ok: true });
}
