import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Footer } from "@/components/Footer";
import NotInApp from "@/components/NotInApp";
import PushPermissionPrompt from "@/components/mobile/PushPermissionPrompt";
import BiometricOptInPrompt from "@/components/mobile/BiometricOptInPrompt";
import Link from "next/link";
import { daysUntilTrialEnd, getPlanLimits, PLAN_LABELS } from "@/lib/subscription";
import { YardLimitExceededModal } from "@/components/yards/YardLimitExceededModal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, termsAcceptedAt: true, currentPeriodEnd: true },
  });

  if (!user?.termsAcceptedAt) {
    redirect("/terms/accept");
  }

  const isTrial = user?.planStatus === "trialing" || user?.plan === "trial";
  const trialDaysLeft = daysUntilTrialEnd(user?.trialEndsAt);

  // When a deferred annual downgrade fires at renewal, the user can end up
  // with more active yards than the new plan supports. Force a pick (or an
  // upgrade) before the rest of the app is usable.
  const planLimits = getPlanLimits({
    plan: user.plan,
    planStatus: user.planStatus,
    trialEndsAt: user.trialEndsAt,
    currentPeriodEnd: user.currentPeriodEnd,
  });
  let overLimitYards: { id: string; name: string }[] = [];
  if (planLimits.maxYards > 0) {
    const activeYards = await db.yard.findMany({
      where: { userId: session.user.id, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (activeYards.length > planLimits.maxYards) {
      overLimitYards = activeYards;
    }
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <DashboardNav signOutAction={handleSignOut} />
      {isTrial && (
        <NotInApp>
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
              <p className="text-sm text-amber-800">
                {trialDaysLeft !== null && trialDaysLeft <= 1
                  ? "Your free trial ends tomorrow. Upgrade to keep full access."
                  : trialDaysLeft !== null
                  ? `You're on a free trial. ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining.`
                  : "You're on a free trial."}
              </p>
              <Link
                href="/pricing"
                className="shrink-0 text-sm font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 px-3 py-1 rounded-full transition-colors"
              >
                Upgrade
              </Link>
            </div>
          </div>
        </NotInApp>
      )}
      <main className="flex-1 max-w-6xl mx-auto w-full pb-20 sm:pb-0">
        {children}
      </main>
      <Footer />
      {overLimitYards.length > 0 && (
        <YardLimitExceededModal
          planLabel={PLAN_LABELS[user.plan] ?? user.plan}
          newMaxYards={planLimits.maxYards}
          yards={overLimitYards}
        />
      )}
      <PushPermissionPrompt />
      <BiometricOptInPrompt userIsAuthed={!!session?.user?.id} />
    </div>
  );
}
