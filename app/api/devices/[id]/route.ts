import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

export const DELETE = withAxiom(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    // deleteMany rather than delete: silently no-ops if the row doesn't exist
    // or belongs to another user, preventing IDOR via probe.
    const result = await db.deviceToken.deleteMany({
      where: { id, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    logger.error("devices/[id] DELETE failed", {
      userId: session.user.id,
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
