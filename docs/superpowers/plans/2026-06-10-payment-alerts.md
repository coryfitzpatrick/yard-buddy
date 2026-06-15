# Payment Failure & Card Expiry Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alert users when a payment fails and warn them when their credit card will expire before their next billing date.

**Architecture:** Four changes: (1) add `past_due` planStatus + `cardExpiryWarningSentAt` schema field, (2) two new email templates, (3) `invoice.payment_failed` webhook handler, (4) daily cron block that checks card expiry dates via Stripe API and sends warnings.

**Tech Stack:** Next.js App Router, Prisma, Stripe SDK v22, Resend, Vitest.

---

## File Structure

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `cardExpiryWarningSentAt DateTime?` to `User` |
| `lib/subscription.ts` | Add `past_due` to `PlanStatus` type; treat as active |
| `lib/email.ts` | Add `buildPaymentFailedEmail` and `buildCardExpiringEmail` |
| `lib/__tests__/payment-emails.test.ts` | New — tests for both email builders |
| `lib/__tests__/subscription.test.ts` | Add tests for `past_due` planStatus behavior |
| `app/api/stripe/webhook/route.ts` | Handle `invoice.payment_failed`; map `past_due` status |
| `app/api/cron/daily/route.ts` | Add card expiry check block |

---

## Task 1: Schema migration + subscription.ts update

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/subscription.ts`
- Modify: `lib/__tests__/subscription.test.ts`

- [ ] **Step 1: Add `cardExpiryWarningSentAt` to schema**

In `prisma/schema.prisma`, find the `User` model's `pausedUntil` field and add after it:

```prisma
cardExpiryWarningSentAt DateTime?
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_card_expiry_warning_sent_at
```

Expected: migration created and applied, client regenerated.

- [ ] **Step 3: Add `past_due` to `PlanStatus` type**

In `lib/subscription.ts`, change line 2:

```typescript
// From:
export type PlanStatus = "trialing" | "active" | "paused" | "expired" | "canceled";

