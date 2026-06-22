import { describe, it, expect } from "vitest";
import { hasEverPaid, eligiblePlansForUser } from "@/lib/subscription";

describe("hasEverPaid", () => {
  it("returns false when stripeCustomerId is null", () => {
    expect(hasEverPaid({ stripeCustomerId: null })).toBe(false);
  });

  it("returns false when stripeCustomerId is undefined", () => {
    expect(hasEverPaid({})).toBe(false);
  });

  it("returns true when stripeCustomerId is set", () => {
    expect(hasEverPaid({ stripeCustomerId: "cus_123" })).toBe(true);
  });
});

describe("eligiblePlansForUser", () => {
  it("includes trial for never-paid users", () => {
    expect(eligiblePlansForUser({ stripeCustomerId: null })).toContain("trial");
  });

  it("excludes trial for ever-paid users", () => {
    expect(eligiblePlansForUser({ stripeCustomerId: "cus_123" })).not.toContain("trial");
  });

  it("always includes the three paid plans", () => {
    const paid = eligiblePlansForUser({ stripeCustomerId: "cus_123" });
    expect(paid).toEqual(expect.arrayContaining(["home_basic", "home_plus", "professional"]));
  });
});
