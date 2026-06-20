import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationPrefsSchema } from "@/lib/validations/notifications";
import { withAxiom } from "@/lib/observability/logger";

export const PUT = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = notificationPrefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      notificationsEnabled: parsed.data.notificationsEnabled,
      notifyDaysAhead: parsed.data.notifyDaysAhead,
      reminderNotificationsEnabled: parsed.data.reminderNotificationsEnabled,
      reminderDaysBefore: parsed.data.reminderDaysBefore,
      gddNotificationsEnabled: parsed.data.gddNotificationsEnabled,
      gddBestDayReminderDays: parsed.data.gddBestDayReminderDays,
    },
  });

  return NextResponse.json({ ok: true });
});
