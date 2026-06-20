import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSectionSchema } from "@/lib/validations/yard";
import { uniqueSlug } from "@/lib/slug";
import { withAxiom } from "@/lib/observability/logger";

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

export const GET = withAxiom(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
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
});

export const POST = withAxiom(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = yardSectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existingSlugs = await db.yardSection.findMany({
    where: { yardId: id },
    select: { slug: true },
  }).then((rows) => rows.map((r) => r.slug));
  const slug = uniqueSlug(parsed.data.name ?? "section", existingSlugs);

  const section = await db.yardSection.create({
    data: { ...parsed.data, yardId: id, slug },
  });
  return NextResponse.json(section, { status: 201 });
});
