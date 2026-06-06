import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardProfileSchema } from "@/lib/validations/yard";

async function getOwnedYard(id: string, userId: string) {
  return db.yardProfile.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await db.yardProfile.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.yardProfile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
