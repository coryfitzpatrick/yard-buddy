"use client";

// NOTE: This section is gated at the route level by app/(dashboard)/settings/page.tsx
// via `await isMobileApp()`. In-app users never see this component today. The
// in-section <NotInApp> wraps below provide defense-in-depth: if a future refactor
// renders BillingSection in a context without the gate, its Upgrade/Subscribe
// links won't resurface inside the mobile app.

import Link from "next/link";
import { CreditCard, PauseCircle, PlayCircle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NotInApp from "@/components/NotInApp";
import { DowngradeModal } from "@/components/settings/DowngradeModal";
import { DeleteArchivedModal } from "@/components/settings/DeleteArchivedModal";
import { getPlanLimits, PLAN_LABELS } from "@/lib/subscription";

interface PaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface PendingChange {
  plan: string;
  period: "monthly" | "annual";
  effectiveAt: string;
}

interface Props {
  plan: string;
  planStatus: string;
  planLabel: string;
  daysUntilDeletion: number | null;
  currentPeriodEnd: string | null;
  pausedUntil: string | null;
  hasStripeSubscription: boolean;
  hasStripeCustomer: boolean;
  paymentMethod: PaymentMethod | null;
  trialDaysLeft: number | null;
  canPauseSubscription: boolean;
  currentPlan: string;
  currentPeriod: "monthly" | "annual";
  pendingChange: PendingChange | null;
  yards: { id: string; name: string }[];
  archivedCount: number;
}

type Dialog = "pause" | "cancel" | null;

const CHANGE_PLANS = [
  {
    key: "home_basic",
    label: "Home Basic",
    monthly: 5.99,
    annual: 59.99,
    summary: "1 yard · 4 analyses/month · per-section schedules",
  },
  {
    key: "home_plus",
    label: "Home Plus",
    monthly: 9.99,
    annual: 99.99,
    summary: "Up to 2 yards · 8 analyses/yard/month · multi-yard dashboard",
  },
  {
    key: "professional",
    label: "Professional",
    monthly: 24.99,
    annual: 229.99,
    summary: "Up to 10 yards · 8 analyses/yard/month · for rentals & HOAs",
  },
] as const;

export function BillingSection({
  plan,
  planStatus,
  planLabel,
  daysUntilDeletion,
  currentPeriodEnd,
  pausedUntil,
  hasStripeSubscription,
  hasStripeCustomer,
  paymentMethod,
  trialDaysLeft,
  canPauseSubscription,
  currentPlan,
  currentPeriod,
  pendingChange,
  yards,
  archivedCount,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [pauseMonths, setPauseMonths] = useState(3);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [changePlanKey, setChangePlanKey] = useState<string | null>(null);
  const [changePeriod, setChangePeriod] = useState<"monthly" | "annual">(currentPeriod);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downgradeTarget, setDowngradeTarget] = useState<string | null>(null);
  const [showDeleteArchived, setShowDeleteArchived] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const action = searchParams.get("action");
    const target = searchParams.get("to");
    if (action === "downgrade" && target) {
      setDowngradeTarget(target);
      router.replace("/settings", { scroll: false });
    }
  }, [searchParams, router]);

  const isPaused = planStatus === "paused";
  const isTrial = planStatus === "trialing" || plan === "trial";
  const isExpired = daysUntilDeletion !== null;
  const isActivePaidPlan = !isTrial && planStatus === "active" && plan !== "trial";
  const showSubscriptionControls = hasStripeSubscription || isActivePaidPlan;

  async function handlePause() {
    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/stripe/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: pauseMonths }),
    });
    setBusy(false);
    if (!res.ok) {
      setActionError("Failed to pause billing. Please try again.");
      return;
    }
    setDialog(null);
    window.location.reload();
  }

  async function handleResume() {
    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/stripe/pause", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setActionError("Failed to resume billing. Please try again.");
      return;
    }
    window.location.reload();
  }

  async function handleCancel() {
    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/stripe/cancel", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setActionError("Failed to cancel subscription. Please try again.");
      return;
    }
    setDialog(null);
    window.location.reload();
  }

  async function handleCancelPending() {
    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/stripe/cancel-pending", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setActionError("Failed to cancel the pending change. Please try again.");
      return;
    }
    window.location.reload();
  }

  async function handleChangePlan() {
    if (!changePlanKey) return;
    const targetLimits = getPlanLimits({ plan: changePlanKey, planStatus, trialEndsAt: null });
    // Only open the picker modal when the user is actually over the new plan's
    // yard limit. A downgrade that fits inside the new plan can switch directly.
    if (targetLimits.maxYards > 0 && yards.length > targetLimits.maxYards) {
      setDowngradeTarget(changePlanKey);
      setChangePlanKey(null);
      return;
    }

    setBusy(true);
    setActionError(null);
    const res = await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: changePlanKey, period: changePeriod }),
    });
    setBusy(false);
    if (!res.ok) {
      setActionError("Failed to change plan. Please try again.");
      return;
    }
    setChangePlanKey(null);
    window.location.reload();
  }

  return (
    <div className="space-y-5">
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {/* Current plan status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900 text-base">{planLabel}</p>
          {isTrial && trialDaysLeft !== null && trialDaysLeft > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining in your free trial
            </p>
          )}
          {isPaused && pausedUntil && (
            <p className="text-sm text-amber-600 mt-0.5">
              Billing paused until {new Date(pausedUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {!isTrial && !isPaused && currentPeriodEnd && (
            <p className="text-sm text-gray-500 mt-0.5">
              Renews {new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {isExpired && (
            <NotInApp>
              <p className="text-sm text-red-600 font-medium mt-0.5">
                {daysUntilDeletion! > 0
                  ? `Your data will be deleted in ${daysUntilDeletion} day${daysUntilDeletion !== 1 ? "s" : ""}. Upgrade to keep it.`
                  : "Your data is scheduled for deletion. Upgrade now."}
              </p>
            </NotInApp>
          )}
        </div>
        <div className="shrink-0">
          {hasStripeSubscription ? (
            <a href="/api/stripe/portal">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Manage billing
              </Button>
            </a>
          ) : !isTrial ? null : (
            <NotInApp>
              <Link href="/pricing">
                <Button size="sm" className="bg-green-600 hover:bg-green-700">Upgrade plan</Button>
              </Link>
            </NotInApp>
          )}
        </div>
      </div>

      {pendingChange && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">Switching to {PLAN_LABELS[pendingChange.plan] ?? pendingChange.plan} ({pendingChange.period === "monthly" ? "Monthly" : "Annual"})</span> on {new Date(pendingChange.effectiveAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Nothing changes until then.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleCancelPending}
            className="mt-2 text-sm text-amber-900 underline hover:text-amber-700 disabled:opacity-50"
          >
            Cancel pending switch
          </button>
        </div>
      )}

      {archivedCount > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{archivedCount} yard{archivedCount === 1 ? "" : "s"} archived</span> from a previous plan.{" "}
            <span className="text-gray-500">Upgrade to restore, or </span>
            <button
              type="button"
              className="text-red-700 underline hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-sm"
              onClick={() => setShowDeleteArchived(true)}
            >
              delete permanently
            </button>
            .
          </p>
        </div>
      )}

      {/* Payment method — any customer who has ever billed (active or canceled) */}
      {hasStripeCustomer && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Payment method</p>
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            {paymentMethod ? (
              <div className="text-sm">
                <span className="font-medium text-gray-800 capitalize">{paymentMethod.brand}</span>{" "}
                <span className="text-gray-600">•••• {paymentMethod.last4}</span>
                <span className="text-xs text-gray-400 ml-2">
                  Expires {String(paymentMethod.expMonth).padStart(2, "0")}/{String(paymentMethod.expYear).slice(-2)}
                </span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No card on file</div>
            )}
            <a href="/api/stripe/portal?flow=payment_method_update">
              <Button variant="outline" size="sm" className="gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                {paymentMethod ? "Update" : "Add card"}
              </Button>
            </a>
          </div>
        </div>
      )}

      {/* Change plan — only for active paid subscribers */}
      {showSubscriptionControls && !isTrial && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-700">Change plan</p>
            <NotInApp>
              <Link
                href="/pricing"
                className="text-xs text-green-700 hover:text-green-800 underline"
              >
                Compare plans
              </Link>
            </NotInApp>
          </div>

          {changePlanKey ? (() => {
            const selectedPlan = CHANGE_PLANS.find((p) => p.key === changePlanKey);
            const billedAmount = changePeriod === "monthly" ? selectedPlan?.monthly : selectedPlan?.annual;
            const billedSuffix = changePeriod === "monthly" ? "per month" : "per year";
            const TIER_RANK: Record<string, number> = { trial: 0, home_basic: 1, home_plus: 2, professional: 3 };
            const targetRank = TIER_RANK[changePlanKey] ?? 0;
            const currentRank = TIER_RANK[currentPlan] ?? 0;
            const isDowngradeChange = targetRank < currentRank;
            const isUpgradeChange = targetRank > currentRank;
            const isAnnualToMonthly = currentPeriod === "annual" && changePeriod === "monthly";
            const isMonthlyToAnnual = currentPeriod === "monthly" && changePeriod === "annual";
            const renewalDate = currentPeriodEnd
              ? new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
              : "your next renewal";
            const confirmLabel = isAnnualToMonthly ? "Schedule switch" : isDowngradeChange ? "Downgrade" : isUpgradeChange ? "Upgrade" : "Confirm switch";
            const busyLabel = isAnnualToMonthly ? "Scheduling…" : isDowngradeChange ? "Downgrading…" : isUpgradeChange ? "Upgrading…" : "Switching…";

            let directionCopy: string;
            if (isAnnualToMonthly) {
              directionCopy = `Your annual plan runs through ${renewalDate}. After that, billing switches to ${selectedPlan?.label} at $${selectedPlan?.monthly}/mo. Nothing changes today.`;
            } else if (isMonthlyToAnnual && !isDowngradeChange && !isUpgradeChange) {
              directionCopy = `You'll be charged $${selectedPlan?.annual} today. Any unused days from this month are credited toward your next bill. Your annual term runs for 12 months from today.`;
            } else if (isDowngradeChange) {
              directionCopy = `We'll credit the prorated difference for the rest of this billing period toward your next bill. New plan starts now.`;
            } else if (isUpgradeChange) {
              directionCopy = `You'll be charged the prorated difference for the rest of this billing period today. New plan starts now.`;
            } else {
              directionCopy = `Plan changes take effect immediately.`;
            }

            return (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-gray-800">
                Switch to {selectedPlan?.label}?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setChangePeriod("monthly")}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    changePeriod === "monthly"
                      ? "border-green-600 bg-green-50 text-green-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  Monthly · ${selectedPlan?.monthly}/mo
                </button>
                <button
                  onClick={() => setChangePeriod("annual")}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    changePeriod === "annual"
                      ? "border-green-600 bg-green-50 text-green-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  Annual · ${selectedPlan?.annual}/yr · 12-month commitment
                </button>
              </div>
              <div className="rounded-md bg-white border border-gray-200 px-3 py-2 text-sm">
                <span className="text-gray-500">You&apos;ll be billed </span>
                <span className="font-semibold text-gray-900">${billedAmount} {billedSuffix}</span>
                <span className="text-gray-500"> going forward.</span>
              </div>
              <p className="text-xs text-gray-600">
                {directionCopy}
              </p>
              <p className="text-xs text-gray-400 border-t border-gray-200 pt-2">
                Plan changes apply immediately. The only exception is switching from annual to monthly, which takes effect at your next renewal because annual is a 12-month commitment.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleChangePlan}
                  disabled={busy || (changePlanKey === currentPlan && changePeriod === currentPeriod)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {busy ? busyLabel : confirmLabel}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setChangePlanKey(null)}>
                  Never mind
                </Button>
              </div>
            </div>
            );
          })() : (
            <div className="space-y-1">
              {CHANGE_PLANS.map((p) => {
                const isCurrent = p.key === currentPlan;
                return (
                  <div
                    key={p.key}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      isCurrent ? "bg-green-50 border border-green-200" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isCurrent ? "text-green-800" : "text-gray-700"}`}>
                          {p.label}
                        </span>
                        <span className="text-xs text-gray-400">
                          ${p.monthly}/mo · ${p.annual}/yr
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{p.summary}</p>
                    </div>
                    {isCurrent ? (
                      <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    ) : (
                      <button
                        onClick={() => setChangePlanKey(p.key)}
                        className="text-xs font-medium text-green-700 hover:text-green-900 underline"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pause and Cancel — only for active paid subscribers */}
      {showSubscriptionControls && !isTrial && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Subscription options</p>

          {/* Pause */}
          {isPaused ? (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-amber-800">Billing is paused</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Resumes {pausedUntil ? new Date(pausedUntil).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "automatically"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={handleResume}
                disabled={busy}
              >
                <PlayCircle className="w-4 h-4" />
                {busy ? "Resuming…" : "Resume now"}
              </Button>
            </div>
          ) : canPauseSubscription && dialog !== "cancel" ? (
            dialog === "pause" ? (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-3">
                <p className="text-sm font-medium text-gray-800">Pause billing for winter. How long?</p>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5, 6].map((m) => (
                    <button
                      key={m}
                      onClick={() => setPauseMonths(m)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        pauseMonths === m
                          ? "border-green-600 bg-green-50 text-green-700 font-medium"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {m} month{m !== 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Your plan and all data are preserved. Billing resumes automatically.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handlePause}
                    disabled={busy}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {busy ? "Pausing…" : `Pause for ${pauseMonths} month${pauseMonths !== 1 ? "s" : ""}`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setDialog("pause")}
                className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 font-medium"
              >
                <PauseCircle className="w-4 h-4" />
                Pause billing for winter
              </button>
            )
          ) : null}

          {/* Cancel */}
          {dialog === "cancel" ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-red-800">Cancel your subscription?</p>
              <p className="text-xs text-red-600">
                You keep full access until{" "}
                {currentPeriodEnd
                  ? new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                  : "the end of your billing period"}
                . After that, your data is retained for 30 days before deletion.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  {busy ? "Canceling…" : "Yes, cancel my subscription"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                  Keep my plan
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDialog("cancel")}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              <XCircle className="w-4 h-4" />
              Cancel subscription
            </button>
          )}
        </div>
      )}

      {/* Trial upgrade prompt */}
      {isTrial && (
        <NotInApp>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-500 mb-2">
              Unlock unlimited recommendations, multiple yards, and more.
            </p>
            <Link href="/pricing">
              <Button className="bg-green-600 hover:bg-green-700 w-full">See all plans</Button>
            </Link>
          </div>
        </NotInApp>
      )}

      {downgradeTarget && (
        <DowngradeModal
          targetPlan={downgradeTarget}
          targetPlanLabel={PLAN_LABELS[downgradeTarget] ?? downgradeTarget}
          newMaxYards={getPlanLimits({ plan: downgradeTarget, planStatus, trialEndsAt: null }).maxYards}
          yards={yards}
          currentPeriod={changePeriod}
          onClose={() => setDowngradeTarget(null)}
          onSuccess={() => {
            setDowngradeTarget(null);
            window.location.reload();
          }}
        />
      )}
      {showDeleteArchived && (
        <DeleteArchivedModal
          archivedCount={archivedCount}
          onClose={() => setShowDeleteArchived(false)}
          onSuccess={() => {
            setShowDeleteArchived(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
