import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <h1 className="text-3xl font-bold text-green-700">🌿 Yard Buddy</h1>
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
      </div>
      <RegisterForm />
      <p className="text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="text-green-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
