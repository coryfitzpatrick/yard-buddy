import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import NotInApp from "@/components/NotInApp";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 to-emerald-100">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-6 w-auto" />
            <span className="text-gray-300">|</span>
            <span className="text-[26px] leading-none font-bold text-green-700">Yard Analyzer</span>
          </Link>
          <NotInApp>
            <Link href="/pricing"><Button variant="ghost">Pricing</Button></Link>
          </NotInApp>
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center p-4">
        {children}
      </div>
      <Footer />
    </div>
  );
}
