import { describe, it, expect } from "vitest";
import { computeEngagementStatus } from "@/lib/subscription";
import { db } from "@/lib/db";
import { grantEngagementBonusIfEligible } from "@/lib/subscription";

describe("computeEngagementStatus", () => {
  const baseUser = {
    plan: "trial",
    planStatus: "trialing",
    trialEndsAt: new Date(Date.now() + 14 * 86400 * 1000),
    trialEngagementBonusGrantedAt: null,
  };

  it("returns scheduleSet=false when no yards or sections have schedule", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: false, anyTaskCompleted: false });
    expect(r.scheduleSet).toBe(false);
    expect(r.taskCompleted).toBe(false);
    expect(r.bonusEarned).toBe(false);
  });

  it("returns scheduleSet=true when anyScheduleSet=true", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: true, anyTaskCompleted: false });
    expect(r.scheduleSet).toBe(true);
    expect(r.bonusEarned).toBe(false);
  });

  it("returns bonusEarned=false until both schedule and task are set", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: true, anyTaskCompleted: false });
    expect(r.bonusEarned).toBe(false);
  });

  it("returns bonusEarned=true when both schedule and task are set and bonus not yet granted", () => {
    const r = computeEngagementStatus(baseUser, { anyScheduleSet: true, anyTaskCompleted: true });
    expect(r.bonusEarned).toBe(true);
  });

  it("returns bonusEarned=false (already granted) when trialEngagementBonusGrantedAt is set", () => {
    const u = { ...baseUser, trialEngagementBonusGrantedAt: new Date() };
    const r = computeEngagementStatus(u, { anyScheduleSet: true, anyTaskCompleted: true });
    expect(r.bonusEarned).toBe(false);
    expect(r.bonusAlreadyGranted).toBe(true);
  });
});

describe("grantEngagementBonusIfEligible", () => {
  it("is idempotent — returns granted=false when already granted", async () => {
    // This is a unit-level expectation. The full DB integration is covered by
    // higher-level tests on the write endpoints. We assert the helper's
    // observable behavior with a stubbed user lookup.
    const userId = "stub-user-id";
    const fakeUser = {
      id: userId,
      plan: "trial",
      planStatus: "trialing",
      trialEndsAt: new Date(),
      trialEngagementBonusGrantedAt: new Date(),
    };
    // Stub Prisma findUnique to return the already-granted user.
    const orig = db.user.findUnique;
    db.user.findUnique = (async () => fakeUser) as typeof db.user.findUnique;
    try {
      const result = await grantEngagementBonusIfEligible(userId);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe("already_granted");
    } finally {
      db.user.findUnique = orig;
    }
  });
});
