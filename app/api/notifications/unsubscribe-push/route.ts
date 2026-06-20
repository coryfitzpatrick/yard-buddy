import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";
import { withAxiom, logger } from "@/lib/observability/logger";

export const GET = withAxiom(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  try {
    const result = await db.deviceToken.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    logger.error("unsubscribe-push: delete failed", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
