"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSchema, type YardInput } from "@/lib/validations/yard";
import { uniqueSlug } from "@/lib/slug";

const splitSchema = z.object({
  areaTypes: z
    .array(z.enum(["front", "back", "left_side", "right_side"]))
    .min(2, "Pick at least two sections; fewer than two isn't really splitting.")
    .max(4),
});

const SPLIT_AREA_NAMES: Record<string, string> = {
  front: "Front Yard",
  back: "Back Yard",
  left_side: "Left Side Yard",
  right_side: "Right Side Yard",
};

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

export async function updateYardAction(
  id: string,
  data: YardInput,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return { ok: false, error: "Not found" };

  const parsed = yardSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const existingSlugs = await db.yard
    .findMany({ where: { userId: session.user.id, id: { not: id } }, select: { slug: true } })
    .then((rows) => rows.map((r) => r.slug));
  const slug = uniqueSlug(parsed.data.name ?? yard.name, existingSlugs);

  const updated = await db.yard.update({ where: { id }, data: { ...parsed.data, slug } });

  revalidatePath("/yard");
  revalidatePath(`/yard/${updated.slug}`);
  revalidatePath("/dashboard");
  return { ok: true, slug: updated.slug };
}

export async function deleteYardAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const yard = await getOwnedYard(id, session.user.id);
  if (!yard) return { ok: false, error: "Not found" };

  await db.yard.delete({ where: { id } });

  revalidatePath("/yard");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function splitYardAction(
  id: string,
  areaTypes: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const yard = await db.yard.findFirst({
    where: { id, userId: session.user.id },
    include: { sections: true },
  });
  if (!yard) return { ok: false, error: "Not found" };
  if (yard.sections.length !== 1) {
    return { ok: false, error: "Splitting is only available on a yard with a single section." };
  }

  const parsed = splitSchema.safeParse({ areaTypes });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const original = yard.sections[0];

  await db.$transaction(async (tx) => {
    await tx.yardSection.delete({ where: { id: original.id } });

    const usedSlugs: string[] = [];
    for (const areaType of parsed.data.areaTypes) {
      const name = SPLIT_AREA_NAMES[areaType];
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

  revalidatePath(`/yard/${yard.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
