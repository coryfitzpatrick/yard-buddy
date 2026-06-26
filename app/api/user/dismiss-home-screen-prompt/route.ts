import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { addToHomeScreenDismissedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
});
