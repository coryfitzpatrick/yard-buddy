import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["ios", "android"]),
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

  try {
    const row = await db.deviceToken.upsert({
      where: { token: parsed.data.token },
      update: { userId: session.user.id, platform: parsed.data.platform, lastUsedAt: new Date(), failureCount: 0 },
      create: { userId: session.user.id, token: parsed.data.token, platform: parsed.data.platform },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    logger.error("devices/register: upsert failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
