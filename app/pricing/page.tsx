import Link from "next/link";
import Image from "next/image";
import { CheckCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pricing – Yard Analyzer" };

const PLANS = [
  {
    name: "Home Basic",
    key: "home_basic",
    monthly: 7.99,
    annual: 79,
    highlight: false,
    yards: "1 yard",
    analyses: "2 analyses per section per month",
    features: [
      "All AI task recommendations",
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
    analyses: "3 analyses per section per month",
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
    analyses: "Unlimited analyses",
    features: [
      "Everything in Home Plus",
      "Unlimited photo analyses",
      "Ideal for rental owners and HOAs",
    ],
  },
  {
    name: "Professional Plus",
    key: "professional_plus",
    monthly: 49.99,
    annual: 449,
    highlight: false,
    yards: "Unlimited yards",
    analyses: "Unlimited analyses",
    features: [
      "Everything in Professional",
      "Unlimited yards",
      "Ideal for landscapers and property managers",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href="/" className="flex items-center gap-1">
          <Image src="/gnome-buddy.png" alt="Yard Analyzer" width={28} height={28} className="rounded-full scale-x-[-1]" />
          <span className="text-lg font-bold text-green-700">Yard Analyzer</span>
        </Link>
        <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
      </nav>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500">Start free for 14 days. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? "border-green-500 ring-2 ring-green-500 relative"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Most popular
                </div>
              )}
              <div className="mb-4">
                <p className="font-semibold text-gray-900 text-lg">{plan.name}</p>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">${plan.monthly}</span>
                  <span className="text-gray-400 text-sm"> per month</span>
                </div>
                <p className="text-xs text-green-600 font-medium mt-0.5">
                  ${plan.annual} per year — save 2 months
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
                <Link href={`/api/stripe/checkout?plan=${plan.key}&period=monthly`}>
                  <Button
                    className={`w-full ${plan.highlight ? "bg-green-600 hover:bg-green-700" : ""}`}
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    Start free trial
                  </Button>
                </Link>
                <Link href={`/api/stripe/checkout?plan=${plan.key}&period=annual`}>
                  <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500">
                    or pay annually and save
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-gray-400 space-y-1">
          <p>All plans include a 14-day free trial. No credit card required to start.</p>
          <p>Cancel or pause anytime from your settings. Your data is retained for 30 days after cancellation.</p>
          <p className="mt-2">Questions? <a href="mailto:contact@yardanalyzer.com" className="underline text-green-600">contact@yardanalyzer.com</a></p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
