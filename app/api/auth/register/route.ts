import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { DAY_MS, HOUR_MS, TRIAL_DAYS } from "@/lib/time";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(
    `register:${ip}`,
    5,
    HOUR_MS,
    { route: "/api/auth/register", ip, userId: null },
  );
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
      termsAcceptedAt: new Date(),
    },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
});
