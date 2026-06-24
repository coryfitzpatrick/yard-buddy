import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { archiveYardIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = body.archiveYardIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "archiveYardIds must be a non-empty string array" }, { status: 400 });
  }

  const owned = await db.yard.findMany({
    where: { id: { in: ids }, userId: session.user.id, archivedAt: null },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    return NextResponse.json(
      { error: "One or more yards are invalid or already archived", code: "archive_invalid_ids" },
      { status: 400 },
    );
  }

  const result = await db.yard.updateMany({
    where: { id: { in: ids }, userId: session.user.id },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ ok: true, archived: result.count });
});
