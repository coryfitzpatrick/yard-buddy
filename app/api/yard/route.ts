import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSchema } from "@/lib/validations/yard";
import { canCreateYard, getPlanLimits } from "@/lib/subscription";
import { uniqueSlug } from "@/lib/slug";
import { withAxiom } from "@/lib/observability/logger";

export const GET = withAxiom(async (_req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { healthScore: true },
          },
        },
      },
    },
  });
  return NextResponse.json(yards);
});

export const POST = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = yardSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const subUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });
  const yardCount = await db.yard.count({ where: { userId: session.user.id } });

  if (!canCreateYard(subUser, yardCount)) {
    const limits = getPlanLimits(subUser);
    const max = limits.maxYards;
    return NextResponse.json(
      {
        error: "yard_limit_reached",
        message: `Your plan allows up to ${max} yard${max !== 1 ? "s" : ""}. Upgrade to Home Plus or higher to add more yards.`,
      },
      { status: 403 }
    );
  }

  const existingSlugs = await db.yard.findMany({
    where: { userId: session.user.id },
    select: { slug: true },
  }).then((rows) => rows.map((r) => r.slug));
  const slug = uniqueSlug(parsed.data.name ?? "my-property", existingSlugs);

  const yard = await db.yard.create({
    data: { ...parsed.data, userId: session.user.id, slug },
  });
  return NextResponse.json(yard, { status: 201 });
});
