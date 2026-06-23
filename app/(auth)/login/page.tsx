import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { isMobileApp } from "@/lib/platform.server";

export default async function LoginPage() {
  const inApp = await isMobileApp();
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <p className="text-sm text-gray-500 text-center">Your personal lawn care assistant</p>
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
