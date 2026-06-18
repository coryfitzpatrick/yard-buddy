"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function acceptTermsAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  await db.user.update({
    where: { id: session.user.id },
    data: { termsAcceptedAt: new Date() },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
