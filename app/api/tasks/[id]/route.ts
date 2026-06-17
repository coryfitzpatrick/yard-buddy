import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const taskPatchSchema = z
  .object({
    status: z.enum(["pending", "completed", "skipped"]).optional(),
    stillWorthDoing: z.boolean().nullable().optional(),
  })
  .strict()
  .refine(
    (data) => data.status !== undefined || data.stillWorthDoing !== undefined,
    { message: "Provide at least one of status or stillWorthDoing" },
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = taskPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await db.lawnTask.findFirst({
    where: { id, yardSection: { yard: { userId: session.user.id } } },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status, stillWorthDoing } = parsed.data;
  const updated = await db.lawnTask.update({
    where: { id },
    data: {
      ...(status !== undefined && {
        status,
        completedAt: status === "completed" ? new Date() : null,
      }),
      ...(stillWorthDoing !== undefined && { stillWorthDoing }),
    },
  });
  return NextResponse.json(updated);
}
