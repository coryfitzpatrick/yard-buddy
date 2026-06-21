import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  id: z.string().optional(),  // omit to revoke all rows for the user
});

export const POST = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    // updateMany (not update) keeps the same IDOR-safe shape used in
    // app/api/devices/[id]/route.ts: a row belonging to another user
    // silently matches zero rows instead of leaking existence via a 404.
    const where = parsed.data.id
      ? { id: parsed.data.id, userId: session.user.id }
      : { userId: session.user.id };
    const result = await db.biometricRefreshToken.updateMany({
      where,
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true, revoked: result.count });
  } catch (err) {
    logger.error("biometric-revoke: failed", {
      userId: session.user.id,
      id: parsed.data.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
