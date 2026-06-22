import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
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
        retrieve: vi.fn().mockResolvedValue({ items: { data: [{ id: "si_1" }] } }),
        update: vi.fn().mockResolvedValue({ id: "sub_1" }),
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
    expect(body.requiredCount).toBe(2);
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
