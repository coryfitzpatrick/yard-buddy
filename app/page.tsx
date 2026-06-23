import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { WhyYardAnalyzer } from "@/components/home/WhyYardAnalyzer";
import { ScreenshotSection } from "@/components/home/ScreenshotSection";
import { Footer } from "@/components/Footer";

const FEATURES = [
  "Lawn diagnosis from your photos",
  "Personalized care schedules by grass type",
  "Reminders and weather alerts by push and email",
  "Exact product amounts and spreader settings",
  "Weather-aware recommendations",
  "Issue detection: weeds, grubs, fungus & more",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-auto" />
            <span className="text-gray-300">|</span>
            <span className="text-[26px] leading-none font-bold text-green-700">Yard Analyzer</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/pricing" className="hidden sm:inline-flex"><Button variant="ghost">Pricing</Button></Link>
            <Link href="/login" className="hidden sm:inline-flex"><Button variant="ghost">Sign in</Button></Link>
            <Link href="/register"><Button size="sm" className="bg-green-600 hover:bg-green-700 sm:h-10 sm:px-4">Get started free</Button></Link>
          </div>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ya-logo.webp" alt="Yard Analyzer" className="h-40 w-auto mx-auto mb-6" />
        <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Your lawn expert,<br />
          <span className="text-green-600">always on call.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-8 max-w-xl mx-auto">
          Stop guessing. Upload a photo, get a diagnosis, and know exactly what to apply, when, and how much.
        </p>
        <Link href="/register">
          <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8 h-14">
            Start for free. No credit card needed.
          </Button>
        </Link>
        <div className="mt-12 grid gap-3 text-left max-w-md mx-auto">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-3 text-gray-600">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
      <ScreenshotSection />
      <WhyYardAnalyzer />
      <Footer />
    </div>
  );
}
