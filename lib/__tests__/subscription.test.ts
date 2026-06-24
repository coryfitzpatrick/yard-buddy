import { describe, it, expect } from "vitest";
import {
  getPlanLimits,
  canRunAnalysis,
  canCreateYard,
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
  ...overrides,
});

describe("getPlanLimits", () => {
  it("returns trial limits for an active trial user", () => {
    const limits = getPlanLimits(makeUser({}));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerYardPerMonth).toBe(2);
    expect(limits.maxVisibleTasks).toBe(1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when trial has passed", () => {
    const limits = getPlanLimits(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }));
    expect(limits.maxAnalysesPerYardPerMonth).toBe(0);
    expect(limits.canRunAnalysis).toBe(false);
    expect(limits.maxVisibleTasks).toBe(1);
  });

  it("returns home_basic limits for active home_basic subscriber", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_basic", planStatus: "active", trialEndsAt: null }));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerYardPerMonth).toBe(4);
    expect(limits.maxVisibleTasks).toBe(-1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns home_plus limits for home_plus plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_plus", planStatus: "active" }));
    expect(limits.maxYards).toBe(2);
    expect(limits.maxAnalysesPerYardPerMonth).toBe(8);
  });

  it("returns 10 yards and 8 analyses per yard for professional plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "professional", planStatus: "active" }));
    expect(limits.maxYards).toBe(10);
    expect(limits.maxAnalysesPerYardPerMonth).toBe(8);
  });

  it("returns unlimited everything for the hidden admin plan", () => {
    const limits = getPlanLimits(makeUser({ plan: "admin", planStatus: "active" }));
    expect(limits.maxYards).toBe(-1);
    expect(limits.maxAnalysesPerYardPerMonth).toBe(-1);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("returns expired limits when planStatus is canceled", () => {
    const limits = getPlanLimits(makeUser({ planStatus: "canceled" }));
    expect(limits.canRunAnalysis).toBe(false);
  });
});

describe("canRunAnalysis", () => {
  it("allows when under yard monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_basic", planStatus: "active" }), 3)).toBe(true);
  });

  it("blocks when at yard monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_basic", planStatus: "active" }), 4)).toBe(false);
  });

  it("blocks professional when at yard monthly limit", () => {
    expect(canRunAnalysis(makeUser({ plan: "professional", planStatus: "active" }), 8)).toBe(false);
  });

  it("never blocks admin plan no matter how many runs", () => {
    expect(canRunAnalysis(makeUser({ plan: "admin", planStatus: "active" }), 9999)).toBe(true);
  });

  it("blocks when expired", () => {
    expect(canRunAnalysis(makeUser({ trialEndsAt: new Date(Date.now() - 1000) }), 0)).toBe(false);
  });
});

describe("canCreateYard", () => {
  it("allows when under limit", () => {
    expect(canCreateYard(makeUser({ plan: "home_plus", planStatus: "active" }), 1)).toBe(true);
  });

  it("blocks when at limit", () => {
    expect(canCreateYard(makeUser({ plan: "home_plus", planStatus: "active" }), 2)).toBe(false);
  });

  it("blocks professional past 10 yards", () => {
    expect(canCreateYard(makeUser({ plan: "professional", planStatus: "active" }), 10)).toBe(false);
  });

  it("allows unlimited yards for admin plan", () => {
    expect(canCreateYard(makeUser({ plan: "admin", planStatus: "active" }), 9999)).toBe(true);
  });
});

describe("past_due planStatus", () => {
  it("returns full plan limits when planStatus is past_due", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_basic", planStatus: "past_due" }));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerYardPerMonth).toBe(4);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("allows canRunAnalysis when planStatus is past_due", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_plus", planStatus: "past_due" }), 7)).toBe(true);
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
  });
});
