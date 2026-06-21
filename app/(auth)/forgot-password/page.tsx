import { Logo } from "@/components/Logo";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Logo className="h-10 w-auto" />
          <h1 className="text-3xl font-bold text-green-700">Yard Analyzer</h1>
        </div>
        <p className="text-sm text-gray-500">Your personal lawn care assistant</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
