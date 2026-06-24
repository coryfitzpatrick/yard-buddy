import { db } from "@/lib/db";
import { DAY_MS, TRIAL_ENGAGEMENT_BONUS_DAYS, TRIAL_GRACE_DAYS } from "@/lib/time";

// "admin" is a hidden, unlimited plan — not exposed on the pricing page or in
// Stripe checkout. Assigned manually via scripts/grant-pro.ts for demo accounts
// and internal use.
export type Plan = "trial" | "home_basic" | "home_plus" | "professional" | "admin";
export type PlanStatus = "trialing" | "active" | "past_due" | "expired" | "canceled";

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
  trialEngagementBonusGrantedAt?: Date | null;
};

export interface EngagementSignals {
  anyScheduleSet: boolean;
  anyTaskCompleted: boolean;
}

export interface EngagementStatus {
  scheduleSet: boolean;
  taskCompleted: boolean;
  bonusEarned: boolean;          // both criteria met AND bonus not yet granted
  bonusAlreadyGranted: boolean;
}

export function computeEngagementStatus(
  user: SubscriptionUser,
  signals: EngagementSignals,
): EngagementStatus {
  const bonusAlreadyGranted = user.trialEngagementBonusGrantedAt != null;
  const scheduleSet = signals.anyScheduleSet;
  const taskCompleted = signals.anyTaskCompleted;
  return {
    scheduleSet,
    taskCompleted,
    bonusAlreadyGranted,
    bonusEarned: scheduleSet && taskCompleted && !bonusAlreadyGranted,
  };
}

const LIMITS: Record<string, PlanLimits> = {
  trial:        { maxYards: 1,  maxAnalysesPerYardPerMonth: 2,  maxVisibleTasks: 1,  canRunAnalysis: true  },
  expired:      { maxYards: 1,  maxAnalysesPerYardPerMonth: 0,  maxVisibleTasks: 1,  canRunAnalysis: false },
  // Same shape as expired but with a different meaning: billing is recoverable
  // and there's no deletion clock. Used when planStatus === "past_due" (which
  // covers Stripe past_due, incomplete, unpaid, and paused — see webhook).
  past_due:     { maxYards: 1,  maxAnalysesPerYardPerMonth: 0,  maxVisibleTasks: 1,  canRunAnalysis: false },
  home_basic:   { maxYards: 1,  maxAnalysesPerYardPerMonth: 4,  maxVisibleTasks: -1, canRunAnalysis: true  },
  home_plus:    { maxYards: 2,  maxAnalysesPerYardPerMonth: 8,  maxVisibleTasks: -1, canRunAnalysis: true  },
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

// Used to decide upgrade vs downgrade for plan changes.
const TIER_RANK: Record<string, number> = {
  trial:        0,
  home_basic:   1,
  home_plus:    2,
  professional: 3,
  admin:        4,
};

export function tierRank(plan: string): number {
  return TIER_RANK[plan] ?? 0;
}

export function isTierUpgrade(from: string, to: string): boolean {
  return tierRank(to) > tierRank(from);
}

export function isTierDowngrade(from: string, to: string): boolean {
  return tierRank(to) < tierRank(from);
}

export function isEffectivelyExpired(user: SubscriptionUser): boolean {
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
  // past_due is intentionally NOT in isEffectivelyExpired — billing can still
  // be recovered with a card update, so we don't want to start the deletion
  // clock. But while in this state, paid features are gated.
  if (user.planStatus === "past_due") return LIMITS.past_due;
  if (user.planStatus === "trialing" || user.plan === "trial") return LIMITS.trial;
  return LIMITS[user.plan] ?? LIMITS.trial;
}

// Returns the cutoff date for counting "this month's" analyses. Normally this
// is start of the calendar month, but if the user has an analysisQuotaResetAt
// in the current month (set when they first transitioned from trial to paid),
// we use that timestamp so trial usage doesn't dock the new plan's first
// month. Once the calendar rolls over, the field has no effect.
export function analysisCutoff(args: { analysisQuotaResetAt: Date | null | undefined; now?: Date }): Date {
  const now = args.now ?? new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (args.analysisQuotaResetAt && args.analysisQuotaResetAt > startOfMonth) {
    return args.analysisQuotaResetAt;
  }
  return startOfMonth;
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

export function hasEverPaid(user: { stripeCustomerId?: string | null }): boolean {
  return user.stripeCustomerId != null;
}

export function eligiblePlansForUser(user: { stripeCustomerId?: string | null }): Plan[] {
  const paidPlans: Plan[] = ["home_basic", "home_plus", "professional"];
  return hasEverPaid(user) ? paidPlans : ["trial", ...paidPlans];
}

export async function getActiveYardCount(userId: string): Promise<number> {
  return db.yard.count({ where: { userId, archivedAt: null } });
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

export async function userHasAnySchedule(userId: string): Promise<boolean> {
  const result = await db.yard.findFirst({
    where: {
      userId,
      archivedAt: null,
      OR: [
        { wateringDays: { isEmpty: false } },
        { mowingDays: { isEmpty: false } },
        { sections: { some: { OR: [{ wateringDays: { isEmpty: false } }, { mowingDays: { isEmpty: false } }] } } },
      ],
    },
    select: { id: true },
  });
  return result != null;
}

export async function userHasAnyCompletedTask(userId: string): Promise<boolean> {
  const result = await db.lawnTask.findFirst({
    where: {
      completedAt: { not: null },
      yardSection: { yard: { userId, archivedAt: null } },
    },
    select: { id: true },
  });
  return result != null;
}

export type GrantResult =
  | { granted: true; newTrialEndsAt: Date }
  | { granted: false; reason: "already_granted" | "not_trialing" | "not_eligible" | "user_not_found" };

export async function grantEngagementBonusIfEligible(userId: string): Promise<GrantResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      trialEngagementBonusGrantedAt: true,
    },
  });
  if (!user) return { granted: false, reason: "user_not_found" };
  if (user.trialEngagementBonusGrantedAt) return { granted: false, reason: "already_granted" };
  const isTrial = user.planStatus === "trialing" || user.plan === "trial";
  if (!isTrial) return { granted: false, reason: "not_trialing" };

  const [scheduleSet, taskCompleted] = await Promise.all([
    userHasAnySchedule(userId),
    userHasAnyCompletedTask(userId),
  ]);
  if (!scheduleSet || !taskCompleted) return { granted: false, reason: "not_eligible" };

  const newTrialEndsAt = new Date(
    (user.trialEndsAt?.getTime() ?? Date.now()) + TRIAL_ENGAGEMENT_BONUS_DAYS * DAY_MS,
  );
  const updated = await db.user.updateMany({
    where: { id: userId, trialEngagementBonusGrantedAt: null },
    data: {
      trialEndsAt: newTrialEndsAt,
      trialEngagementBonusGrantedAt: new Date(),
    },
  });
  if (updated.count === 0) return { granted: false, reason: "already_granted" };
  return { granted: true, newTrialEndsAt };
}

