import Image from "next/image";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Image src="/gnome-buddy.png" alt="Yard Buddy" width={40} height={40} className="rounded-full scale-x-[-1]" />
          <h1 className="text-3xl font-bold text-green-700">Yard Buddy</h1>
        </div>
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
