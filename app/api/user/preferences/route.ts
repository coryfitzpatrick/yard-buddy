import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userPreferencesSchema } from "@/lib/validations/userPreferences";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = userPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { weatherWidgetCollapsed: parsed.data.weatherWidgetCollapsed },
  });

  return NextResponse.json({ ok: true });
}
