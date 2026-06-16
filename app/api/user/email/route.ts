import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { changeEmailSchema } from "@/lib/validations/auth";

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
    select: { email: true, passwordHash: true },
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

  await db.user.update({
    where: { id: session.user.id },
    data: { email: newEmail, emailVerified: null },
  });

  return NextResponse.json({ ok: true, email: newEmail });
}
