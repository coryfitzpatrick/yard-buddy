import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    STRIPE_PRICES: {
      home_basic:   { monthly: "price_home_basic_monthly", annual: "price_home_basic_annual" },
      home_plus:    { monthly: "price_home_plus_monthly",  annual: "price_home_plus_annual" },
      professional: { monthly: "price_pro_monthly",        annual: "price_pro_annual" },
    },
    planFromPriceId: (priceId: string) => {
      if (priceId === "price_home_basic_monthly" || priceId === "price_home_basic_annual") return "home_basic";
      if (priceId === "price_home_plus_monthly"  || priceId === "price_home_plus_annual")  return "home_plus";
      if (priceId === "price_pro_monthly"        || priceId === "price_pro_annual")        return "professional";
      return null;
    },
  };
});

vi.mock("@/lib/db", () => {
  // Hoist-friendly tx-aware mock: $transaction calls back with a transaction
  // client that delegates to the same fns the tests inspect, so a single
  // assertion can verify writes inside the transaction.
  const tx = {
    user: { update: vi.fn() },
    yard: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  };
  return {
    db: {
      user: { findUnique: vi.fn(), update: tx.user.update },
      yard: { count: tx.yard.count, findMany: tx.yard.findMany, updateMany: tx.yard.updateMany },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };
});

import { updateUserFromSubscription } from "../route";
import { db } from "@/lib/db";

function subscription(overrides: {
  status?: Stripe.Subscription.Status;
  customer?: string;
  priceId?: string;
  currentPeriodEnd?: number | null;
} = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: overrides.customer ?? "cus_1",
    status: overrides.status ?? "active",
    items: {
      data: [{
        id: "si_1",
        price: { id: overrides.priceId ?? "price_home_basic_monthly" },
        current_period_end: overrides.currentPeriodEnd ?? 1_900_000_000,
      }],
    },
  } as unknown as Stripe.Subscription;
}

describe("updateUserFromSubscription", () => {
  beforeEach(() => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockReset();
    (db.user.update as ReturnType<typeof vi.fn>).mockReset();
    (db.yard.count as ReturnType<typeof vi.fn>).mockReset();
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockReset();
    (db.yard.updateMany as ReturnType<typeof vi.fn>).mockReset();
    (db.$transaction as ReturnType<typeof vi.fn>).mockClear();
    (db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.yard.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
  });

  it("contract #1: trial → paid sets analysisQuotaResetAt to now", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "trial", planStatus: "trialing",
    });

    const before = new Date();
    await updateUserFromSubscription(subscription({ priceId: "price_home_basic_monthly" }));
    const after = new Date();

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.plan).toBe("home_basic");
    expect(updateCall.data.planStatus).toBe("active");
    expect(updateCall.data.analysisQuotaResetAt).toBeInstanceOf(Date);
    expect(updateCall.data.analysisQuotaResetAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updateCall.data.analysisQuotaResetAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("contract #2: paid → paid tier change does NOT touch analysisQuotaResetAt", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_basic", planStatus: "active",
    });

    await updateUserFromSubscription(subscription({ priceId: "price_home_plus_monthly" }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.plan).toBe("home_plus");
    expect(updateCall.data).not.toHaveProperty("analysisQuotaResetAt");
  });

  it("contract #3: no-op only when plan, planStatus, currentPeriodEnd, and subscriptionId all match", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      plan: "home_basic",
      planStatus: "active",
      currentPeriodEnd: new Date(1_900_000_000 * 1000),
      stripeSubscriptionId: "sub_1",
    });

    await updateUserFromSubscription(subscription({ priceId: "price_home_basic_monthly" }));

    expect((db.user.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("contract #3b (renewal): plan+status unchanged but current_period_end advanced → DB update persists new period end", async () => {
    // This is the bug we fixed: a renewal that bumps current_period_end with
    // no change to plan/status MUST still write through, or the "Next charge
    // on [date]" copy in the UI sticks at the prior renewal date.
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      plan: "home_basic",
      planStatus: "active",
      currentPeriodEnd: new Date(1_800_000_000 * 1000), // stale
      stripeSubscriptionId: "sub_1",
    });

    await updateUserFromSubscription(subscription({
      priceId: "price_home_basic_monthly",
      currentPeriodEnd: 1_900_000_000, // fresh from Stripe
    }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.currentPeriodEnd.getTime()).toBe(1_900_000_000 * 1000);
  });

  it("contract #3c: subscription id drift → DB update persists the new sub id", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      plan: "home_basic",
      planStatus: "active",
      currentPeriodEnd: new Date(1_900_000_000 * 1000),
      stripeSubscriptionId: "sub_old",
    });

    await updateUserFromSubscription(subscription({ priceId: "price_home_basic_monthly" }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.stripeSubscriptionId).toBe("sub_1");
  });

  it("contract #4: status canceled → planStatus = canceled", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_plus", planStatus: "active",
    });

    await updateUserFromSubscription(subscription({ status: "canceled", priceId: "price_home_plus_monthly" }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.planStatus).toBe("canceled");
  });

  it("contract #4b: status past_due → planStatus = past_due", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_plus", planStatus: "active",
    });

    await updateUserFromSubscription(subscription({ status: "past_due", priceId: "price_home_plus_monthly" }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.planStatus).toBe("past_due");
  });

  it("contract #4c: status paused → planStatus = past_due (NEVER expired)", async () => {
    // Paused isn't a state we ship today, but if Stripe ever surfaces it
    // (admin action, future feature) we must NOT flip the user to expired,
    // which would start the 30-day account-deletion clock.
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_plus", planStatus: "active",
    });

    await updateUserFromSubscription(subscription({ status: "paused" as never, priceId: "price_home_plus_monthly" }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.planStatus).toBe("past_due");
  });

  it("contract #5: plan increase to a higher yard limit auto-restores most recently archived yards up to the new cap", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_basic", planStatus: "active",
    });
    // home_plus has maxYards=2; user has 0 active and 3 archived
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "y_1" }, { id: "y_2" },
    ]);

    await updateUserFromSubscription(subscription({ priceId: "price_home_plus_monthly" }));

    // restoreCount = newMax(2) - activeCount(0) = 2
    expect((db.yard.findMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u1", archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: 2,
    }));
    expect((db.yard.updateMany as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      where: { id: { in: ["y_1", "y_2"] } },
      data: { archivedAt: null },
    });
  });

  it("unknown customer → no-op (don't blow up on a Stripe event for a non-app customer)", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await updateUserFromSubscription(subscription());

    expect((db.user.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("unrecognized price → throws (signals a misconfigured STRIPE_PRICE_* env)", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_basic", planStatus: "active",
    });

    await expect(
      updateUserFromSubscription(subscription({ priceId: "price_phantom" })),
    ).rejects.toThrow(/Unrecognized priceId/);
  });

  it("user update + yard restore happen inside a single $transaction (atomicity)", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "home_basic", planStatus: "active",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "y_1" }]);

    await updateUserFromSubscription(subscription({ priceId: "price_home_plus_monthly" }));

    expect((db.$transaction as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it("currentPeriodEnd is persisted as Date from Stripe's unix seconds", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", plan: "trial", planStatus: "trialing",
    });

    await updateUserFromSubscription(subscription({
      priceId: "price_home_basic_monthly",
      currentPeriodEnd: 1_900_000_000,
    }));

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.currentPeriodEnd).toBeInstanceOf(Date);
    expect(updateCall.data.currentPeriodEnd.getTime()).toBe(1_900_000_000 * 1000);
  });
});
