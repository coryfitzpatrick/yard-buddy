import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

const {
  mockSubscriptionsRetrieve,
  mockSubscriptionsUpdate,
  mockSchedulesCreate,
  mockSchedulesUpdate,
  mockSchedulesRelease,
} = vi.hoisted(() => ({
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
  mockSchedulesCreate: vi.fn(),
  mockSchedulesUpdate: vi.fn(),
  mockSchedulesRelease: vi.fn(),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    STRIPE_PRICES: {
      home_basic:   { monthly: "price_home_basic_monthly", annual: "price_home_basic_annual" },
      home_plus:    { monthly: "price_home_plus_monthly",  annual: "price_home_plus_annual" },
      professional: { monthly: "price_pro_monthly",        annual: "price_pro_annual" },
    },
    stripe: {
      subscriptions: {
        retrieve: mockSubscriptionsRetrieve,
        update: mockSubscriptionsUpdate,
      },
      subscriptionSchedules: {
        create: mockSchedulesCreate,
        update: mockSchedulesUpdate,
        release: mockSchedulesRelease,
      },
    },
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    yard: {
      count: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { POST } from "../route";
import { db } from "@/lib/db";

function jsonRequest(body: unknown) {
  return new Request("http://test.local/api/stripe/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("change-plan route", () => {
  beforeEach(() => {
    mockSubscriptionsRetrieve.mockReset();
    mockSubscriptionsUpdate.mockReset();
    mockSchedulesCreate.mockReset();
    mockSchedulesUpdate.mockReset();
    mockSchedulesRelease.mockReset();
    (db.user.update as ReturnType<typeof vi.fn>).mockClear();
    // Default: subscription on monthly Plus, no pending schedule
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_monthly" } }] },
      schedule: null,
    });
    mockSubscriptionsUpdate.mockResolvedValue({ id: "sub_1" });
    mockSchedulesCreate.mockResolvedValue({
      id: "schd_1",
      phases: [{ start_date: 1_700_000_000, end_date: 1_730_000_000 }],
    });
    mockSchedulesUpdate.mockResolvedValue({ id: "schd_1" });
    mockSchedulesRelease.mockResolvedValue({ id: "schd_1" });
  });

  it("contract #1: monthly tier upgrade is immediate, no schedule", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_basic",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_basic_monthly" } }] },
      schedule: null,
    });

    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: false });
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", expect.objectContaining({
      items: [{ id: "si_1", price: "price_home_plus_monthly" }],
      proration_behavior: "always_invoice",
    }));
    expect(mockSchedulesCreate).not.toHaveBeenCalled();
  });

  it("contract #5: annual tier upgrade same cadence is immediate, no schedule", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_basic",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_basic_annual" } }] },
      schedule: null,
    });

    const res = await POST(jsonRequest({ plan: "home_plus", period: "annual" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: false });
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", expect.objectContaining({
      items: [{ id: "si_1", price: "price_home_plus_annual" }],
    }));
    expect(mockSchedulesCreate).not.toHaveBeenCalled();
  });

  it("contract #9: immediate path releases any pre-existing schedule first", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_basic",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_basic_monthly" } }] },
      schedule: "schd_old",
    });

    await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);

    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_old");
    // Order: release before update (otherwise update could be undone by the orphan schedule's phase 2)
    const releaseOrder = mockSchedulesRelease.mock.invocationCallOrder[0];
    const updateOrder = mockSubscriptionsUpdate.mock.invocationCallOrder[0];
    expect(releaseOrder).toBeLessThan(updateOrder);
  });

  it("contract #8: combined annual + tier downgrade + monthly target fully defers — no DB plan write, no Stripe.subscriptions.update", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
      schedule: null,
    });

    const res = await POST(jsonRequest({ plan: "home_basic", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect((db.user.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("contract #11: no Stripe subscription on the user → 400, no Stripe calls", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: null,
      plan: "home_basic",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });

    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("rejects plan=trial", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    const res = await POST(jsonRequest({ plan: "trial", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(400);
  });

  it("rejects downgrade when active yard count exceeds new limit without archiveYardIds", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "professional",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("archive_required");
    expect(body.requiredCount).toBe(3);
  });

  it("annual → monthly (same tier) creates a subscription schedule and does not update the subscription", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
      schedule: null,
    });
    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: true });
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockSchedulesCreate).toHaveBeenCalledWith({ from_subscription: "sub_1" });
    expect(mockSchedulesUpdate).toHaveBeenCalledWith(
      "schd_1",
      expect.objectContaining({
        end_behavior: "release",
        phases: [
          expect.objectContaining({ items: [{ price: "price_home_plus_annual", quantity: 1 }] }),
          expect.objectContaining({ items: [{ price: "price_home_plus_monthly", quantity: 1 }] }),
        ],
      }),
    );
  });

  it("annual + tier upgrade + monthly target: upgrades tier today on annual; schedules monthly for renewal", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_basic",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_basic_annual" } }] },
      schedule: null,
    });
    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: true });
    // Tier upgrades today on annual cadence
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", expect.objectContaining({
      items: [{ id: "si_1", price: "price_home_plus_annual" }],
      proration_behavior: "always_invoice",
    }));
    // Cadence flip scheduled for renewal
    expect(mockSchedulesUpdate).toHaveBeenCalledWith(
      "schd_1",
      expect.objectContaining({
        phases: [
          expect.objectContaining({ items: [{ price: "price_home_plus_annual", quantity: 1 }] }),
          expect.objectContaining({ items: [{ price: "price_home_plus_monthly", quantity: 1 }] }),
        ],
      }),
    );
  });

  it("annual → annual tier downgrade defers everything (no immediate update, schedule swaps tier at renewal)", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
      schedule: null,
    });
    const res = await POST(jsonRequest({ plan: "home_basic", period: "annual" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: true });
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect((db.user.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(mockSchedulesUpdate).toHaveBeenCalledWith(
      "schd_1",
      expect.objectContaining({
        phases: [
          expect.objectContaining({ items: [{ price: "price_home_plus_annual", quantity: 1 }] }),
          expect.objectContaining({
            items: [{ price: "price_home_basic_annual", quantity: 1 }],
            duration: { interval: "year", interval_count: 1 },
          }),
        ],
      }),
    );
  });

  it("annual → monthly with tier downgrade defers everything regardless of deferTier (no 409, no immediate update)", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
      schedule: null,
    });
    // No deferTier sent — should not 409 for a downgrade; route should defer
    const res = await POST(jsonRequest({ plan: "home_basic", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: true });
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    // Schedule keeps user on Plus annual until renewal, then switches to Basic monthly
    expect(mockSchedulesUpdate).toHaveBeenCalledWith(
      "schd_1",
      expect.objectContaining({
        phases: [
          expect.objectContaining({ items: [{ price: "price_home_plus_annual", quantity: 1 }] }),
          expect.objectContaining({ items: [{ price: "price_home_basic_monthly", quantity: 1 }] }),
        ],
      }),
    );
  });

  it("annual + tier downgrade doesn't archive yards today (picker happens at renewal)", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
      schedule: null,
    });
    // Plus annual (2 yards) → Basic annual (1 yard limit). No archive picker
    // needed today; the user picks at renewal when the plan actually changes.
    const res = await POST(jsonRequest({ plan: "home_basic", period: "annual" }) as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect((db.yard.updateMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("monthly → annual (same tier) updates the subscription immediately", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_1", price: { id: "price_home_plus_monthly" } }] },
      schedule: null,
    });
    const res = await POST(jsonRequest({ plan: "home_plus", period: "annual" }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deferred: false });
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", expect.objectContaining({
      items: [{ id: "si_1", price: "price_home_plus_annual" }],
    }));
    expect(mockSchedulesCreate).not.toHaveBeenCalled();
  });

  it("releases an existing pending schedule before staging a new annual → monthly switch", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "home_plus",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    // Initial retrieve says no schedule (so tier-change path doesn't trigger).
    // The second retrieve (after the tier-update) reveals an existing schedule
    // that we must release before creating the new one.
    mockSubscriptionsRetrieve
      .mockResolvedValueOnce({
        items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
        schedule: null,
      })
      .mockResolvedValueOnce({
        items: { data: [{ id: "si_1", price: { id: "price_home_plus_annual" } }] },
        schedule: "schd_old",
      });
    const res = await POST(jsonRequest({ plan: "home_plus", period: "monthly" }) as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_old");
    expect(mockSchedulesCreate).toHaveBeenCalled();
  });

  it("rejects downgrade with wrong archiveYardIds length", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      plan: "professional",
      planStatus: "active",
      stripeCustomerId: "cus_1",
    });
    (db.yard.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    const res = await POST(jsonRequest({
      plan: "home_plus",
      period: "monthly",
      archiveYardIds: ["y1"],
    }) as never, {} as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("archive_count_mismatch");
  });
});
