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

  it("contract #1: no pending schedule → sets cancel_at_period_end, no release", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      planStatus: "active",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ schedule: null });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSchedulesRelease).not.toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
  });

  it("contract #2: pending schedule exists → releases schedule THEN sets cancel_at_period_end", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      planStatus: "active",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ schedule: "schd_pending" });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_pending");
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    // Order matters: release must happen before update to avoid a phase-2-fires-on-cancel-day race
    const releaseCallOrder = mockSchedulesRelease.mock.invocationCallOrder[0];
    const updateCallOrder = mockSubscriptionsUpdate.mock.invocationCallOrder[0];
    expect(releaseCallOrder).toBeLessThan(updateCallOrder);
  });

  it("contract #2b: schedule may be an object reference, not just a string", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      planStatus: "active",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ schedule: { id: "schd_pending_obj" } });

    await POST(req() as never, {} as never);
    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_pending_obj");
  });

  it("contract #3: already canceled → 400, no Stripe calls", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      planStatus: "canceled",
    });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockSchedulesRelease).not.toHaveBeenCalled();
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("no subscription → 400, no Stripe calls", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: null,
      planStatus: "active",
    });

    const res = await POST(req() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });
});
