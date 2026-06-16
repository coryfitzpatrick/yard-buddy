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
  const [email, setEmail] = useState(initialEmail);
  const [editing, setEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
  });

  async function onSubmit(data: ChangeEmailInput) {
    setServerError(null);
    setSuccess(false);
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
    setEmail(json.email ?? data.newEmail);
    setSuccess(true);
    setEditing(false);
    reset();
  }

  if (linkedToGoogle) {
    return (
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-gray-400">Email</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-900 font-medium break-all">{email}</span>
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
        {success && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">Email updated.</div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-gray-400">Email</Label>
            <div className="text-sm text-gray-900 font-medium break-all">{email}</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
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
        <div className="text-sm text-gray-500 break-all">{email}</div>
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
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => { setEditing(false); reset(); setServerError(null); }} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating…" : "Update email"}
        </Button>
      </div>
    </form>
  );
}
