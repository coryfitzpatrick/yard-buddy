import { describe, it, expect } from "vitest";
import {
  getPlanLimits,
  canRunAnalysis,
  canCreateYard,
  canPause,
  getVisibleTasksArgs,
  getDaysUntilDeletion,
  PLAN_LABELS,
  type SubscriptionUser,
} from "../subscription";

const makeUser = (overrides: Partial<SubscriptionUser>) => ({
  plan: "trial",
  planStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  currentPeriodEnd: null,
  pausedUntil: null,
  ...overrides,
});

describe("getPlanLimits", () => {
  it("returns trial limits for an active trial user", () => {
    const limits = getPlanLimits(makeUser({}));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(1);
    expect(limits.maxVisibleTasks).toBe(1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when trial has passed", () => {
    const limits = getPlanLimits(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }));
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(0);
    expect(limits.canRunAnalysis).toBe(false);
    expect(limits.maxVisibleTasks).toBe(1);
  });

  it("returns home_basic limits for active home_basic subscriber", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_basic", planStatus: "active", trialEndsAt: null }));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(2);
    expect(limits.maxVisibleTasks).toBe(-1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns home_plus limits for home_plus plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_plus", planStatus: "active" }));
    expect(limits.maxYards).toBe(3);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(3);
  });

  it("returns 10 yards and unlimited analyses for professional plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "professional", planStatus: "active" }));
    expect(limits.maxYards).toBe(10);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(-1);
  });

  it("returns unlimited yards for professional_plus plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "professional_plus", planStatus: "active" }));
    expect(limits.maxYards).toBe(-1);
  });

  it("returns full plan access when paused", () => {
    const limits = getPlanLimits(makeUser({
      plan: "home_basic",
      planStatus: "paused",
      pausedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }));
    expect(limits.maxYards).toBe(1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when planStatus is canceled", () => {
    const limits = getPlanLimits(makeUser({ planStatus: "canceled" }));
    expect(limits.canRunAnalysis).toBe(false);
  });
});

describe("canRunAnalysis", () => {
  it("allows when under monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_basic", planStatus: "active" }), 1)).toBe(true);
  });

  it("blocks when at monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_basic", planStatus: "active" }), 2)).toBe(false);
  });

  it("always allows when limit is -1 (unlimited)", () => {
    expect(canRunAnalysis(makeUser({ plan: "professional", planStatus: "active" }), 100)).toBe(true);
  });

  it("blocks when expired", () => {
    expect(canRunAnalysis(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }), 0)).toBe(false);
  });
});

describe("canCreateYard", () => {
  it("allows when under limit", () => {
    expect(canCreateYard(makeUser({ plan: "home_plus", planStatus: "active" }), 2)).toBe(true);
  });

  it("blocks when at limit", () => {
    expect(canCreateYard(makeUser({ plan: "home_plus", planStatus: "active" }), 3)).toBe(false);
  });

  it("allows unlimited yards for professional_plus", () => {
    expect(canCreateYard(makeUser({ plan: "professional_plus", planStatus: "active" }), 999)).toBe(true);
  });
});

describe("canPause", () => {
  it("allows pause for active paid subscriber", () => {
    expect(canPause(makeUser({ plan: "home_basic", planStatus: "active" }))).toBe(true);
  });

  it("blocks pause for trial user", () => {
    expect(canPause(makeUser({ plan: "trial", planStatus: "trialing" }))).toBe(false);
  });

  it("blocks pause for expired user", () => {
    expect(canPause(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }))).toBe(false);
  });

  it("blocks pause when already paused", () => {
    expect(canPause(makeUser({ plan: "home_basic", planStatus: "paused" }))).toBe(false);
  });

  it("blocks pause for user with planStatus trialing even if plan is different", () => {
    expect(canPause(makeUser({ plan: "home_basic", planStatus: "trialing" }))).toBe(false);
  });

  it("blocks pause for user with plan trial even if planStatus is active", () => {
    expect(canPause(makeUser({ plan: "trial", planStatus: "active" }))).toBe(false);
  });
});

describe("getVisibleTasksArgs", () => {
  it("returns {take: 1} for trial user", () => {
    const args = getVisibleTasksArgs(makeUser({}));
    expect(args.take).toBe(1);
  });

  it("returns {} for paid user (no limit)", () => {
    const args = getVisibleTasksArgs(makeUser({ plan: "home_basic", planStatus: "active" }));
    expect(args.take).toBeUndefined();
  });
});

describe("getDaysUntilDeletion", () => {
  it("returns null for active paid users", () => {
    expect(getDaysUntilDeletion(makeUser({ plan: "home_basic", planStatus: "active" }))).toBeNull();
  });

  it("returns positive number during grace period", () => {
    const expired = makeUser({ trialEndsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
    const days = getDaysUntilDeletion(expired);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("returns 0 or negative when deletion is overdue", () => {
    const longExpired = makeUser({ trialEndsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) });
    const days = getDaysUntilDeletion(longExpired);
    expect(days).toBeLessThanOrEqual(0);
  });

  it("returns positive number for canceled paid subscriber within 30-day grace using currentPeriodEnd", () => {
    const canceledPaid = makeUser({
      plan: "home_basic",
      planStatus: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    const days = getDaysUntilDeletion(canceledPaid);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });
});

describe("PLAN_LABELS", () => {
  it("has correct display labels for all plans", () => {
    expect(PLAN_LABELS.trial).toBe("Free Trial");
    expect(PLAN_LABELS.home_basic).toBe("Home Basic");
    expect(PLAN_LABELS.home_plus).toBe("Home Plus");
    expect(PLAN_LABELS.professional).toBe("Professional");
    expect(PLAN_LABELS.professional_plus).toBe("Professional Plus");
  });
});
