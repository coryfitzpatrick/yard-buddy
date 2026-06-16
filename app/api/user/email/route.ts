import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { changeEmailSchema } from "@/lib/validations/auth";
import { resend, buildEmailChangeConfirmEmail } from "@/lib/email";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = changeEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account is linked to Google. Change your Google email or unlink first." },
      { status: 400 }
    );
  }

  const newEmail = parsed.data.newEmail.toLowerCase().trim();
  if (newEmail === user.email.toLowerCase()) {
    return NextResponse.json({ error: "That's already your email." }, { status: 400 });
  }

  const currentValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  // Replace any prior pending request — only one outstanding change at a time.
  await db.emailChangeRequest.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.emailChangeRequest.create({
    data: { userId: user.id, newEmail, token, expiresAt },
  });

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const confirmUrl = `${baseUrl}/api/user/email/confirm?token=${token}`;

  const { subject, html } = buildEmailChangeConfirmEmail({
    userName: user.name ?? "there",
    newEmail,
    confirmUrl,
  });

  try {
    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.com>",
      to: newEmail,
      subject,
      html,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't send confirmation email. Try again in a few minutes." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, pendingEmail: newEmail });
}
