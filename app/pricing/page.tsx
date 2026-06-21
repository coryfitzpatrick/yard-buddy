import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { CheckCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMobileApp } from "@/lib/platform.server";

export const metadata = { title: "Pricing | Yard Analyzer" };

const PLANS = [
  {
    name: "Home Basic",
    key: "home_basic",
    monthly: 7.99,
    annual: 79,
    highlight: false,
    yards: "1 yard",
    analyses: "8 analyses per yard per month",
    features: [
      "All personalized task recommendations",
      "Schedule reminders by email",
      "5-day weather integration",
      "Seasonal billing pause",
    ],
  },
  {
    name: "Home Plus",
    key: "home_plus",
    monthly: 14.99,
    annual: 139,
    highlight: true,
    yards: "Up to 3 yards",
    analyses: "8 analyses per yard per month",
    features: [
      "Everything in Home Basic",
      "Multi-yard dashboard",
      "Per-section watering and mowing schedules",
    ],
  },
  {
    name: "Professional",
    key: "professional",
    monthly: 24.99,
    annual: 229,
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
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, planStatus: true },
    });
    currentPlan = user?.plan ?? null;
    planStatus = user?.planStatus ?? null;
  }

  const isActivePaid = planStatus === "active" && currentPlan !== "trial";
  const isTrial = planStatus === "trialing" || currentPlan === "trial";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-1">
          <Logo className="h-7 w-auto" />
          <span className="text-lg font-bold text-green-700">Yard Analyzer</span>
        </Link>
        {isLoggedIn
          ? <Link href="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          : <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
        }
      </nav>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500">
            {isActivePaid
              ? "Upgrade, downgrade, or switch billing period anytime."
              : "Try free for 14 days, then pick the plan that fits."}
          </p>
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${
            isActivePaid ? "lg:grid-cols-3 lg:max-w-4xl mx-auto" : "lg:grid-cols-4"
          }`}
        >

          {/* Free Trial card */}
          {!isActivePaid && (
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
                  <span className="text-gray-400 text-sm"> for 14 days</span>
                </div>
                <p className="text-xs text-gray-400 font-medium mt-0.5">No credit card required</p>
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
                  Most popular
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
                  ${plan.annual} per year. Save 2 months.
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
                  <Link href={isLoggedIn
                    ? `/api/stripe/checkout?plan=${plan.key}&period=annual`
                    : `/register`
                  }>
                    <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500">
                      {isActivePaid ? "Switch to annual and save" : "or pay annually and save"}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-gray-400 space-y-1">
          <p>No credit card required to start your free trial.</p>
          <p>Cancel or pause anytime from your settings. Your data is retained for 30 days after cancellation.</p>
          <p className="mt-2">Questions? <a href="mailto:contact@yardanalyzer.com" className="underline text-green-600">contact@yardanalyzer.com</a></p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
