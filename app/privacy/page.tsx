import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { PublicHamburger } from "@/components/PublicHamburger";

export const metadata = { title: "Privacy Policy | Yard Analyzer" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-6 w-auto" />
          <span className="text-gray-300">|</span>
          <span className="text-[26px] leading-none font-bold text-green-700">Yard Analyzer</span>
        </Link>
        <PublicHamburger />
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: June 22, 2026</p>

        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">

          <p>This Privacy Policy describes how Null State Software LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and protects information when you use Yard Analyzer (the &ldquo;Service&rdquo;).</p>

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
              <li>To provide the Yard Analyzer service, including automated lawn analysis and personalized recommendations</li>
              <li>To send you scheduled care reminders and account notifications by email</li>
              <li>To show weather-aware recommendations for your location</li>
              <li>To improve the product based on aggregated, anonymized usage patterns</li>
            </ul>
            <p className="mt-3">We do not sell your personal information to third parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Third-Party Services</h2>
            <p>We rely on the following providers to operate the Service:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Anthropic:</strong> photos and lawn data are sent to Anthropic&apos;s API for automated analysis. Anthropic&apos;s usage policies apply to this data.</li>
              <li><strong>Supabase:</strong> your data and uploaded photos are stored in Supabase&apos;s managed PostgreSQL and object storage.</li>
              <li><strong>OpenWeatherMap:</strong> your yard&apos;s ZIP code is sent to retrieve local weather data.</li>
              <li><strong>Resend:</strong> your email address is used to deliver transactional emails and care reminders.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Retention</h2>
            <p>We retain your data for as long as your account is active. If you delete your account, your personal data and uploaded photos are removed within 30 days. Anonymized aggregate data may be retained for product improvement.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Your Rights</h2>
            <p>You can access, update, or delete your account data at any time from the Settings page. To request a full export or permanent deletion of your data, email us at <a href="mailto:contact@nullstatesoftware.llc" className="text-green-600 hover:underline">contact@nullstatesoftware.llc</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Security</h2>
            <p>We use industry-standard practices to protect your data, including encrypted connections (HTTPS), hashed passwords, and access controls. No system is completely secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Children&apos;s Privacy</h2>
            <p>The Service is not directed at children under 13. We do not knowingly collect data from children. If you believe a child has provided us personal information, please contact us and we will remove it promptly.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Changes to This Policy</h2>
            <p>We may update this policy periodically. We will notify you by email if changes are material. The date at the top of this page reflects the most recent revision.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contact</h2>
            <p>Questions about this privacy policy? Email us at <a href="mailto:contact@nullstatesoftware.llc" className="text-green-600 hover:underline">contact@nullstatesoftware.llc</a>.</p>
            <p className="mt-2">Mailing address:</p>
            <address className="not-italic mt-1 text-gray-700">
              Null State Software LLC<br />
              8 The Green, STE B<br />
              Dover, DE 19901<br />
              United States
            </address>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
