import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRefreshToken } from "@/lib/auth/biometric-refresh";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  deviceFingerprint: z.string().max(200).optional(),
});

export const POST = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const { token, hash } = generateRefreshToken();

  try {
    const row = await db.biometricRefreshToken.create({
      data: {
        userId: session.user.id,
        tokenHash: hash,
        deviceFingerprint: parsed.data.deviceFingerprint ?? null,
      },
    });
    return NextResponse.json({ token, id: row.id });
  } catch (err) {
    logger.error("biometric-issue: create failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
