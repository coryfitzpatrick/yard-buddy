import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";
import { z } from "zod";

const splitSchema = z.object({
  areaTypes: z
    .array(z.enum(["front", "back", "left_side", "right_side", "garden"]))
    .min(2, "Pick at least two sections — fewer than two isn't really splitting.")
    .max(5),
});

const AREA_NAMES: Record<string, string> = {
  front: "Front Yard",
  back: "Back Yard",
  left_side: "Left Side Yard",
  right_side: "Right Side Yard",
  garden: "Garden",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const yard = await db.yard.findFirst({
    where: { id, userId: session.user.id },
    include: { sections: true },
  });
  if (!yard) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (yard.sections.length !== 1) {
    return NextResponse.json(
      { error: "Splitting is only available on a yard with a single section." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = splitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const original = yard.sections[0];

  await db.$transaction(async (tx) => {
    // Cascade-deletes original section's analyses + tasks via schema relations.
    await tx.yardSection.delete({ where: { id: original.id } });

    const usedSlugs: string[] = [];
    for (const areaType of parsed.data.areaTypes) {
      const name = AREA_NAMES[areaType];
      const slug = uniqueSlug(name, usedSlugs);
      usedSlugs.push(slug);
      await tx.yardSection.create({
        data: {
          yardId: id,
          name,
          slug,
          areaType,
          grassType: original.grassType,
          soilPh: original.soilPh,
          nitrogenPpm: original.nitrogenPpm,
          phosphorusPpm: original.phosphorusPpm,
          potassiumPpm: original.potassiumPpm,
          soilTestSource: original.soilTestSource,
          soilMoisture: original.soilMoisture,
        },
      });
    }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
