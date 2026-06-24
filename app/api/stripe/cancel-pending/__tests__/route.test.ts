import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

const { mockSubscriptionsRetrieve, mockSchedulesRelease } = vi.hoisted(() => ({
  mockSubscriptionsRetrieve: vi.fn(),
  mockSchedulesRelease: vi.fn(),
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    stripe: {
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
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

function emptyRequest() {
  return new Request("http://test.local/api/stripe/cancel-pending", { method: "POST" });
}

describe("cancel-pending route", () => {
  beforeEach(() => {
    mockSubscriptionsRetrieve.mockReset();
    mockSchedulesRelease.mockReset();
  });

  it("releases the schedule when one is attached", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ schedule: "schd_1" });
    const res = await POST(emptyRequest() as never, {} as never);
    expect(res.status).toBe(200);
    expect(mockSchedulesRelease).toHaveBeenCalledWith("schd_1");
  });

  it("400s when no schedule is attached", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: "sub_1",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ schedule: null });
    const res = await POST(emptyRequest() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSchedulesRelease).not.toHaveBeenCalled();
  });

  it("400s when user has no subscription", async () => {
    (db.user.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      stripeSubscriptionId: null,
    });
    const res = await POST(emptyRequest() as never, {} as never);
    expect(res.status).toBe(400);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });
});
