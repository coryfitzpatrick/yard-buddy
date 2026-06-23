import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <p className="text-sm text-gray-500 text-center">Your personal lawn care assistant</p>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
