import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { CheckCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMobileApp } from "@/lib/platform.server";
import { PublicHamburger } from "@/components/PublicHamburger";

export const metadata = { title: "Pricing | Yard Analyzer" };

const PLANS = [
  {
    name: "Home Basic",
    key: "home_basic",
    monthly: 5.99,
    annual: 59.99,
    annualSavings: "Save 2 months",
    highlight: false,
    yards: "1 yard",
    analyses: "4 analyses per month",
    features: [
      "Per-section AI analysis and recommendations",
      "Per-section watering and mowing schedules",
      "All personalized task recommendations",
      "Schedule reminders by email",
      "5-day weather integration",
    ],
  },
  {
    name: "Home Plus",
    key: "home_plus",
    monthly: 9.99,
    annual: 99.99,
    annualSavings: "Save 2 months",
    highlight: true,
    yards: "Up to 2 yards",
    analyses: "8 analyses per yard per month",
    features: [
      "Everything in Home Basic",
      "Multi-yard dashboard",
      "2x the analyses per month",
    ],
  },
  {
    name: "Professional",
    key: "professional",
    monthly: 24.99,
    annual: 249.99,
    annualSavings: "Save 2 months",
    highlight: false,
    yards: "Up to 10 yards",
    analyses: "8 analyses per yard per month",
    features: [
      "Everything in Home Plus",
      "Ideal for rental owners and HOAs",
    ],
  },
];

