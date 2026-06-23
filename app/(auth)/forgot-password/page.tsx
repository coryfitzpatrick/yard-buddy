import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <p className="text-sm text-gray-500 text-center">Your personal lawn care assistant</p>
      <ForgotPasswordForm />
    </div>
  );
}
