import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 to-emerald-100">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-1">
          <Logo className="h-8 w-auto" />
          <span className="text-xl font-bold text-green-700">Yard Analyzer</span>
        </Link>
        <Link href="/pricing"><Button variant="ghost">Pricing</Button></Link>
      </nav>
      <div className="flex-1 flex items-center justify-center p-4">
        {children}
      </div>
      <Footer />
    </div>
  );
}
