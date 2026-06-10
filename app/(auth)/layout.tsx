import { Footer } from "@/components/Footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="flex-1 flex items-center justify-center p-4">
        {children}
      </div>
      <Footer />
    </div>
  );
}
