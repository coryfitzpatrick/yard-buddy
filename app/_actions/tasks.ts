"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { triggerEngagementBonusCheck } from "@/lib/engagement-trigger";

const statusSchema = z.enum(["pending", "completed", "skipped"]);

export async function updateTaskStatusAction(id: string, status: "pending" | "completed" | "skipped") {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Unauthorized" };

  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false as const, error: "Invalid status" };

  const task = await db.lawnTask.findFirst({
    where: { id, yardSection: { yard: { userId: session.user.id } } },
    select: { id: true },
  });
  if (!task) return { ok: false as const, error: "Not found" };

  await db.lawnTask.update({
    where: { id },
    data: {
      status: parsed.data,
      completedAt: parsed.data === "completed" ? new Date() : null,
    },
  });

  if (parsed.data === "completed") {
    triggerEngagementBonusCheck(session.user.id);
  }

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function resetTaskOverdueAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Unauthorized" };

  const task = await db.lawnTask.findFirst({
    where: { id, yardSection: { yard: { userId: session.user.id } } },
    select: { id: true },
  });
  if (!task) return { ok: false as const, error: "Not found" };

  await db.lawnTask.update({
    where: { id },
    data: { stillWorthDoing: null },
  });

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true as const };
}
