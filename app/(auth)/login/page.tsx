import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/auth/LoginForm";
import { isMobileApp } from "@/lib/platform.server";

export default async function LoginPage() {
  const inApp = await isMobileApp();
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Logo className="h-7 w-auto" />
          <span className="text-gray-300 text-3xl font-light">|</span>
          <h1 className="text-3xl font-bold text-green-700">Yard Analyzer</h1>
        </div>
        <p className="text-sm text-gray-500">Your personal lawn care assistant</p>
      </div>
      <LoginForm />
      {inApp ? (
        <p className="text-sm text-gray-600">
          Need an account? Create one at yardanalyzer.com
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-green-600 font-medium hover:underline">
            Sign up
          </Link>
        </p>
      )}
    </div>
  );
}
