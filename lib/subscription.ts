export type Plan = "trial" | "home_basic" | "home_plus" | "professional" | "professional_plus";
export type PlanStatus = "trialing" | "active" | "paused" | "expired" | "canceled";

export interface PlanLimits {
  maxYards: number;                       // -1 = unlimited
  maxAnalysesPerSectionPerMonth: number;  // -1 = unlimited, 0 = blocked
  maxVisibleTasks: number;                // -1 = unlimited, 1 = first task only
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
  trial:             { maxYards: 1,  maxAnalysesPerSectionPerMonth: 1,  maxVisibleTasks: 1,  canRunAnalysis: true  },
  expired:           { maxYards: 1,  maxAnalysesPerSectionPerMonth: 0,  maxVisibleTasks: 1,  canRunAnalysis: false },
  home_basic:        { maxYards: 1,  maxAnalysesPerSectionPerMonth: 2,  maxVisibleTasks: -1, canRunAnalysis: true  },
  home_plus:         { maxYards: 3,  maxAnalysesPerSectionPerMonth: 3,  maxVisibleTasks: -1, canRunAnalysis: true  },
  professional:      { maxYards: 10, maxAnalysesPerSectionPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true  },
  professional_plus: { maxYards: -1, maxAnalysesPerSectionPerMonth: -1, maxVisibleTasks: -1, canRunAnalysis: true  },
};

export const PLAN_LABELS: Record<string, string> = {
  trial:             "Free Trial",
  home_basic:        "Home Basic",
  home_plus:         "Home Plus",
  professional:      "Professional",
  professional_plus: "Professional Plus",
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

export function canRunAnalysis(user: SubscriptionUser, currentMonthCount: number): boolean {
  const limits = getPlanLimits(user);
  if (!limits.canRunAnalysis) return false;
  if (limits.maxAnalysesPerSectionPerMonth === -1) return true;
  return currentMonthCount < limits.maxAnalysesPerSectionPerMonth;
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
  const expiryDate = user.trialEndsAt ?? user.currentPeriodEnd ?? new Date(0);
  const deleteAt = new Date(expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((deleteAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
