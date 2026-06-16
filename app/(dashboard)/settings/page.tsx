import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { BillingSection } from "@/components/settings/BillingSection";
import { EmailSection } from "@/components/settings/EmailSection";
import { Bell, Lock, CreditCard, Mail } from "lucide-react";
import { getDaysUntilDeletion, PLAN_LABELS, canPause } from "@/lib/subscription";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      email: true,
      notificationsEnabled: true,
      notifyDaysAhead: true,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: true,
      gddNotificationsEnabled: true,
      gddBestDayReminderDays: true,
      passwordHash: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pausedUntil: true,
      stripeSubscriptionId: true,
      accounts: { select: { provider: true } },
    },
  });

  const linkedToGoogle = user.accounts.some((a) => a.provider === "google");

  const subUser = {
    plan: user.plan,
    planStatus: user.planStatus,
    trialEndsAt: user.trialEndsAt,
    currentPeriodEnd: user.currentPeriodEnd,
    pausedUntil: user.pausedUntil,
  };
  const daysUntilDeletion = getDaysUntilDeletion(subUser);
  const trialDaysLeft = user.trialEndsAt
    ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const canPauseSubscription = canPause(subUser);

  // Determine billing period from active Stripe price ID
  const { STRIPE_PRICES, stripe } = await import("@/lib/stripe");
  let currentPeriod: "monthly" | "annual" = "monthly";
  if (user.stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const activePriceId = sub.items.data[0]?.price.id ?? "";
    for (const periods of Object.values(STRIPE_PRICES)) {
      if (periods.annual === activePriceId) { currentPeriod = "annual"; break; }
    }
  }

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="max-w-lg space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Plan & Billing</h2>
          </div>
          <BillingSection
            plan={user.plan}
            planStatus={user.planStatus}
            planLabel={PLAN_LABELS[user.plan] ?? user.plan}
            daysUntilDeletion={daysUntilDeletion}
            currentPeriodEnd={user.currentPeriodEnd?.toISOString() ?? null}
            pausedUntil={user.pausedUntil?.toISOString() ?? null}
            hasStripeSubscription={!!user.stripeSubscriptionId}
            trialDaysLeft={trialDaysLeft}
            canPauseSubscription={canPauseSubscription}
            currentPlan={user.plan}
            currentPeriod={currentPeriod}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          </div>
          <EmailSection initialEmail={user.email} linkedToGoogle={linkedToGoogle} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>
          <NotificationPreferences
            initialEnabled={user.notificationsEnabled}
            initialDaysAhead={user.notifyDaysAhead}
            initialReminderEnabled={user.reminderNotificationsEnabled}
            initialReminderDaysBefore={user.reminderDaysBefore}
            initialGddEnabled={user.gddNotificationsEnabled}
            initialGddBestDayReminderDays={user.gddBestDayReminderDays}
          />
        </div>

        {user.passwordHash && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
            </div>
            <ChangePassword />
          </div>
        )}
      </div>
    </div>
  );
}
