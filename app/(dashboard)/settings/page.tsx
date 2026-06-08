import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { Bell } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { notificationsEnabled: true, notifyDaysAhead: true },
  });

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>
          <NotificationPreferences
            initialEnabled={user.notificationsEnabled}
            initialDaysAhead={user.notifyDaysAhead}
          />
        </div>
      </div>
    </div>
  );
}
