import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-hash";

export async function POST(req: NextRequest) {
  const { limited } = await checkRateLimit(
    `reset-password:${getClientIp(req)}`,
    10,
    60 * 60 * 1000,
    { route: "/api/auth/reset-password", ip: getClientIp(req), userId: null },
  );
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  const record = await db.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
    include: { user: { select: { id: true, passwordHash: true } } },
  });

  if (!record || record.expiresAt < new Date() || !record.user.passwordHash) {
    return NextResponse.json(
      { error: "Reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    db.passwordResetToken.delete({ where: { id: record.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