export default async function PricingPage() {
  if (await isMobileApp()) redirect("/dashboard");

  const session = await auth();
  const isLoggedIn = !!session?.user?.id;

  let currentPlan: string | null = null;
  let planStatus: string | null = null;
  let hasEverPaid = false;
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, planStatus: true, stripeCustomerId: true },
    });
    currentPlan = user?.plan ?? null;
    planStatus = user?.planStatus ?? null;
    hasEverPaid = !!user?.stripeCustomerId;
  }

  const isActivePaid = planStatus === "active" && currentPlan !== "trial";
  const isTrial = planStatus === "trialing" || currentPlan === "trial";

  const TIER_RANK: Record<string, number> = { trial: 0, home_basic: 1, home_plus: 2, professional: 3 };
  const currentRank = currentPlan ? TIER_RANK[currentPlan] ?? -1 : -1;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-2">
          <Logo className="h-6 w-auto" />
          <span className="text-gray-300">|</span>
          <span className="text-[26px] leading-none font-bold text-green-700">Yard Analyzer</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:inline-flex">
            {isLoggedIn
              ? <Link href="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
              : <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            }
          </div>
          {!isLoggedIn && <PublicHamburger />}
        </div>
      </nav>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500">
            {isActivePaid
              ? "Upgrade or downgrade anytime. Annual is a 12-month commitment; switching to monthly takes effect at your next renewal."
              : hasEverPaid
              ? "Welcome back. Pick a plan to resume."
              : "Try free for 21 days, then pick the plan that fits."}
          </p>
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${
            isActivePaid ? "lg:grid-cols-3 lg:max-w-4xl mx-auto" : "lg:grid-cols-4"
          }`}
        >

          {/* Free Trial card */}
          {!isActivePaid && !hasEverPaid && (
            <div className={`rounded-2xl border p-6 flex flex-col ${
              isTrial ? "border-green-500 ring-2 ring-green-500 relative" : "border-gray-200 bg-gray-50"
            }`}>
              {isTrial && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Your current plan
                </div>
              )}
              <div className="mb-4">
                <p className="font-semibold text-gray-900 text-lg">Free Trial</p>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">$0</span>
                  <span className="text-gray-400 text-sm"> for 21 days</span>
                </div>
                <p className="text-xs text-gray-400 font-medium mt-0.5">No credit card required</p>
                <p className="text-xs text-emerald-700 font-medium mt-1">+7 bonus days when you set your schedule and complete a task</p>
              </div>

              <ul className="space-y-2 mb-6 flex-1 text-sm text-gray-600">
                <li className="font-semibold text-gray-900">1 yard</li>
                <li className="font-medium text-gray-700">2 analyses for your yard</li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  Your first personalized task
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  Preview of all features
                </li>
              </ul>

              <div>
                {isTrial ? (
                  <div className="w-full text-center text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg py-2">
                    Active now
                  </div>
                ) : isLoggedIn ? (
                  <div className="w-full text-center text-sm text-gray-400 bg-gray-100 border border-gray-200 rounded-lg py-2">
                    Trial not available
                  </div>
                ) : (
                  <Link href="/register">
                    <Button variant="outline" className="w-full">
                      Start free trial
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Paid plan cards */}
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-6 flex flex-col relative ${
                plan.highlight && !isActivePaid
                  ? "border-green-500 ring-2 ring-green-500"
                  : currentPlan === plan.key
                  ? "border-green-500 ring-2 ring-green-500"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && !isActivePaid && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Best value
                </div>
              )}
              {currentPlan === plan.key && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Your plan
                </div>
              )}
              <div className="mb-4">
                <p className="font-semibold text-gray-900 text-lg">{plan.name}</p>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">${plan.monthly}</span>
                  <span className="text-gray-400 text-sm"> per month</span>
                </div>
                <p className="text-xs text-green-600 font-medium mt-0.5">
                  ${plan.annual} per year. {plan.annualSavings} · 12-month commitment.
                </p>
              </div>

              <ul className="space-y-2 mb-6 flex-1 text-sm text-gray-600">
                <li className="font-semibold text-gray-900">{plan.yards}</li>
                <li className="font-medium text-gray-700">{plan.analyses}</li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                {currentPlan === plan.key ? (
                  <div className="w-full text-center text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg py-2">
                    Current plan
                  </div>
                ) : isActivePaid && TIER_RANK[plan.key] < currentRank ? (
                  <Link href={`/settings?action=downgrade&to=${plan.key}`}>
                    <Button className="w-full" variant="outline">
                      Downgrade to {plan.name}
                    </Button>
                  </Link>
                ) : isActivePaid ? (
                  <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
                    <Button className="w-full" variant="outline">
                      Switch to monthly
                    </Button>
                  </Link>
                ) : isLoggedIn ? (
                  <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
                    <Button
                      className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
                      variant={plan.highlight ? "default" : "outline"}
                    >
                      Subscribe monthly
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/register`}>
                    <Button
                      className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
                      variant={plan.highlight ? "default" : "outline"}
                    >
                      Subscribe monthly
                    </Button>
                  </Link>
                )}
                {currentPlan !== plan.key && (
                  isActivePaid && TIER_RANK[plan.key] < currentRank ? null : (
                    <Link href={isLoggedIn
                      ? `/api/stripe/checkout?plan=${plan.key}&period=annual`
                      : `/register`
                    }>
                      <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500">
                        {isActivePaid ? "Switch to annual and save" : "or pay annually and save"}
                      </Button>
                    </Link>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 max-w-2xl mx-auto">
          <details className="rounded-xl border border-gray-200 bg-white p-5 group">
            <summary className="cursor-pointer font-semibold text-gray-900 text-sm flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
              <span>How billing works</span>
              <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="mt-4 space-y-4 text-sm text-gray-600">
              <div>
                <p className="font-medium text-gray-900">Monthly vs. annual</p>
                <p className="mt-1">Monthly bills once a month, cancel anytime. Annual is a 12-month commitment: you pay for the year up front in exchange for the roughly two-month discount.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Upgrading or downgrading tiers</p>
                <p className="mt-1">Tier changes apply immediately. Upgrades are charged the prorated difference; downgrades credit the unused portion of the higher tier toward your next bill.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Switching cadences</p>
                <p className="mt-1">Switching from monthly to annual takes effect immediately and prepays the year. Switching from annual to monthly takes effect at your next renewal date because annual is a 12-month commitment.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Downgrading past your yard limit</p>
                <p className="mt-1">If your new plan supports fewer yards than you currently have, you&apos;ll pick which yard(s) to keep before the switch is confirmed. The rest are archived and can be restored within 30 days.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Cancellation</p>
                <p className="mt-1">Cancel anytime. Your access continues through the end of the current billing period. Data is retained for 30 days after that in case you re-subscribe.</p>
              </div>
              <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                See the full rules in our <Link href="/terms#billing" className="text-green-600 hover:underline">Terms of Use</Link>.
              </p>
            </div>
          </details>
        </div>

        <div className="mt-8 text-center text-sm text-gray-400 space-y-1">
          {!hasEverPaid && <p>No credit card required to start your free trial.</p>}
          <p>Cancel anytime from your settings. Your data is retained for 30 days after cancellation.</p>
          <p className="mt-2">Questions? <a href="mailto:contact@yardanalyzer.com" className="underline text-green-600">contact@yardanalyzer.com</a></p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
