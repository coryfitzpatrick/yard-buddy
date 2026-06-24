import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { BillingSection } from "@/components/settings/BillingSection";
import { EmailSection } from "@/components/settings/EmailSection";
import { Bell, Lock, CreditCard, Mail } from "lucide-react";
import { getDaysUntilDeletion, PLAN_LABELS, canPause, daysUntilTrialEnd } from "@/lib/subscription";
import { isMobileApp } from "@/lib/platform.server";

const EMAIL_CHANGE_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  success: { tone: "success", text: "Email updated. You may need to sign in again." },
  expired: { tone: "error", text: "That confirmation link expired. Start the email change again." },
  invalid: { tone: "error", text: "That confirmation link is invalid. Start the email change again." },
  taken: { tone: "error", text: "That email was claimed by another account before you confirmed." },
  error: { tone: "error", text: "Something went wrong applying the change. Try again." },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ emailChange?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { emailChange } = await searchParams;
  const emailChangeNotice = emailChange ? EMAIL_CHANGE_MESSAGES[emailChange] : null;
  const inApp = await isMobileApp();

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      email: true,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: true,
      notificationsEnabled: true,
      taskPushEnabled: true,
      notifyDaysAhead: true,
      reminderNotificationsEnabled: true,
      schedulePushEnabled: true,
      reminderDaysBefore: true,
      weatherEmailEnabled: true,
      weatherPushEnabled: true,
      gddNotificationsEnabled: true,
      gddBestDayReminderDays: true,
      passwordHash: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pausedUntil: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      accounts: { select: { provider: true } },
    },
  });

  const linkedToGoogle = user.accounts.some((a) => a.provider === "google");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const archivedCount = await db.yard.count({
    where: { userId: session.user.id, archivedAt: { not: null } },
  });

  const subUser = {
    plan: user.plan,
    planStatus: user.planStatus,
    trialEndsAt: user.trialEndsAt,
    currentPeriodEnd: user.currentPeriodEnd,
    pausedUntil: user.pausedUntil,
  };
  const daysUntilDeletion = getDaysUntilDeletion(subUser);
  const trialDaysLeft = daysUntilTrialEnd(user.trialEndsAt);
  const canPauseSubscription = canPause(subUser);

  // Determine billing period from active Stripe price ID, and detect any
  // pending subscription schedule (the only one we create is for annual→monthly).
  const { STRIPE_PRICES, stripe } = await import("@/lib/stripe");
  let currentPeriod: "monthly" | "annual" = "monthly";
  let pendingChange: { plan: string; period: "monthly" | "annual"; effectiveAt: string } | null = null;
  if (user.stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const activePriceId = sub.items.data[0]?.price.id ?? "";
    for (const periods of Object.values(STRIPE_PRICES)) {
      if (periods.annual === activePriceId) { currentPeriod = "annual"; break; }
    }

    const scheduleId = sub.schedule
      ? (typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id)
      : null;
    if (scheduleId) {
      try {
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        const futurePhase = schedule.phases[1];
        const futurePrice = futurePhase?.items[0]?.price;
        const futurePriceId = typeof futurePrice === "string" ? futurePrice : futurePrice?.id;
        if (futurePhase && futurePriceId) {
          for (const [planKey, periods] of Object.entries(STRIPE_PRICES)) {
            const matchedPeriod = periods.monthly === futurePriceId ? "monthly" : periods.annual === futurePriceId ? "annual" : null;
            if (matchedPeriod) {
              pendingChange = {
                plan: planKey,
                period: matchedPeriod,
                effectiveAt: new Date(futurePhase.start_date * 1000).toISOString(),
              };
              break;
            }
          }
        }
      } catch {
        // Don't fail page load if schedule fetch fails
      }
    }
  }

  // Fetch default payment method so we can show it inline.
  let paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null = null;
  if (user.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (customer && !customer.deleted) {
        const pm = customer.invoice_settings?.default_payment_method;
        if (pm && typeof pm !== "string" && pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          };
        }
      }
    } catch {
      // Don't fail the page if Stripe is slow / unavailable
    }
  }

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {emailChangeNotice && (
        <div
          className={`max-w-lg mb-6 rounded-md p-3 text-sm ${
            emailChangeNotice.tone === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {emailChangeNotice.text}
        </div>
      )}

      <div className="max-w-5xl space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
        {!inApp && (
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
              hasStripeCustomer={!!user.stripeCustomerId}
              paymentMethod={paymentMethod}
              trialDaysLeft={trialDaysLeft}
              canPauseSubscription={canPauseSubscription}
              currentPlan={user.plan}
              currentPeriod={currentPeriod}
              pendingChange={pendingChange}
              yards={yards}
              archivedCount={archivedCount}
            />
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          </div>
          <EmailSection initialEmail={user.email} linkedToGoogle={linkedToGoogle} />
          {user.passwordHash && (
            <>
              <hr className="my-6 border-gray-200" />
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-semibold text-gray-700">Change password</h3>
              </div>
              <ChangePassword />
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>
          <NotificationPreferences
            initialEmailMaster={user.emailNotificationsEnabled}
            initialPushMaster={user.pushNotificationsEnabled}
            initialTaskEmail={user.notificationsEnabled}
            initialTaskPush={user.taskPushEnabled}
            initialNotifyDaysAhead={user.notifyDaysAhead}
            initialScheduleEmail={user.reminderNotificationsEnabled}
            initialSchedulePush={user.schedulePushEnabled}
            initialReminderDaysBefore={user.reminderDaysBefore}
            initialWeatherEmail={user.weatherEmailEnabled}
            initialWeatherPush={user.weatherPushEnabled}
            initialGddPush={user.gddNotificationsEnabled}
            initialGddBestDayReminderDays={user.gddBestDayReminderDays}
          />
        </div>
      </div>
    </div>
  );
}
