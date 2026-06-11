import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSectionSchema } from "@/lib/validations/yard";
import { uniqueSlug } from "@/lib/slug";

async function getOwnedSection(sectionId: string, userId: string) {
  return db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const section = await getOwnedSection(sectionId, session.user.id);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existingSlugs = await db.yardSection.findMany({
    where: { yardId: section.yardId, id: { not: sectionId } },
    select: { slug: true },
  }).then((rows) => rows.map((r) => r.slug));
  const slug = uniqueSlug(parsed.data.name ?? section.name, existingSlugs);

  const updated = await db.yardSection.update({ where: { id: sectionId }, data: { ...parsed.data, slug } });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;
  const section = await getOwnedSection(sectionId, session.user.id);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.yardSection.delete({ where: { id: sectionId } });
  return NextResponse.json({ success: true });
}
