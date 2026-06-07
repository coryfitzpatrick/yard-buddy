import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSectionSchema } from "@/lib/validations/yard";

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sections = await db.yardSection.findMany({
    where: { yardId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(sections);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const section = await db.yardSection.create({
    data: { ...parsed.data, yardId: id },
  });
  return NextResponse.json(section, { status: 201 });
}
