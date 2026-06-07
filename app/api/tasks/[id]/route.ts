import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const VALID_STATUSES = ["pending", "completed", "skipped"] as const;
  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const task = await db.lawnTask.findFirst({
    where: { id, yardSection: { yard: { userId: session.user.id } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.lawnTask.update({
    where: { id },
    data: { status, completedAt: status === "completed" ? new Date() : null },
  });
  return NextResponse.json(updated);
}
