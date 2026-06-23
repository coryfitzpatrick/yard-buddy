import Link from "next/link";
import { CookiePreferencesLink } from "./CookiePreferencesLink";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-legal text-gray-400">
        <span>&copy; {new Date().getFullYear()} Null State Software LLC. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/contact" className="hover:text-gray-600 transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms of Use</Link>
          <CookiePreferencesLink className="hover:text-gray-600 transition-colors">
            Cookie preferences
          </CookiePreferencesLink>
        </div>
      </div>
    </footer>
  );
}
