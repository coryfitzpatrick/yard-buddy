import Link from "next/link";
import Image from "next/image";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Privacy Policy – Yard Buddy" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href="/" className="flex items-center gap-1">
          <Image src="/gnome-buddy.png" alt="Yard Buddy" width={28} height={28} className="rounded-full scale-x-[-1]" />
          <span className="text-lg font-bold text-green-700">Yard Buddy</span>
        </Link>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: June 10, 2026</p>

        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. What We Collect</h2>
            <p>We collect information you provide directly:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Account info:</strong> your name and email address</li>
              <li><strong>Yard and section data:</strong> ZIP code, street address, grass type, yard dimensions, soil test results, spreader equipment, and care schedules</li>
              <li><strong>Photos:</strong> images you upload for lawn analysis</li>
              <li><strong>Notification preferences:</strong> your email reminder settings</li>
            </ul>
            <p className="mt-3">We also collect limited usage data (pages visited, features used) to improve the product. We do not use advertising trackers.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide the Yard Buddy service, including AI-powered lawn analysis and personalized recommendations</li>
              <li>To send you scheduled care reminders and account notifications by email</li>
              <li>To show weather-aware recommendations for your location</li>
              <li>To improve the product based on aggregated, anonymized usage patterns</li>
            </ul>
            <p className="mt-3">We do not sell your personal information to third parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Third-Party Services</h2>
            <p>Yard Buddy relies on the following providers to operate:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Anthropic:</strong> photos and lawn data are sent to Anthropic's API for AI analysis. Anthropic's usage policies apply to this data.</li>
              <li><strong>Supabase:</strong> your data and uploaded photos are stored in Supabase's managed PostgreSQL and object storage.</li>
              <li><strong>OpenWeatherMap:</strong> your yard's ZIP code is sent to retrieve local weather data.</li>
              <li><strong>Resend:</strong> your email address is used to deliver transactional emails and care reminders.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Retention</h2>
            <p>We retain your data for as long as your account is active. If you delete your account, your personal data and uploaded photos are removed within 30 days. Anonymized aggregate data may be retained for product improvement.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Your Rights</h2>
            <p>You can access, update, or delete your account data at any time from the Settings page. To request a full export or permanent deletion of your data, email us at <a href="mailto:contact@yardbuddy.com" className="text-green-600 hover:underline">contact@yardbuddy.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Security</h2>
            <p>We use industry-standard practices to protect your data, including encrypted connections (HTTPS), hashed passwords, and access controls. No system is completely secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Children's Privacy</h2>
            <p>Yard Buddy is not directed at children under 13. We do not knowingly collect data from children. If you believe a child has provided us personal information, please contact us and we will remove it promptly.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Changes to This Policy</h2>
            <p>We may update this policy periodically. We will notify you by email if changes are material. The date at the top of this page reflects the most recent revision.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contact</h2>
            <p>Questions about this privacy policy? Email us at <a href="mailto:contact@yardbuddy.com" className="text-green-600 hover:underline">contact@yardbuddy.com</a>.</p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
