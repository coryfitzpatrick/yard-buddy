import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Mail } from "lucide-react";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Contact Us – Yard Analyzer" };

const TOPICS = [
  {
    label: "Billing & Payments",
    description: "Subscription questions, charges, refunds, or plan changes.",
  },
  {
    label: "Technical Support",
    description: "Bugs, errors, or anything not working as expected.",
  },
  {
    label: "General Questions",
    description: "Anything else — feature requests, feedback, or just saying hi.",
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href="/" className="flex items-center gap-1">
          <Logo className="h-7 w-auto" />
          <span className="text-lg font-bold text-green-700">Yard Analyzer</span>
        </Link>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Contact Us</h1>
        <p className="text-gray-500 mb-10">
          We&apos;re a small team and we read every message. Email us and we&apos;ll get back to you as soon as we can.
        </p>

        <a
          href="mailto:contact@yardanalyzer.com"
          className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-700 transition-colors text-white font-semibold rounded-lg px-6 py-4 text-base mb-12"
        >
          <Mail className="w-5 h-5" />
          contact@yardanalyzer.com
        </a>

        <div className="space-y-4">
          {TOPICS.map((topic) => (
            <div key={topic.label} className="rounded-lg border border-gray-200 p-4">
              <p className="font-medium text-gray-900 text-sm">{topic.label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{topic.description}</p>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
