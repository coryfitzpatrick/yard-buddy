import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

const FEATURES = [
  "AI-powered lawn diagnosis from photos",
  "Personalized care schedules by grass type",
  "Exact product amounts and spreader settings",
  "Weather-aware recommendations",
  "Issue detection: weeds, grubs, fungus & more",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-xl font-bold text-green-700">Yard Buddy</span>
        <div className="flex gap-2">
          <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
          <Link href="/register"><Button className="bg-green-600 hover:bg-green-700">Get started free</Button></Link>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Your AI lawn expert,<br />
          <span className="text-green-600">always on call.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-8 max-w-xl mx-auto">
          Stop guessing. Upload a photo, get a diagnosis, and know exactly what to apply, when, and how much.
        </p>
        <Link href="/register">
          <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8 h-14">
            Start for free — no credit card
          </Button>
        </Link>
        <div className="mt-12 grid sm:grid-cols-1 gap-3 text-left max-w-md mx-auto">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-3 text-gray-600">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
