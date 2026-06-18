import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSchema } from "@/lib/validations/yard";
import { uniqueSlug } from "@/lib/slug";

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existingSlugs = await db.yard.findMany({
    where: { userId: session.user.id, id: { not: id } },
    select: { slug: true },
  }).then((rows) => rows.map((r) => r.slug));
  const slug = uniqueSlug(parsed.data.name ?? yard.name, existingSlugs);

  const updated = await db.yard.update({ where: { id }, data: { ...parsed.data, slug } });
  return NextResponse.json(updated);
}
