import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
        <span>&copy; {new Date().getFullYear()} Yard Analyzer. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/contact" className="hover:text-gray-600 transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms of Use</Link>
        </div>
      </div>
    </footer>
  );
}
