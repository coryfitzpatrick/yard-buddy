import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <p className="text-sm text-gray-500 text-center">Your personal lawn care assistant</p>
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
