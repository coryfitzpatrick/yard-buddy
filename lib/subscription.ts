import { DAY_MS, TRIAL_GRACE_DAYS } from "@/lib/time";

// "admin" is a hidden, unlimited plan — not exposed on the pricing page or in
// Stripe checkout. Assigned manually via scripts/grant-pro.ts for demo accounts
// and internal use.
export type Plan = "trial" | "home_basic" | "home_plus" | "professional" | "admin";
export type PlanStatus = "trialing" | "active" | "past_due" | "paused" | "expired" | "canceled";

export interface PlanLimits {
  maxYards: number;                     // -1 = unlimited
  maxAnalysesPerYardPerMonth: number;   // -1 = unlimited, 0 = blocked
  maxVisibleTasks: number;              // -1 = unlimited, 1 = first task only
  canRunAnalysis: boolean;
}

export type SubscriptionUser = {
  plan: Plan | string;
  planStatus: PlanStatus | string;
  trialEndsAt: Date | null;
  currentPeriodEnd?: Date | null;
  pausedUntil?: Date | null;
};

const LIMITS: Record<string, PlanLimits> = {
  trial:        { maxYards: 1,  maxAnalysesPerYardPerMonth: 2,  maxVisibleTasks: 1,  canRunAnalysis: true  },
  expired:      { maxYards: 1,  maxAnalysesPerYardPerMonth: 0,  maxVisibleTasks: 1,  canRunAnalysis: false },
  home_basic:   { maxYards: 1,  maxAnalysesPerYardPerMonth: 8,  maxVisibleTasks: -1, canRunAnalysis: true  },
  home_plus:    { maxYards: 3,  maxAnalysesPerYardPerMonth: 8,  maxVisibleTasks: -1, canRunAnalysis: true  },
  professional: { maxYards: 10, maxAnalysesPerYardPerMonth: 8,  maxVisibleTasks: -1, canRunAnalysis: true  },
  admin:        { maxYards: -1, maxAnalysesPerYardPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true  },
};

export const PLAN_LABELS: Record<string, string> = {
  trial:        "Free Trial",
  home_basic:   "Home Basic",
  home_plus:    "Home Plus",
  professional: "Professional",
  admin:        "Admin",
};

function isEffectivelyExpired(user: SubscriptionUser): boolean {
  if (user.planStatus === "expired" || user.planStatus === "canceled") return true;
  if (
    (user.planStatus === "trialing" || user.plan === "trial") &&
    user.trialEndsAt &&
    user.trialEndsAt <= new Date()
  ) return true;
  return false;
}

export function getPlanLimits(user: SubscriptionUser): PlanLimits {
  if (isEffectivelyExpired(user)) return LIMITS.expired;
  if (user.planStatus === "trialing" || user.plan === "trial") return LIMITS.trial;
  return LIMITS[user.plan] ?? LIMITS.trial;
}

export function canRunAnalysis(user: SubscriptionUser, currentYardMonthCount: number): boolean {
  const limits = getPlanLimits(user);
  if (!limits.canRunAnalysis) return false;
  if (limits.maxAnalysesPerYardPerMonth === -1) return true;
  return currentYardMonthCount < limits.maxAnalysesPerYardPerMonth;
}

export function canCreateYard(user: SubscriptionUser, currentYardCount: number): boolean {
  const limits = getPlanLimits(user);
  if (limits.maxYards === -1) return true;
  return currentYardCount < limits.maxYards;
}

export function canPause(user: SubscriptionUser): boolean {
  if (user.planStatus !== "active") return false;
  if (user.plan === "trial") return false;
  return true;
}

export function getVisibleTasksArgs(user: SubscriptionUser): { take?: number } {
  const limits = getPlanLimits(user);
  if (limits.maxVisibleTasks === -1) return {};
  return { take: limits.maxVisibleTasks };
}

export function getDaysUntilDeletion(user: SubscriptionUser): number | null {
  if (!isEffectivelyExpired(user)) return null;
  const expiryDate = user.trialEndsAt ?? user.currentPeriodEnd;
  if (!expiryDate) return null;
  const deleteAt = new Date(expiryDate.getTime() + TRIAL_GRACE_DAYS * DAY_MS);
  return Math.ceil((deleteAt.getTime() - Date.now()) / DAY_MS);
}

export function daysUntilTrialEnd(trialEndsAt: Date | null | undefined): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / DAY_MS));
}
