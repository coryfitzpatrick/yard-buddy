"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardSectionSchema, type YardSectionInput } from "@/lib/validations/yard";
import { uniqueSlug } from "@/lib/slug";

async function getOwnedYard(id: string, userId: string) {
  return db.yard.findFirst({ where: { id, userId } });
}

async function getOwnedSection(sectionId: string, userId: string) {
  return db.yardSection.findFirst({
    where: { id: sectionId, yard: { userId } },
    include: { yard: { select: { slug: true } } },
  });
}

export async function createSectionAction(
  yardId: string,
  data: YardSectionInput,
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const yard = await getOwnedYard(yardId, session.user.id);
  if (!yard) return { ok: false, error: "Not found" };

  const parsed = yardSectionSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const existingSlugs = await db.yardSection
    .findMany({ where: { yardId }, select: { slug: true } })
    .then((rows) => rows.map((r) => r.slug));
  const slug = uniqueSlug(parsed.data.name ?? "section", existingSlugs);

  const section = await db.yardSection.create({
    data: { ...parsed.data, yardId, slug },
  });

  revalidatePath(`/yard/${yard.slug}`);
  revalidatePath("/dashboard");
  return { ok: true, id: section.id, slug: section.slug };
}

export async function updateSectionAction(
  yardId: string,
  sectionId: string,
  data: Partial<YardSectionInput>,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const section = await getOwnedSection(sectionId, session.user.id);
  if (!section || section.yardId !== yardId) return { ok: false, error: "Not found" };

  const parsed = yardSectionSchema.partial().safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  let slug = section.slug;
  if (parsed.data.name && parsed.data.name !== section.name) {
    const existingSlugs = await db.yardSection
      .findMany({ where: { yardId, id: { not: sectionId } }, select: { slug: true } })
      .then((rows) => rows.map((r) => r.slug));
    slug = uniqueSlug(parsed.data.name, existingSlugs);
  }

  const updated = await db.yardSection.update({
    where: { id: sectionId },
    data: { ...parsed.data, slug },
  });

  revalidatePath(`/yard/${section.yard.slug}`);
  revalidatePath(`/yard/${section.yard.slug}/sections/${updated.slug}`);
  revalidatePath("/dashboard");
  return { ok: true, slug: updated.slug };
}

export async function deleteSectionAction(
  yardId: string,
  sectionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const section = await getOwnedSection(sectionId, session.user.id);
  if (!section || section.yardId !== yardId) return { ok: false, error: "Not found" };

  await db.yardSection.delete({ where: { id: sectionId } });

  revalidatePath(`/yard/${section.yard.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
