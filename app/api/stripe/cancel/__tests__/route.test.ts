import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

const { mockSubscriptionsRetrieve, mockSubscriptionsUpdate, mockSchedulesRelease } = vi.hoisted(() => ({
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
  mockSchedulesRelease: vi.fn(),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripe: {
      subscriptions: { retrieve: mockSubscriptionsRetrieve, update: mockSubscriptionsUpdate },
      subscriptionSchedules: { release: mockSchedulesRelease },
    },
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUniqueOrThrow: vi.fn() },
  },
}));

import { POST } from "../route";
import { db } from "@/lib/db";

function req() {
  return new Request("http://test.local/api/stripe/cancel", { method: "POST" });
}

describe("cancel route", () => {
  beforeEach(() => {
    mockSubscriptionsRetrieve.mockReset();
    mockSubscriptionsUpdate.mockReset();
    mockSchedulesRelease.mockReset();
    mockSubscriptionsUpdate.mockResolvedValue({});
    mockSchedulesRelease.mockResolvedValue({});
  });

  it("contract #1: no pending schedule, active sub → sets cancel_at_period_end, no release", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "active", cancel_at_period_end: false, schedule: null });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSchedulesRelease).not.toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
  });

  it("contract #2: pending schedule exists → releases schedule THEN sets cancel_at_period_end", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "active", cancel_at_period_end: false, schedule: "schd_pending" });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_pending");
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    const releaseCallOrder = mockSchedulesRelease.mock.invocationCallOrder[0];
    const updateCallOrder = mockSubscriptionsUpdate.mock.invocationCallOrder[0];
    expect(releaseCallOrder).toBeLessThan(updateCallOrder);
  });

  it("contract #2b: schedule may be an object reference, not just a string", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "active", cancel_at_period_end: false, schedule: { id: "schd_pending_obj" } });

    await POST(req() as never, {} as never);
    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_pending_obj");
  });

  it("contract #3: Stripe says canceled → 400, no schedule release, no update", async () => {
    // Stripe is the source of truth; even if our cached planStatus lags
    // (webhook delivery delay), the route refuses on Stripe's reported state.
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "canceled", cancel_at_period_end: false, schedule: null });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSchedulesRelease).not.toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("contract #3b: cancel_at_period_end already true → 400 (no duplicate Stripe writes)", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: "active", cancel_at_period_end: true, schedule: null });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("no subscription → 400, no Stripe calls", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ stripeSubscriptionId: null });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });
});
