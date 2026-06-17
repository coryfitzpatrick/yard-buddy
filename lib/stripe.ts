import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-05-27.dahlia",
    });
  }
  return _stripe;
}

// Lazy-resolves the underlying Stripe client on every property access. Lets
// us keep `import { stripe }` at the top of route files without crashing when
// STRIPE_SECRET_KEY is unset at module load (e.g. during prerender).
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return Reflect.get(getStripe(), prop);
  },
});

// All valid plan keys. Used to validate user input — never trust raw request params.
export const VALID_PLANS = ["home_basic", "home_plus", "professional"] as const;
export type StripePlan = typeof VALID_PLANS[number];

export const VALID_PERIODS = ["monthly", "annual"] as const;
export type StripePeriod = typeof VALID_PERIODS[number];

export const STRIPE_PRICES: Record<StripePlan, Record<StripePeriod, string>> = {
  home_basic:   { monthly: process.env.STRIPE_PRICE_HOME_BASIC_MONTHLY ?? "", annual: process.env.STRIPE_PRICE_HOME_BASIC_ANNUAL ?? "" },
  home_plus:    { monthly: process.env.STRIPE_PRICE_HOME_PLUS_MONTHLY ?? "",  annual: process.env.STRIPE_PRICE_HOME_PLUS_ANNUAL ?? "" },
  professional: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",        annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "" },
};

/** Derive plan name from a Stripe price ID. Returns null if the price is unrecognized. */
export function planFromPriceId(priceId: string): StripePlan | null {
  for (const [plan, prices] of Object.entries(STRIPE_PRICES) as [StripePlan, Record<string, string>][]) {
    if (prices.monthly === priceId || prices.annual === priceId) return plan;
  }
  return null;
}

/** Type guard: ensure a string is a valid plan key. */
export function isValidPlan(value: unknown): value is StripePlan {
  return VALID_PLANS.includes(value as StripePlan);
}

/** Type guard: ensure a string is a valid billing period. */
export function isValidPeriod(value: unknown): value is StripePeriod {
  return VALID_PERIODS.includes(value as StripePeriod);
}
