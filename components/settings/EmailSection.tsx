"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changeEmailSchema, ChangeEmailInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initialEmail: string;
  linkedToGoogle: boolean;
}

export function EmailSection({ initialEmail, linkedToGoogle }: Props) {
  const [editing, setEditing] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
  });

  async function onSubmit(data: ChangeEmailInput) {
    setServerError(null);
    const res = await fetch("/api/user/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setPendingEmail(json.pendingEmail ?? data.newEmail);
    setEditing(false);
    reset();
  }

  if (linkedToGoogle) {
    return (
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-gray-400">Email</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-900 font-medium break-all">{initialEmail}</span>
          <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-medium border border-blue-200">
            Linked to Google
          </span>
        </div>
        <p className="text-xs text-gray-400">
          This account signs in with Google. To use a different email, sign in with that Google account or contact support to unlink.
        </p>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {pendingEmail && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            <p className="font-medium">Confirmation sent to {pendingEmail}</p>
            <p className="text-amber-800 mt-0.5">
              Click the link in that inbox within 1 hour to finish the change. Your current email stays active until you do.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-gray-400">Email</Label>
            <div className="text-sm text-gray-900 font-medium break-all">{initialEmail}</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(true); setPendingEmail(null); }}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{serverError}</div>
      )}
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-gray-400">Current email</Label>
        <div className="text-sm text-gray-500 break-all">{initialEmail}</div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="newEmail">New email</Label>
        <Input id="newEmail" type="email" autoComplete="email" {...register("newEmail")} />
        {errors.newEmail && <p className="text-xs text-red-500">{errors.newEmail.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
        {errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}
      </div>
      <p className="text-xs text-gray-400">
        We&apos;ll send a confirmation link to the new address. The change only takes effect once you click it.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => { setEditing(false); reset(); setServerError(null); }} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send confirmation"}
        </Button>
      </div>
    </form>
  );
}
