import { describe, it, expect } from "vitest";
import { buildPaymentFailedEmail, buildCardExpiringEmail } from "../email";

describe("buildPaymentFailedEmail", () => {
  const opts = {
    userName: "Alex",
    billingPortalUrl: "https://billing.stripe.com/session/test",
    attemptCount: 1,
  };

  it("includes the user's name", () => {
    const { html } = buildPaymentFailedEmail(opts);
    expect(html).toContain("Alex");
  });

  it("includes billing portal link", () => {
    const { html } = buildPaymentFailedEmail(opts);
    expect(html).toContain("https://billing.stripe.com/session/test");
  });

  it("has correct subject", () => {
    const { subject } = buildPaymentFailedEmail(opts);
    expect(subject).toMatch(/payment/i);
  });

  it("mentions retry on first attempt", () => {
    const { html } = buildPaymentFailedEmail({ ...opts, attemptCount: 1 });
    expect(html.toLowerCase()).toContain("retry");
  });

  it("uses urgent language on final attempt", () => {
    const { html } = buildPaymentFailedEmail({ ...opts, attemptCount: 4 });
    expect(html.toLowerCase()).toMatch(/cancel|subscription/);
  });
});

describe("buildCardExpiringEmail", () => {
  const opts = {
    userName: "Alex",
    cardLast4: "4242",
    expiryMonth: 7,
    expiryYear: 2026,
    nextBillingDate: new Date("2026-07-15"),
    billingPortalUrl: "https://billing.stripe.com/session/test",
  };

  it("includes the user's name", () => {
    const { html } = buildCardExpiringEmail(opts);
    expect(html).toContain("Alex");
  });

  it("includes last 4 digits of card", () => {
    const { html } = buildCardExpiringEmail(opts);
    expect(html).toContain("4242");
  });

  it("includes the billing portal link", () => {
    const { html } = buildCardExpiringEmail(opts);
    expect(html).toContain("https://billing.stripe.com/session/test");
  });

  it("includes the next billing date", () => {
    const { html } = buildCardExpiringEmail(opts);
    expect(html).toContain("Jul 15");
  });

  it("has correct subject", () => {
    const { subject } = buildCardExpiringEmail(opts);
    expect(subject).toMatch(/card|expir/i);
  });
});