// To:
export type PlanStatus = "trialing" | "active" | "past_due" | "paused" | "expired" | "canceled";
```

- [ ] **Step 4: Write failing tests for `past_due` behavior**

In `lib/__tests__/subscription.test.ts`, add these tests after the existing `canPause` tests:

```typescript
describe("past_due planStatus", () => {
  it("returns full plan limits when planStatus is past_due", () => {
    const limits = getPlanLimits(makeUser({ plan: "home_basic", planStatus: "past_due" }));
    expect(limits.maxYards).toBe(1);
    expect(limits.maxAnalysesPerSectionPerMonth).toBe(2);
    expect(limits.canRunAnalysis).toBe(true);
  });

  it("allows canRunAnalysis when planStatus is past_due", () => {
    expect(canRunAnalysis(makeUser({ plan: "home_plus", planStatus: "past_due" }), 2)).toBe(true);
  });

  it("blocks canPause when planStatus is past_due", () => {
    expect(canPause(makeUser({ plan: "home_basic", planStatus: "past_due" }))).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/subscription.test.ts
```

Expected: FAIL — `past_due` currently falls through to `expired` behavior.

- [ ] **Step 6: Fix `getPlanLimits` to treat `past_due` as active**

In `lib/subscription.ts`, `getPlanLimits` currently reads:

```typescript
export function getPlanLimits(user: SubscriptionUser): PlanLimits {
  if (isEffectivelyExpired(user)) return LIMITS.expired;
  if (user.planStatus === "trialing" || user.plan === "trial") return LIMITS.trial;
  return LIMITS[user.plan] ?? LIMITS.trial;
}
```

The `isEffectivelyExpired` function doesn't check `past_due` so that's fine. But `canPause` checks `planStatus !== "active"` — `past_due` should already be blocked by this. Verify the tests now pass as-is after adding the type. If `isEffectivelyExpired` doesn't catch `past_due`, tests should pass without changes. If they still fail, explicitly add `past_due` handling.

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/subscription.test.ts
```

Expected: all subscription tests pass.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/subscription.ts lib/__tests__/subscription.test.ts
git commit -m "feat: add cardExpiryWarningSentAt field and past_due planStatus"
```

---

## Task 2: Email templates

**Files:**
- Modify: `lib/email.ts`
- Create: `lib/__tests__/payment-emails.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/payment-emails.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/payment-emails.test.ts
```

Expected: FAIL — functions not exported from `../email`.

- [ ] **Step 3: Add `buildPaymentFailedEmail` to `lib/email.ts`**

Append after `buildPasswordResetEmail`:

```typescript
export function buildPaymentFailedEmail(opts: {
  userName: string;
  billingPortalUrl: string;
  attemptCount: number;
}): { subject: string; html: string } {
  const { userName, billingPortalUrl, attemptCount } = opts;
  const isFinal = attemptCount >= 4;
  const subject = isFinal
    ? "Action required: your Yard Analyzer subscription payment has failed"
    : "Payment failed for your Yard Analyzer subscription";

  const bodyText = isFinal
    ? `We were unable to process your payment after multiple attempts. To avoid losing access to your lawn care history and tasks, please update your payment method now. Your subscription will be canceled if payment cannot be collected.`
    : `We were unable to process your latest payment. We'll retry automatically — please update your payment method to make sure your subscription stays active.`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">${bodyText}</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${billingPortalUrl}" style="background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Update payment method</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    If you need help, reply to this email.
  </p>
</body>
</html>`;

  return { subject, html };
}
```

- [ ] **Step 4: Add `buildCardExpiringEmail` to `lib/email.ts`**

Append after `buildPaymentFailedEmail`:

```typescript
export function buildCardExpiringEmail(opts: {
  userName: string;
  cardLast4: string;
  expiryMonth: number;
  expiryYear: number;
  nextBillingDate: Date;
  billingPortalUrl: string;
}): { subject: string; html: string } {
  const { userName, cardLast4, expiryMonth, expiryYear, nextBillingDate, billingPortalUrl } = opts;
  const billingDateStr = nextBillingDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const expiryStr = `${String(expiryMonth).padStart(2, "0")}/${String(expiryYear).slice(-2)}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">
    Your card ending in <strong>${escapeHtml(cardLast4)}</strong> (expires ${escapeHtml(expiryStr)}) will expire before your next billing date of <strong>${escapeHtml(billingDateStr)}</strong>.
  </p>
  <p style="color:#374151;">Please update your payment method to avoid any interruption to your Yard Analyzer subscription.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${billingPortalUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Update payment method</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;">
    If you need help, reply to this email.
  </p>
</body>
</html>`;

  return {
    subject: `Your card on file for Yard Analyzer expires ${billingDateStr}`,
    html,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/payment-emails.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/__tests__/payment-emails.test.ts
git commit -m "feat: add buildPaymentFailedEmail and buildCardExpiringEmail templates"
```

---

## Task 3: Webhook — `invoice.payment_failed` handler

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

No automated tests for the webhook route; verify by running the full suite to confirm nothing regressed.

- [ ] **Step 1: Add `past_due` to the status mapping**

In `app/api/stripe/webhook/route.ts`, in the `switch (sub.status)` block inside `updateUserFromSubscription`, add `past_due`:

```typescript
switch (sub.status) {
  case "trialing":  planStatus = "trialing"; break;
  case "active":    planStatus = "active";   break;
  case "past_due":  planStatus = "past_due"; break;
  case "paused":    planStatus = "paused";   break;
  case "canceled":  planStatus = "canceled"; break;
  default:          planStatus = "expired";
}
```

- [ ] **Step 2: Add `invoice.payment_failed` case to the switch**

The webhook needs to look up the user's email and name to send an email. Add a helper to get user email from customer ID, then add the case.

In the `switch (event.type)` block, after `invoice.payment_succeeded`, add:

```typescript
case "invoice.payment_failed": {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;
  const attemptCount = invoice.attempt_count ?? 1;

  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, email: true, name: true, planStatus: true },
  });
  if (!user) break;

  // Mark as past_due if currently active
  if (user.planStatus === "active") {
    await db.user.update({
      where: { id: user.id },
      data: { planStatus: "past_due" },
    });
  }

  // Generate a billing portal session for the update link
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXTAUTH_URL ?? "https://yardanalyzer.app"}/settings`,
  });

  const { buildPaymentFailedEmail } = await import("@/lib/email");
  const { subject, html } = buildPaymentFailedEmail({
    userName: user.name ?? user.email,
    billingPortalUrl: portalSession.url,
    attemptCount,
  });

  await resend.emails.send({
    from: "Yard Analyzer <noreply@yardanalyzer.app>",
    to: user.email,
    subject,
    html,
  });

  break;
}
```

- [ ] **Step 3: Add `resend` import to webhook route**

At the top of `app/api/stripe/webhook/route.ts`, add:

```typescript
import { resend } from "@/lib/email";
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all 236+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: handle invoice.payment_failed — set past_due status and email user"
```

---

## Task 4: Daily cron — card expiry check

**Files:**
- Modify: `app/api/cron/daily/route.ts`

No automated tests for the cron route; verify by running the full suite.

- [ ] **Step 1: Add card expiry check block to cron route**

In `app/api/cron/daily/route.ts`, after the existing `// === Expired account data deletion ===` block (after the `return NextResponse.json(...)` line is NOT correct — add it before the return), insert before the final `return NextResponse.json(...)`:

```typescript
// === Card expiry warning ===
// Warn active subscribers whose card expires before their next billing date.
// Only send once: skip users warned in the last 25 days.
const expiryWarnCutoff = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
const upcomingBillingCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const activeSubscribers = await db.user.findMany({
  where: {
    planStatus: { in: ["active", "past_due"] },
    stripeCustomerId: { not: null },
    stripeSubscriptionId: { not: null },
    currentPeriodEnd: { lte: upcomingBillingCutoff, gte: today },
    OR: [
      { cardExpiryWarningSentAt: null },
      { cardExpiryWarningSentAt: { lt: expiryWarnCutoff } },
    ],
  },
  select: {
    id: true,
    email: true,
    name: true,
    stripeCustomerId: true,
    currentPeriodEnd: true,
  },
  take: 50,
});

for (const subscriber of activeSubscribers) {
  try {
    const customer = await stripe.customers.retrieve(subscriber.stripeCustomerId!, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (customer.deleted) continue;

    const pm = customer.invoice_settings?.default_payment_method;
    if (!pm || typeof pm === "string") continue;
    if (pm.type !== "card" || !pm.card) continue;

    const { exp_month, exp_year, last4 } = pm.card;
    const nextBilling = subscriber.currentPeriodEnd!;
    const billingYear = nextBilling.getUTCFullYear();
    const billingMonth = nextBilling.getUTCMonth() + 1; // 1-indexed

    const cardExpiresBeforeBilling =
      exp_year < billingYear ||
      (exp_year === billingYear && exp_month < billingMonth);

    if (!cardExpiresBeforeBilling) continue;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscriber.stripeCustomerId!,
      return_url: `${baseUrl}/settings`,
    });

    const { buildCardExpiringEmail } = await import("@/lib/email");
    const { subject, html } = buildCardExpiringEmail({
      userName: subscriber.name ?? subscriber.email,
      cardLast4: last4,
      expiryMonth: exp_month,
      expiryYear: exp_year,
      nextBillingDate: nextBilling,
      billingPortalUrl: portalSession.url,
    });

    await resend.emails.send({
      from: "Yard Analyzer <noreply@yardanalyzer.app>",
      to: subscriber.email,
      subject,
      html,
    });

    await db.user.update({
      where: { id: subscriber.id },
      data: { cardExpiryWarningSentAt: today },
    });

    console.log(`Card expiry warning sent to ${subscriber.email}`);
  } catch (err) {
    console.error(`Card expiry check failed for ${subscriber.email}:`, err);
  }
}
```

- [ ] **Step 2: Ensure `stripe` and `resend` are imported in the cron route**

Check the top of `app/api/cron/daily/route.ts` for existing imports. The file already imports `stripe` from `@/lib/stripe`. Add `resend` if not already present:

```typescript
import { resend } from "@/lib/email";
```

Also ensure `baseUrl` is already defined in scope (it's defined earlier in the route as `const baseUrl = ...`). If not, add:

```typescript
const baseUrl = process.env.NEXTAUTH_URL ?? "https://yardanalyzer.app";
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/daily/route.ts
git commit -m "feat: daily cron card expiry warning for upcoming billing renewals"
```

---

## Self-Review

**Spec coverage:**
- ✅ `invoice.payment_failed` handler — Task 3
- ✅ `past_due` planStatus (keep access during retry window) — Task 1
- ✅ Card expiry warning email — Task 2 + Task 4
- ✅ Warning sent only once per cycle (25-day dedup) — Task 4
- ✅ Only checks subscribers with billing within 30 days — Task 4
- ✅ `cardExpiryWarningSentAt` schema field — Task 1
- ✅ Email templates tested — Task 2
- ✅ Billing portal link in both emails — Task 2

**Placeholder scan:** No TBDs or vague steps.

**Type consistency:** `buildPaymentFailedEmail` and `buildCardExpiringEmail` parameter types match usage in Task 3 and Task 4.
